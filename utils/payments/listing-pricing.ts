import { ProductData } from "@/utils/parsers/product-parser-functions";

export type ListingOrderFormType = "shipping" | "contact" | null;

export type ListingPricingInput = {
  formType?: ListingOrderFormType;
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: number;
  discountPercentage?: number;
};

export type ListingPricingResult = {
  unitPrice: number;
  subtotal: number;
  shippingCost: number;
  total: number;
  currency: string;
};

function requireFiniteAmount(amount: number, label: string) {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${label} is invalid`);
  }
}

function getAllowedFormTypes(product: ProductData): ListingOrderFormType[] {
  if (product.shippingType === "Free/Pickup") {
    return ["shipping", "contact"];
  }

  if (
    product.shippingType === "Free" ||
    product.shippingType === "Added Cost"
  ) {
    return ["shipping"];
  }

  return ["contact"];
}

export function computeListingPricing(
  product: ProductData,
  input: ListingPricingInput = {}
): ListingPricingResult {
  const allowedFormTypes = getAllowedFormTypes(product);
  if (!input.formType || !allowedFormTypes.includes(input.formType)) {
    throw new Error("Invalid order type for listing");
  }

  if (input.selectedSize) {
    if (!product.sizes || !product.sizes.includes(input.selectedSize)) {
      throw new Error(`Invalid size selection: "${input.selectedSize}"`);
    }

    const sizeStock = product.sizeQuantities?.get(input.selectedSize);
    if (sizeStock !== undefined && sizeStock < 1) {
      throw new Error(`Insufficient stock for size "${input.selectedSize}"`);
    }
  }

  let unitPrice = product.price;

  if (input.selectedBulkOption && input.selectedBulkOption !== 1) {
    if (
      !Number.isInteger(input.selectedBulkOption) ||
      !product.bulkPrices?.has(input.selectedBulkOption)
    ) {
      throw new Error(`Invalid bulk tier: ${input.selectedBulkOption}`);
    }
    unitPrice = product.bulkPrices.get(input.selectedBulkOption)!;
  } else if (input.selectedVolume) {
    if (!product.volumes || !product.volumes.includes(input.selectedVolume)) {
      throw new Error(`Invalid volume selection: "${input.selectedVolume}"`);
    }
    const volumePrice = product.volumePrices?.get(input.selectedVolume);
    if (volumePrice !== undefined) {
      unitPrice = volumePrice;
    }
  } else if (input.selectedWeight) {
    if (!product.weights || !product.weights.includes(input.selectedWeight)) {
      throw new Error(`Invalid weight selection: "${input.selectedWeight}"`);
    }
    const weightPrice = product.weightPrices?.get(input.selectedWeight);
    if (weightPrice !== undefined) {
      unitPrice = weightPrice;
    }
  }

  requireFiniteAmount(unitPrice, "Listing price");

  const discountPercentage = input.discountPercentage ?? 0;
  if (
    !Number.isFinite(discountPercentage) ||
    discountPercentage < 0 ||
    discountPercentage > 100
  ) {
    throw new Error("Discount percentage is invalid");
  }

  const discountAmount =
    discountPercentage > 0
      ? Math.ceil(((unitPrice * discountPercentage) / 100) * 100) / 100
      : 0;
  const subtotal = unitPrice - discountAmount;
  requireFiniteAmount(subtotal, "Listing subtotal");

  const shippingCost =
    input.formType === "shipping" ? (product.shippingCost ?? 0) : 0;
  requireFiniteAmount(shippingCost, "Shipping cost");

  const total = subtotal + shippingCost;
  requireFiniteAmount(total, "Listing total");

  return {
    unitPrice,
    subtotal,
    shippingCost,
    total,
    currency: product.currency || "sats",
  };
}
