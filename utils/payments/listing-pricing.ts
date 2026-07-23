import { ProductData } from "@/utils/parsers/product-parser-functions";

export type ListingOrderFormType = "shipping" | "contact" | null;

/**
 * Raised when a pricing request fails validation (bad selections, sold-out
 * listing, invalid discount, unsupported order type). API routes map this to
 * a 400 response with the error message; all other errors are treated as
 * internal and must NOT leak their message to the client.
 */
export class PricingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingValidationError";
  }
}

export type ListingSelectionInput = {
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: number;
};

export type ListingPricingInput = ListingSelectionInput & {
  formType?: ListingOrderFormType;
  discountPercentage?: number;
};

export type ListingPricingResult = {
  unitPrice: number;
  subtotal: number;
  shippingCost: number;
  total: number;
  currency: string;
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: number;
};

export type ListingUnitPricingResult = {
  unitPrice: number;
  currency: string;
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: number;
};

function requireFiniteAmount(amount: number, label: string) {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new PricingValidationError(`${label} is invalid`);
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

function hasPurchasableSizes(product: ProductData): boolean {
  return Boolean(
    product.sizes?.some((size) => (product.sizeQuantities?.get(size) ?? 0) > 0)
  );
}

function requireAvailableListing(product: ProductData) {
  if (product.status?.toLowerCase() === "sold") {
    throw new PricingValidationError("Listing is sold out");
  }

  if (product.expiration && Date.now() / 1000 > product.expiration) {
    throw new PricingValidationError("Listing has expired");
  }

  if (product.quantity !== undefined && product.quantity < 1) {
    throw new PricingValidationError("Listing is sold out");
  }

  if (
    product.sizes &&
    product.sizes.length > 0 &&
    !hasPurchasableSizes(product)
  ) {
    throw new PricingValidationError("Listing is sold out");
  }
}

/**
 * Normalizes a raw selectedBulkOption value coming from an API request body.
 * Returns undefined for "no bulk tier" sentinels (empty, 1). Throws
 * PricingValidationError for malformed values.
 */
export function parseSelectedBulkOption(value: number | string | undefined) {
  if (value === undefined || value === "" || value === 1 || value === "1") {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new PricingValidationError("Invalid bulk tier");
  }

  return parsed;
}

/**
 * Form-type-free validation + unit pricing for a single listing. Verifies the
 * listing is purchasable, that required/provided selections are valid, and
 * resolves the unit price using the same precedence the client applies
 * (bulk tier > volume > weight > base price). Shared by the single-listing
 * checkout route and the cart checkout route.
 */
export function computeListingUnitPricing(
  product: ProductData,
  input: ListingSelectionInput = {}
): ListingUnitPricingResult {
  requireAvailableListing(product);

  const requiresSize = hasPurchasableSizes(product);
  const requiresVolume = Boolean(product.volumes?.length);
  const requiresWeight = Boolean(product.weights?.length);

  if (requiresSize && !input.selectedSize) {
    throw new PricingValidationError("Size selection is required");
  }

  if (requiresVolume && !input.selectedVolume) {
    throw new PricingValidationError("Volume selection is required");
  }

  if (requiresWeight && !input.selectedWeight) {
    throw new PricingValidationError("Weight selection is required");
  }

  if (input.selectedSize) {
    if (!product.sizes || !product.sizes.includes(input.selectedSize)) {
      throw new PricingValidationError(
        `Invalid size selection: "${input.selectedSize}"`
      );
    }

    const sizeStock = product.sizeQuantities?.get(input.selectedSize);
    if (sizeStock !== undefined && sizeStock < 1) {
      throw new PricingValidationError(
        `Insufficient stock for size "${input.selectedSize}"`
      );
    }
  }

  let unitPrice = product.price;

  if (input.selectedBulkOption && input.selectedBulkOption !== 1) {
    if (
      !Number.isInteger(input.selectedBulkOption) ||
      !product.bulkPrices?.has(input.selectedBulkOption)
    ) {
      throw new PricingValidationError(
        `Invalid bulk tier: ${input.selectedBulkOption}`
      );
    }
    unitPrice = product.bulkPrices.get(input.selectedBulkOption)!;
  } else if (input.selectedVolume) {
    if (!product.volumes || !product.volumes.includes(input.selectedVolume)) {
      throw new PricingValidationError(
        `Invalid volume selection: "${input.selectedVolume}"`
      );
    }
    const volumePrice = product.volumePrices?.get(input.selectedVolume);
    if (volumePrice !== undefined) {
      unitPrice = volumePrice;
    }
  } else if (input.selectedWeight) {
    if (!product.weights || !product.weights.includes(input.selectedWeight)) {
      throw new PricingValidationError(
        `Invalid weight selection: "${input.selectedWeight}"`
      );
    }
    const weightPrice = product.weightPrices?.get(input.selectedWeight);
    if (weightPrice !== undefined) {
      unitPrice = weightPrice;
    }
  }

  requireFiniteAmount(unitPrice, "Listing price");

  return {
    unitPrice,
    currency: product.currency || "sats",
    selectedSize: input.selectedSize || undefined,
    selectedVolume: input.selectedVolume || undefined,
    selectedWeight: input.selectedWeight || undefined,
    selectedBulkOption:
      input.selectedBulkOption && input.selectedBulkOption !== 1
        ? input.selectedBulkOption
        : undefined,
  };
}

export function computeListingPricing(
  product: ProductData,
  input: ListingPricingInput = {}
): ListingPricingResult {
  const unitPricing = computeListingUnitPricing(product, input);

  const allowedFormTypes = getAllowedFormTypes(product);
  if (!input.formType || !allowedFormTypes.includes(input.formType)) {
    throw new PricingValidationError("Invalid order type for listing");
  }

  const { unitPrice, currency } = unitPricing;

  const discountPercentage = input.discountPercentage ?? 0;
  if (
    !Number.isFinite(discountPercentage) ||
    discountPercentage < 0 ||
    discountPercentage > 100
  ) {
    throw new PricingValidationError("Discount percentage is invalid");
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
    currency,
    selectedSize: unitPricing.selectedSize,
    selectedVolume: unitPricing.selectedVolume,
    selectedWeight: unitPricing.selectedWeight,
    selectedBulkOption: unitPricing.selectedBulkOption,
  };
}
