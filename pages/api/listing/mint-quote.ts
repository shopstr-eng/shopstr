import type { NextApiRequest, NextApiResponse } from "next";
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
import { getTrustedMintUrl } from "@/utils/cashu/trusted-mints";

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };

type MintQuoteRequest = {
  productId?: string;
  formType?: ListingOrderFormType;
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: number | string;
  discountCode?: string;
};

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
    const mint = getTrustedMintUrl();

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
