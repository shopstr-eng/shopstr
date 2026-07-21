import { getSatoshiValue } from "@getalby/lightning-tools";
import currencySelection from "@/public/currencySelection.json";
import {
  buildShippingAdjustedProductTotals,
  cartHasMixedShippingWithPickup,
  CartOrderFormType,
  computeProductPricing,
  computeSellerFreeShippingStatus,
  getCartShippingPredicate,
  ProductQuantities,
  ProductShippingTypes,
  ProductTotalsInSats,
  ShippingCostsInSats,
  ShippingPickupPreference,
  ShopProfileFreeShippingContent,
  sumProductTotalsInSats,
} from "@/utils/cart-totals";
import {
  computeListingUnitPricing,
  parseSelectedBulkOption,
  PricingValidationError,
} from "@/utils/payments/listing-pricing";
import { resolveLatestListing } from "@/utils/payments/listing-resolution";
import {
  fetchShopProfileByPubkeyFromDb,
  validateDiscountCode,
} from "@/utils/db/db-service";
import { toCashuMintAmountSats } from "@/utils/cashu/payment-amount";
import type { ProductData } from "@/utils/parsers/product-parser-functions";

const MAX_CART_ITEMS = 50;
const MAX_ITEM_QUANTITY = 10000;

export type CartQuoteItemRequest = {
  productId?: string;
  quantity?: number;
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: number | string;
};

export type CartPricingRequest = {
  items: CartQuoteItemRequest[];
  formType: CartOrderFormType;
  shippingPickupPreference?: ShippingPickupPreference;
  discountCodes?: Record<string, string>;
};

export type CartPricingResult = {
  /** Final invoice amount in sats; always equals the sum of `breakdown`. */
  amount: number;
  /** Shipping-adjusted per-product totals in sats, keyed by product id. */
  breakdown: ProductTotalsInSats;
  /** Validated per-seller discount percentages, keyed by seller pubkey. */
  appliedDiscounts: Record<string, number>;
};

/**
 * Mirrors the client cart's price conversion exactly (`convertPriceToSats` /
 * `convertShippingToSats` in pages/cart): sats pass through, supported fiat
 * converts via getSatoshiValue with Math.round, BTC multiplies by 1e8.
 * Unlike the client (which falls back to 0 and hides the product), a failed
 * conversion here is a hard error — a payment amount must never be silently
 * wrong.
 */
async function convertCartAmountToSats(
  amount: number,
  currency: string
): Promise<number> {
  const lower = currency.toLowerCase();
  if (lower === "sats" || lower === "sat") {
    return amount;
  }

  if (
    !Object.prototype.hasOwnProperty.call(
      currencySelection,
      currency.toUpperCase()
    )
  ) {
    throw new PricingValidationError(
      `${currency} is not a supported currency.`
    );
  }

  const sats = await getSatoshiValue({ amount, currency });
  if (!Number.isFinite(sats)) {
    throw new Error(`Currency conversion failed for ${currency}`);
  }
  return Math.round(sats);
}

type NormalizedCartItem = {
  productId: string;
  quantity: number;
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: number;
};

function normalizeCartItems(items: unknown): NormalizedCartItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new PricingValidationError("Cart is empty");
  }
  if (items.length > MAX_CART_ITEMS) {
    throw new PricingValidationError("Cart has too many items");
  }

  const seen = new Set<string>();
  return items.map((raw) => {
    const item = raw as CartQuoteItemRequest;
    if (!item?.productId || typeof item.productId !== "string") {
      throw new PricingValidationError("Cart item is missing a product id");
    }
    if (seen.has(item.productId)) {
      throw new PricingValidationError("Cart contains duplicate products");
    }
    seen.add(item.productId);

    const quantity = item.quantity ?? 1;
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_ITEM_QUANTITY
    ) {
      throw new PricingValidationError("Invalid quantity for cart item");
    }

    return {
      productId: item.productId,
      quantity,
      selectedSize: item.selectedSize || undefined,
      selectedVolume: item.selectedVolume || undefined,
      selectedWeight: item.selectedWeight || undefined,
      selectedBulkOption: parseSelectedBulkOption(item.selectedBulkOption),
    };
  });
}

function parseShopProfileContent(
  content: string
): ShopProfileFreeShippingContent | undefined {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object") {
      return parsed as ShopProfileFreeShippingContent;
    }
  } catch {
    // A malformed shop profile simply means no free-shipping threshold,
    // matching the client (which would not have the profile in its map).
  }
  return undefined;
}

/**
 * Server-side source of truth for cart checkout pricing. Resolves every
 * listing to its latest event, validates selections/quantities/discount
 * codes, and reuses the exact same pure pricing functions the cart UI uses
 * (computeProductPricing, computeSellerFreeShippingStatus,
 * getCartShippingPredicate, buildShippingAdjustedProductTotals) so the
 * server total matches what the buyer saw by construction.
 */
export async function computeCartPricing(
  request: CartPricingRequest
): Promise<CartPricingResult> {
  if (
    request.formType !== "shipping" &&
    request.formType !== "contact" &&
    request.formType !== "combined"
  ) {
    throw new PricingValidationError("Invalid order type for cart");
  }
  if (
    request.shippingPickupPreference !== undefined &&
    request.shippingPickupPreference !== "shipping" &&
    request.shippingPickupPreference !== "contact"
  ) {
    throw new PricingValidationError("Invalid shipping/pickup preference");
  }

  const items = normalizeCartItems(request.items);

  const resolved: Array<{
    product: ProductData;
    quantity: number;
    unitPrice: number;
    currency: string;
  }> = [];

  for (const item of items) {
    const product = await resolveLatestListing(item.productId);
    const unitPricing = computeListingUnitPricing(product, {
      selectedSize: item.selectedSize,
      selectedVolume: item.selectedVolume,
      selectedWeight: item.selectedWeight,
      selectedBulkOption: item.selectedBulkOption,
    });
    resolved.push({
      product,
      quantity: item.quantity,
      unitPrice: unitPricing.unitPrice,
      currency: unitPricing.currency,
    });
  }

  const sellerPubkeys = Array.from(
    new Set(resolved.map((entry) => entry.product.pubkey))
  );

  const appliedDiscounts: Record<string, number> = {};
  const discountCodes = request.discountCodes ?? {};
  for (const [pubkey, code] of Object.entries(discountCodes)) {
    if (typeof code !== "string" || !code.trim()) continue;
    if (!sellerPubkeys.includes(pubkey)) continue;
    const result = await validateDiscountCode(code, pubkey, { rethrow: true });
    if (!result.valid || !result.discount_percentage) {
      throw new PricingValidationError("Invalid discount code");
    }
    appliedDiscounts[pubkey] = result.discount_percentage;
  }

  const shopProfileContents = new Map<
    string,
    ShopProfileFreeShippingContent | undefined
  >();
  for (const pubkey of sellerPubkeys) {
    const profileEvent = await fetchShopProfileByPubkeyFromDb(pubkey, {
      rethrow: true,
    });
    shopProfileContents.set(
      pubkey,
      profileEvent ? parseShopProfileContent(profileEvent.content) : undefined
    );
  }

  const quantities: ProductQuantities = {};
  const shippingTypes: ProductShippingTypes = {};
  const shippingCostsInSats: ShippingCostsInSats = {};
  const baseProductTotalsInSats: ProductTotalsInSats = {};

  for (const entry of resolved) {
    const { product, quantity, unitPrice, currency } = entry;
    quantities[product.id] = quantity;
    if (product.shippingType) {
      shippingTypes[product.id] = product.shippingType;
    }

    const priceSats = await convertCartAmountToSats(unitPrice, currency);
    const shippingSats = await convertCartAmountToSats(
      product.shippingCost ?? 0,
      currency
    );
    shippingCostsInSats[product.id] = shippingSats;

    const pricing = computeProductPricing({
      id: product.id,
      priceSats,
      shippingSats,
      discountPercent: appliedDiscounts[product.pubkey] || 0,
      quantity,
    });
    if (pricing.status !== "priced") {
      throw new Error(`Failed to price cart item ${product.id}`);
    }
    baseProductTotalsInSats[product.id] = pricing.price;
  }

  const sellerFreeShippingStatus = computeSellerFreeShippingStatus({
    products: resolved.map((entry) => ({
      id: entry.product.id,
      pubkey: entry.product.pubkey,
      price: entry.unitPrice,
    })),
    quantities,
    appliedDiscounts,
    getShopProfileContent: (pubkey) => shopProfileContents.get(pubkey),
  });

  const breakdown = buildShippingAdjustedProductTotals({
    products: resolved.map((entry) => ({
      id: entry.product.id,
      pubkey: entry.product.pubkey,
    })),
    baseProductTotalsInSats,
    quantities,
    shippingTypes,
    shippingCostsInSats,
    sellerFreeShippingStatus,
    shouldAddShipping: getCartShippingPredicate({
      formType: request.formType,
      hasMixedShippingWithPickup: cartHasMixedShippingWithPickup(shippingTypes),
      shippingPickupPreference: request.shippingPickupPreference,
    }),
  });

  const amount = toCashuMintAmountSats(sumProductTotalsInSats(breakdown));

  return { amount, breakdown, appliedDiscounts };
}
