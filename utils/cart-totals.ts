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
