import {
  SHIPPING_OPTIONS,
  ShippingOptionsType,
} from "@/utils/STATIC-VARIABLES";

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

  if (!rawShippingCost?.trim()) {
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
