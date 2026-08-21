export type ShippingOptionsType =
  "N/A" | "Free" | "Pickup" | "Free/Pickup" | "Added Cost";

export const SHIPPING_OPTIONS = [
  "N/A",
  "Free",
  "Pickup",
  "Free/Pickup",
  "Added Cost",
] as const satisfies readonly ShippingOptionsType[];

export type ParsedShippingTag = {
  shippingType: ShippingOptionsType;
  shippingCost: number;
};

export function parseShippingTag(
  tag?: string[]
): ParsedShippingTag | undefined {
  // Only the modern 4-element format ["shipping", type, cost, currency] is accepted.
  // Legacy 1-value and 2-value shipping tags are intentionally ignored.
  if (!tag || tag[0] !== "shipping" || tag.length !== 4) {
    return;
  }

  const [, shippingType, rawShippingCost, shippingCurrency] = tag;

  // SHIPPING_OPTIONS acts as the allowlist for valid shipping types.
  // If a new shipping type is introduced in product data, it must also be
  // added to SHIPPING_OPTIONS in STATIC-VARIABLES, otherwise it will be
  // silently rejected here.
  if (
    !shippingType ||
    !shippingCurrency ||
    !SHIPPING_OPTIONS.includes(shippingType as ShippingOptionsType)
  ) {
    return;
  }

  if (rawShippingCost == null || !String(rawShippingCost).trim()) {
    return;
  }

  const shippingCost = Number(rawShippingCost);
  if (!Number.isFinite(shippingCost) || shippingCost < 0) {
    return;
  }

  return {
    shippingType: shippingType as ShippingOptionsType,
    shippingCost,
  };
}

export function parseShippingFromTags(
  tags: string[][]
): ParsedShippingTag | undefined {
  // Iterates all tags and returns the last valid shipping tag found.
  // "Last valid wins" ensures that if a product event contains both legacy
  // and modern shipping tags, the modern one (which typically appears later)
  // takes precedence. Legacy and malformed tags are skipped without error.
  let parsedShipping: ParsedShippingTag | undefined;

  for (const tag of tags) {
    if (tag[0] !== "shipping") continue;

    const parsed = parseShippingTag(tag);
    if (parsed) {
      parsedShipping = parsed;
    }
  }

  return parsedShipping;
}

export function getEffectiveShippingCost(
  shippingType?: string,
  shippingCost?: number
): number | null {
  if (!shippingType) {
    return null;
  }
  if (
    shippingType === "Free" ||
    shippingType === "Free/Pickup" ||
    shippingType === "Pickup" ||
    shippingType === "N/A"
  ) {
    return 0;
  }

  if (
    typeof shippingCost !== "number" ||
    !Number.isFinite(shippingCost) ||
    shippingCost < 0
  ) {
    return null;
  }

  return shippingCost;
}

export type ProductMonetaryInfo = {
  shippingType?: ShippingOptionsType;
  shippingCost?: number;
  price?: number;
  currency: string;
};

export const calculateTotalCost = (
  productMonetaryInfo: ProductMonetaryInfo
) => {
  const { price, shippingCost } = productMonetaryInfo;
  let total = price ?? 0;
  total += shippingCost ? shippingCost : 0;
  return total;
};

export type PricingBlock = {
  amount: number;
  currency: string;
  unit: "per item";
  shippingCost: number | null;
  shippingType: ShippingOptionsType | "N/A";
  totalEstimate: number;
  paymentMethods: string[];
};

export function buildPricingBlock(
  price: number,
  currency: string,
  shippingType?: ShippingOptionsType,
  shippingCost?: number,
  quantity = 1,
  paymentMethods: string[] = ["lightning", "cashu"]
): PricingBlock {
  const effectiveShippingCost = getEffectiveShippingCost(
    shippingType,
    shippingCost
  );
  return {
    amount: price,
    currency: currency || "sats",
    unit: "per item",
    shippingCost: effectiveShippingCost,
    shippingType: shippingType || "N/A",
    totalEstimate: price * quantity + (effectiveShippingCost ?? 0),
    paymentMethods,
  };
}
