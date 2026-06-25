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
