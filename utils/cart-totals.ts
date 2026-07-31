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

export const buildShippingAdjustedProductTotals = ({
  products,
  baseProductTotalsInSats,
  quantities,
  shippingTypes,
  shippingCostsInSats,
  sellerFreeShippingStatus,
  shouldAddShipping,
}: BuildShippingAdjustedProductTotalsParams): ProductTotalsInSats => {
  const updatedProductTotalsInSats = { ...baseProductTotalsInSats };

  for (const product of products) {
    const baseProductTotal = baseProductTotalsInSats[product.id] || 0;

    if (sellerFreeShippingStatus[product.pubkey]?.qualifies) {
      updatedProductTotalsInSats[product.id] = baseProductTotal;
      continue;
    }

    if (!shouldAddShipping(shippingTypes[product.id])) {
      updatedProductTotalsInSats[product.id] = baseProductTotal;
      continue;
    }

    const quantity = quantities[product.id] || 1;
    const shippingTotal = Math.ceil(
      (shippingCostsInSats[product.id] || 0) * quantity
    );

    updatedProductTotalsInSats[product.id] = baseProductTotal + shippingTotal;
  }

  return updatedProductTotalsInSats;
};

export type CartOrderFormType = "shipping" | "contact" | "combined";
export type ShippingPickupPreference = "shipping" | "contact";

/**
 * True when the cart mixes multiple shipping types AND at least one product
 * offers a pickup option — the case where the buyer is asked to choose
 * between shipping and pickup for the pickup-capable products.
 */
export const cartHasMixedShippingWithPickup = (
  shippingTypes: ProductShippingTypes
): boolean => {
  const uniqueShippingTypes = Array.from(new Set(Object.values(shippingTypes)));
  const hasShippingPickupProducts =
    uniqueShippingTypes.includes("Free/Pickup") ||
    uniqueShippingTypes.includes("Added Cost/Pickup");
  return uniqueShippingTypes.length > 1 && hasShippingPickupProducts;
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
  sellerSubtotal: number;
  sellerName: string;
}

/**
 * Per-seller free-shipping qualification, extracted verbatim from the cart
 * checkout UI so the server-side cart pricing route computes the exact same
 * qualification the buyer saw (the seller subtotal is intentionally summed
 * in raw product-currency units, mirroring the existing UI behavior).
 */
export const computeSellerFreeShippingStatus = ({
  products,
  quantities,
  appliedDiscounts,
  getShopProfileContent,
}: {
  products: FreeShippingProductInput[];
  quantities: ProductQuantities;
  appliedDiscounts: Record<string, number>;
  getShopProfileContent: (
    pubkey: string
  ) => ShopProfileFreeShippingContent | undefined;
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
      qualifies: sellerSubtotal >= content.freeShippingThreshold,
      threshold: content.freeShippingThreshold,
      currency: content.freeShippingCurrency || "USD",
      sellerSubtotal,
      sellerName: content.name || pubkey.substring(0, 8),
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
