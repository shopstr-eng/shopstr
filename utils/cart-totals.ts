import { getEffectiveShippingCost } from "@/utils/parsers/product-tag-helpers";

export interface CartTotalsProduct {
  id: string;
  pubkey: string;
}

export type ProductTotalsInSats = Record<string, number>;
export type ProductQuantities = Record<string, number>;
export type ProductShippingTypes = Record<string, string>;
export type ShippingCostsInSats = Record<string, number>;
export type SellerFreeShippingStatus = Record<
  string,
  { qualifies: boolean } | undefined
>;

interface BuildShippingAdjustedProductTotalsParams {
  products: CartTotalsProduct[];
  baseProductTotalsInSats: ProductTotalsInSats;
  quantities: ProductQuantities;
  shippingTypes: ProductShippingTypes;
  shippingCostsInSats: ShippingCostsInSats;
  sellerFreeShippingStatus: SellerFreeShippingStatus;
  shouldAddShipping: (shippingType?: string) => boolean;
}

export const sumProductTotalsInSats = (
  productTotalsInSats: ProductTotalsInSats
) =>
  Object.values(productTotalsInSats).reduce(
    (total, amount) => total + amount,
    0
  );

/**
 * Per-unit shipping cost the cart may charge for a listing, in the listing's
 * own currency. Only "Added Cost" listings carry a fee: every other shipping
 * type is free by definition, even if its shipping tag holds a non-zero cost.
 */
export const getCartUnitShippingCost = (product: {
  shippingType?: string;
  shippingCost?: number;
}): number =>
  getEffectiveShippingCost(product.shippingType, product.shippingCost) ?? 0;

type ProductShippingParams = Omit<
  BuildShippingAdjustedProductTotalsParams,
  "products" | "baseProductTotalsInSats"
>;

/**
 * Shipping (in sats) a product would cost before any free-shipping waiver,
 * or 0 when the chosen order type does not ship it.
 */
const getShippingBeforeWaiverInSats = (
  product: CartTotalsProduct,
  {
    quantities,
    shippingTypes,
    shippingCostsInSats,
    shouldAddShipping,
  }: Omit<ProductShippingParams, "sellerFreeShippingStatus">
): number => {
  if (!shouldAddShipping(shippingTypes[product.id])) return 0;
  const quantity = quantities[product.id] || 1;
  return Math.ceil((shippingCostsInSats[product.id] || 0) * quantity);
};

export const buildShippingAdjustedProductTotals = ({
  products,
  baseProductTotalsInSats,
  ...shippingParams
}: BuildShippingAdjustedProductTotalsParams): ProductTotalsInSats => {
  const updatedProductTotalsInSats = { ...baseProductTotalsInSats };

  for (const product of products) {
    const baseProductTotal = baseProductTotalsInSats[product.id] || 0;

    if (shippingParams.sellerFreeShippingStatus[product.pubkey]?.qualifies) {
      updatedProductTotalsInSats[product.id] = baseProductTotal;
      continue;
    }

    updatedProductTotalsInSats[product.id] =
      baseProductTotal + getShippingBeforeWaiverInSats(product, shippingParams);
  }

  return updatedProductTotalsInSats;
};

/**
 * Total shipping (in sats) removed by free-shipping thresholds: what the
 * buyer would have paid for the shipped products of qualifying sellers.
 */
export const computeWaivedShippingInSats = ({
  products,
  ...shippingParams
}: Omit<
  BuildShippingAdjustedProductTotalsParams,
  "baseProductTotalsInSats"
>): number =>
  products.reduce(
    (waived, product) =>
      shippingParams.sellerFreeShippingStatus[product.pubkey]?.qualifies
        ? waived + getShippingBeforeWaiverInSats(product, shippingParams)
        : waived,
    0
  );

export type CartOrderFormType = "shipping" | "contact" | "combined";
export type ShippingPickupPreference = "shipping" | "contact";

/**
 * True when the cart mixes multiple shipping types AND at least one product
 * is "Free/Pickup" — the case where the buyer is asked to choose between
 * shipping and pickup for those products.
 */
export const cartHasMixedShippingWithPickup = (
  shippingTypes: ProductShippingTypes
): boolean => {
  const uniqueShippingTypes = Array.from(new Set(Object.values(shippingTypes)));
  return (
    uniqueShippingTypes.length > 1 &&
    uniqueShippingTypes.includes("Free/Pickup")
  );
};

/**
 * The single source of truth for which products get shipping added during
 * cart checkout, shared by the client UI and the server-side cart pricing
 * route so both always compute the same totals:
 * - "shipping": every product ships.
 * - "contact": nothing ships (contact/pickup only).
 * - "combined" without a mixed-pickup choice: only "Added Cost"/"Free" ship.
 * - "combined" with mixed pickup, buyer prefers shipping: "Free/Pickup"
 *   products ship too.
 * - "combined" with mixed pickup, buyer prefers pickup: only
 *   "Added Cost"/"Free" ship.
 */
export const getCartShippingPredicate = ({
  formType,
  hasMixedShippingWithPickup,
  shippingPickupPreference,
}: {
  formType: CartOrderFormType;
  hasMixedShippingWithPickup: boolean;
  shippingPickupPreference?: ShippingPickupPreference;
}): ((shippingType?: string) => boolean) => {
  if (formType === "shipping") {
    return () => true;
  }
  if (formType === "contact") {
    return () => false;
  }
  if (hasMixedShippingWithPickup && shippingPickupPreference === "shipping") {
    return (shippingType?: string) =>
      shippingType === "Added Cost" ||
      shippingType === "Free" ||
      shippingType === "Free/Pickup";
  }
  return (shippingType?: string) =>
    shippingType === "Added Cost" || shippingType === "Free";
};

export interface FreeShippingProductInput {
  id: string;
  pubkey: string;
  price: number;
  currency?: string;
  bulkPrice?: number;
  volumePrice?: number;
  weightPrice?: number;
}

export interface ShopProfileFreeShippingContent {
  freeShippingThreshold?: number;
  freeShippingCurrency?: string;
  name?: string;
}

export interface FreeShippingStatusEntry {
  qualifies: boolean;
  threshold: number;
  currency: string;
  /** The seller's discounted subtotal, expressed in the threshold currency. */
  sellerSubtotal: number;
  sellerName: string;
}

const normalizeCurrency = (currency?: string) => {
  const lower = (currency || "").trim().toLowerCase();
  return lower === "sat" ? "sats" : lower;
};

/**
 * Sellers whose free-shipping threshold is in a different currency than at
 * least one of their cart products. Only these thresholds need converting to
 * sats; a seller whose products all share the threshold currency (or who set
 * no threshold currency) is compared exactly in that currency.
 */
export const getFreeShippingThresholdsToConvert = ({
  products,
  getShopProfileContent,
}: {
  products: Array<{ pubkey: string; currency?: string }>;
  getShopProfileContent: (
    pubkey: string
  ) => ShopProfileFreeShippingContent | undefined;
}): Array<{ pubkey: string; threshold: number; currency: string }> => {
  const toConvert = new Map<
    string,
    { pubkey: string; threshold: number; currency: string }
  >();
  for (const product of products) {
    if (toConvert.has(product.pubkey)) continue;
    const content = getShopProfileContent(product.pubkey);
    const threshold = content?.freeShippingThreshold;
    const currency = content?.freeShippingCurrency;
    if (!threshold || threshold <= 0 || !currency) continue;
    if (normalizeCurrency(product.currency) !== normalizeCurrency(currency)) {
      toConvert.set(product.pubkey, {
        pubkey: product.pubkey,
        threshold,
        currency,
      });
    }
  }
  return Array.from(toConvert.values());
};

/**
 * Per-seller free-shipping qualification, shared by the cart UI and the
 * server-side cart pricing route so both compute the same result.
 *
 * When all of a seller's products are priced in the threshold currency, the
 * discounted subtotal is compared exactly in that currency. When currencies
 * differ, both sides are compared in sats: the seller's discounted product
 * totals (`productTotalsInSats`) against the threshold converted to sats
 * (`freeShippingThresholdsInSats`). A threshold that could not be converted
 * never qualifies, so shipping is charged rather than silently waived.
 */
export const computeSellerFreeShippingStatus = ({
  products,
  quantities,
  appliedDiscounts,
  getShopProfileContent,
  productTotalsInSats = {},
  freeShippingThresholdsInSats = {},
}: {
  products: FreeShippingProductInput[];
  quantities: ProductQuantities;
  appliedDiscounts: Record<string, number>;
  getShopProfileContent: (
    pubkey: string
  ) => ShopProfileFreeShippingContent | undefined;
  productTotalsInSats?: ProductTotalsInSats;
  freeShippingThresholdsInSats?: Record<string, number>;
}): Record<string, FreeShippingStatusEntry> => {
  const statusMap: Record<string, FreeShippingStatusEntry> = {};
  const productsBySeller: Record<string, FreeShippingProductInput[]> = {};
  products.forEach((p) => {
    if (!productsBySeller[p.pubkey]) productsBySeller[p.pubkey] = [];
    productsBySeller[p.pubkey]!.push(p);
  });

  Object.entries(productsBySeller).forEach(([pubkey, sellerProducts]) => {
    const content = getShopProfileContent(pubkey);
    if (!content?.freeShippingThreshold || content.freeShippingThreshold <= 0)
      return;
    const threshold = content.freeShippingThreshold;
    const thresholdCurrency = content.freeShippingCurrency;
    const sellerName = content.name || pubkey.substring(0, 8);

    const isSameCurrency =
      !thresholdCurrency ||
      sellerProducts.every(
        (product) =>
          normalizeCurrency(product.currency) ===
          normalizeCurrency(thresholdCurrency)
      );

    if (isSameCurrency) {
      let sellerSubtotal = 0;
      sellerProducts.forEach((product) => {
        const discount = appliedDiscounts[pubkey] || 0;
        const basePrice =
          product.bulkPrice !== undefined
            ? product.bulkPrice
            : product.volumePrice !== undefined
              ? product.volumePrice
              : product.weightPrice !== undefined
                ? product.weightPrice
                : product.price;
        const qty = quantities[product.id] || 1;
        const discountedPrice =
          discount > 0 ? basePrice * (1 - discount / 100) : basePrice;
        sellerSubtotal += discountedPrice * qty;
      });
      statusMap[pubkey] = {
        qualifies: sellerSubtotal >= threshold,
        threshold,
        currency: thresholdCurrency || "USD",
        sellerSubtotal,
        sellerName,
      };
      return;
    }

    const thresholdInSats = freeShippingThresholdsInSats[pubkey];
    const sellerSubtotalInSats = sellerProducts.reduce(
      (sum, product) => sum + (productTotalsInSats[product.id] || 0),
      0
    );
    const canCompare =
      thresholdInSats !== undefined &&
      Number.isFinite(thresholdInSats) &&
      thresholdInSats > 0;
    statusMap[pubkey] = {
      qualifies: canCompare && sellerSubtotalInSats >= thresholdInSats,
      threshold,
      currency: thresholdCurrency,
      sellerSubtotal: canCompare
        ? (sellerSubtotalInSats / thresholdInSats) * threshold
        : 0,
      sellerName,
    };
  });
  return statusMap;
};

export type ProductPricingResult =
  | { id: string; status: "priced"; price: number; shipping: number }
  | { id: string; status: "error" }
  | { id: string; status: "skipped" };

export interface ComputeProductPricingParams {
  id: string;
  priceSats: number;
  shippingSats: number;
  discountPercent: number;
  quantity: number | undefined;
}

/**
 * Pure per-product cart pricing computation. Takes already-converted sat
 * amounts plus the seller discount and selected quantity, applies the discount
 * (rounding up), then scales by quantity (rounding up). The "error" variant is
 * never produced here — it is reserved for the caller's conversion try/catch.
 */
export const computeProductPricing = ({
  id,
  priceSats,
  shippingSats,
  discountPercent,
  quantity,
}: ComputeProductPricingParams): ProductPricingResult => {
  let discountedPrice = priceSats;
  if (discountPercent > 0) {
    discountedPrice = Math.ceil(priceSats * (1 - discountPercent / 100));
  }

  if (discountedPrice !== null || shippingSats !== null) {
    const price = quantity
      ? Math.ceil(discountedPrice * quantity)
      : discountedPrice;
    const shipping = quantity
      ? Math.ceil(shippingSats * quantity)
      : shippingSats;
    return { id, status: "priced", price, shipping };
  }

  return { id, status: "skipped" };
};
