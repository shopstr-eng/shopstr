import type { NextApiRequest, NextApiResponse } from "next";
import { isIP } from "net";
import { lookup } from "dns/promises";
import { getSatoshiValue } from "@getalby/lightning-tools";
import { Mint as CashuMint, Wallet as CashuWallet } from "@cashu/cashu-ts";
import {
  fetchProductByDTagAndPubkey,
  fetchProductByIdFromDb,
  validateDiscountCode,
} from "@/utils/db/db-service";
import { parseTags } from "@/utils/parsers/product-parser-functions";
import { withMintRetry } from "@/utils/cashu/mint-retry-service";
import { toCashuMintAmountSats } from "@/utils/cashu/payment-amount";
import { computeListingPricing } from "@/utils/payments/listing-pricing";
import type { ListingOrderFormType } from "@/utils/payments/listing-pricing";
import { applyRateLimit } from "@/utils/rate-limit";

const DEFAULT_MINT_URL = "https://mint.minibits.cash/Bitcoin";
const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };

type MintQuoteRequest = {
  productId?: string;
  mintUrl?: string;
  formType?: ListingOrderFormType;
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: number | string;
  discountCode?: string;
};

async function parseMintUrl(mintUrl?: string): Promise<string> {
  const mint = mintUrl?.trim() || DEFAULT_MINT_URL;
  const parsed = new URL(mint);
  const allowInsecureLocalDev =
    process.env.NODE_ENV !== "production" && parsed.protocol === "http:";

  if (parsed.protocol !== "https:" && !allowInsecureLocalDev) {
    throw new Error("Invalid mint URL");
  }

  await assertPublicMintHostname(parsed.hostname);

  return parsed.toString().replace(/\/$/, "");
}

async function assertPublicMintHostname(hostname: string): Promise<void> {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (isBlockedIpAddress(normalized)) {
    throw new Error("Invalid mint URL");
  }

  if (isIP(normalized)) {
    return;
  }

  if (isBlockedHostname(normalized)) {
    throw new Error("Invalid mint URL");
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = (await lookup(normalized, {
      all: true,
      verbatim: true,
    })) as Array<{ address: string; family: number }>;
  } catch {
    throw new Error("Invalid mint URL");
  }

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isBlockedIpAddress(address))
  ) {
    throw new Error("Invalid mint URL");
  }
}

function isBlockedHostname(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    !hostname.includes(".")
  ) {
    return true;
  }

  return false;
}

function isBlockedIpAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");

  if (normalized.startsWith("::ffff:")) {
    return true;
  }

  if (isIP(normalized) === 4) {
    return isBlockedIpv4Address(normalized);
  }

  if (isIP(normalized) === 6) {
    return isBlockedIpv6Address(normalized);
  }

  return false;
}

function isBlockedIpv4Address(address: string): boolean {
  const [first = 0, second = 0, third = 0] = address.split(".").map(Number);

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function isBlockedIpv6Address(address: string): boolean {
  const normalized = address.toLowerCase();
  const firstSegment = normalized.split(":")[0] ?? "";
  const firstHextet = Number.parseInt(firstSegment, 16);

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    (Number.isFinite(firstHextet) && (firstHextet & 0xffc0) === 0xfe80) ||
    normalized.startsWith("ff")
  );
}

function parseSelectedBulkOption(value: number | string | undefined) {
  if (value === undefined || value === "" || value === 1 || value === "1") {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Invalid bulk tier");
  }

  return parsed;
}

async function convertListingTotalToSats(total: number, currency: string) {
  const normalizedCurrency = currency.toLowerCase();
  if (normalizedCurrency === "sats" || normalizedCurrency === "sat") {
    return toCashuMintAmountSats(total);
  }

  const sats = await getSatoshiValue({
    amount: total,
    currency,
  });

  return toCashuMintAmountSats(Math.round(sats));
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "listing-mint-quote", RATE_LIMIT)) {
    return;
  }

  const {
    productId,
    mintUrl,
    formType = null,
    selectedSize,
    selectedVolume,
    selectedWeight,
    selectedBulkOption,
    discountCode,
  } = req.body as MintQuoteRequest;

  if (!productId) {
    return res.status(400).json({ error: "productId is required" });
  }

  try {
    let productEvent = await fetchProductByIdFromDb(productId);

    if (!productEvent) {
      return res.status(404).json({ error: "Product not found" });
    }

    const requestedProduct = parseTags(productEvent);
    if (!requestedProduct) {
      return res.status(500).json({ error: "Failed to parse product data" });
    }

    if (requestedProduct.d) {
      productEvent =
        (await fetchProductByDTagAndPubkey(
          requestedProduct.d,
          requestedProduct.pubkey
        )) ?? productEvent;
    }

    const product = parseTags(productEvent);
    if (!product) {
      return res.status(500).json({ error: "Failed to parse product data" });
    }

    let discountPercentage = 0;
    if (discountCode?.trim()) {
      const discountResult = await validateDiscountCode(
        discountCode,
        product.pubkey
      );

      if (!discountResult.valid || !discountResult.discount_percentage) {
        return res.status(400).json({ error: "Invalid discount code" });
      }

      discountPercentage = discountResult.discount_percentage;
    }

    const pricing = computeListingPricing(product, {
      formType,
      selectedSize,
      selectedVolume,
      selectedWeight,
      selectedBulkOption: parseSelectedBulkOption(selectedBulkOption),
      discountPercentage,
    });
    const amount = await convertListingTotalToSats(
      pricing.total,
      pricing.currency
    );
    const mint = await parseMintUrl(mintUrl);

    const wallet = new CashuWallet(new CashuMint(mint));
    await wallet.loadMint();

    const mintQuote = await withMintRetry(
      () => wallet.createMintQuoteBolt11(amount),
      { maxAttempts: 4, perAttemptTimeoutMs: 15000, totalTimeoutMs: 60000 }
    );

    return res.status(200).json({
      request: mintQuote.request,
      quote: mintQuote.quote,
      amount,
      mintUrl: mint,
      pricing,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create listing invoice";
    return res.status(400).json({ error: message });
  }
}
