import type { NextApiRequest, NextApiResponse } from "next";
import { Mint as CashuMint, Wallet as CashuWallet } from "@cashu/cashu-ts";
import {
  fetchAllProfilesFromDb,
  fetchProductByDTagAndPubkey,
  fetchProductByIdFromDb,
  validateDiscountCode,
} from "@/utils/db/db-service";
import { parseTags } from "@/utils/parsers/product-parser-functions";
import { withMintRetry } from "@/utils/cashu/mint-retry-service";
import { toCashuMintAmountSats } from "@/utils/cashu/payment-amount";
import { getTrustedMintUrl } from "@/utils/cashu/trusted-mints";
import { applyRateLimit } from "@/utils/rate-limit";
import {
  CartOrderFormType,
  CartPricingItemInput,
  CartPricingProductInput,
  CartShippingPickupPreference,
  computeCartPricing,
} from "@/utils/payments/cart-pricing";
import type { NostrEvent } from "@/utils/types/types";

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };

type CartMintQuoteRequest = {
  items?: CartPricingItemInput[];
  formType?: CartOrderFormType;
  shippingPickupPreference?: CartShippingPickupPreference;
  discountCodes?: Record<string, string>;
};

type ValidatedCartPricingItemInput = CartPricingItemInput & {
  productId: string;
};

const CART_FORM_TYPES = new Set(["shipping", "contact", "combined"]);

function parseFormType(value: unknown): CartOrderFormType {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string" && CART_FORM_TYPES.has(value)) {
    return value as CartOrderFormType;
  }

  throw new Error("Invalid cart order type");
}

function parseShippingPickupPreference(
  value: unknown
): CartShippingPickupPreference {
  if (value === undefined || value === null) {
    return "shipping";
  }

  if (value === "shipping" || value === "contact") {
    return value;
  }

  throw new Error("Invalid shipping pickup preference");
}

function parseDiscountCodes(value: unknown): Record<string, string> {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Discount codes are invalid");
  }

  const discountCodes: Record<string, string> = {};
  for (const [pubkey, code] of Object.entries(value)) {
    if (typeof code !== "string") {
      throw new Error("Discount codes are invalid");
    }
    discountCodes[pubkey] = code;
  }

  return discountCodes;
}

function parseSelectedBulkOption(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "" || value === 1) {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Invalid bulk tier");
  }

  return parsed;
}

function parseOptionalString(
  value: unknown,
  label: string
): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${label} is invalid`);
  }

  return value;
}

function parseCartItems(value: unknown): ValidatedCartPricingItemInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Cart items are required");
  }

  if (value.length > 50) {
    throw new Error("Cart has too many items");
  }

  return value.map((rawItem) => {
    if (
      typeof rawItem !== "object" ||
      rawItem === null ||
      Array.isArray(rawItem)
    ) {
      throw new Error("Cart item is invalid");
    }

    const item = rawItem as Record<string, unknown>;
    const productId = item.productId;
    if (typeof productId !== "string" || !productId.trim()) {
      throw new Error("productId is required");
    }

    const quantity = item.quantity;
    if (
      quantity !== undefined &&
      (typeof quantity !== "number" ||
        !Number.isInteger(quantity) ||
        quantity < 1)
    ) {
      throw new Error("Cart item quantity must be a positive integer");
    }

    return {
      productId,
      quantity,
      selectedSize: parseOptionalString(item.selectedSize, "Selected size"),
      selectedVolume: parseOptionalString(
        item.selectedVolume,
        "Selected volume"
      ),
      selectedWeight: parseOptionalString(
        item.selectedWeight,
        "Selected weight"
      ),
      selectedBulkOption: parseSelectedBulkOption(item.selectedBulkOption),
    };
  });
}

async function fetchLatestProduct(productId: string) {
  let productEvent = await fetchProductByIdFromDb(productId);
  if (!productEvent) {
    return null;
  }

  const requestedProduct = parseTags(productEvent);
  if (!requestedProduct) {
    throw new Error("Failed to parse product data");
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
    throw new Error("Failed to parse product data");
  }

  return product;
}

function buildShopProfileMap(profileEvents: NostrEvent[]) {
  const profiles = new Map<
    string,
    { content?: { freeShippingThreshold?: number; name?: string } }
  >();

  for (const event of profileEvents) {
    if (event.kind !== 30019 || profiles.has(event.pubkey)) {
      continue;
    }

    try {
      profiles.set(event.pubkey, { content: JSON.parse(event.content) });
    } catch {
      profiles.set(event.pubkey, {});
    }
  }

  return profiles;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "cart-mint-quote", RATE_LIMIT)) {
    return;
  }

  try {
    const body =
      typeof req.body === "object" && req.body !== null
        ? (req.body as CartMintQuoteRequest)
        : {};
    const items = parseCartItems(body.items);
    const formType = parseFormType(body.formType);
    const shippingPickupPreference = parseShippingPickupPreference(
      body.shippingPickupPreference
    );
    const discountCodes = parseDiscountCodes(body.discountCodes);

    const productInputs: CartPricingProductInput[] = [];

    for (const item of items) {
      const product = await fetchLatestProduct(item.productId!);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      const discountCode = discountCodes[product.pubkey]?.trim();
      let discountPercentage = 0;

      if (discountCode) {
        const discountResult = await validateDiscountCode(
          discountCode,
          product.pubkey
        );

        if (!discountResult.valid || !discountResult.discount_percentage) {
          return res.status(400).json({
            error: `Invalid discount code for ${product.title}`,
          });
        }

        discountPercentage = discountResult.discount_percentage;
      }

      productInputs.push({
        product: { ...product, id: item.productId },
        item,
        discountPercentage,
      });
    }

    const profileEvents = await fetchAllProfilesFromDb();
    const pricing = await computeCartPricing({
      products: productInputs,
      formType,
      shippingPickupPreference,
      shopProfiles: buildShopProfileMap(profileEvents),
    });
    const amount = toCashuMintAmountSats(pricing.total);
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
      error instanceof Error ? error.message : "Failed to create cart invoice";
    return res.status(400).json({ error: message });
  }
}
