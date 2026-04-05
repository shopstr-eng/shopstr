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
  if (!tag || tag[0] !== "shipping" || tag.length !== 4) {
    return;
  }

  const [, shippingType, rawShippingCost, shippingCurrency] = tag;

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
  if (!Number.isFinite(shippingCost)) {
    return;
  }

  return {
    shippingType: shippingType as ShippingOptionsType,
    shippingCost,
  };
}

export function getEffectiveShippingCost(
  shippingType?: string,
  shippingCost?: number
) {
  if (
    !shippingType ||
    shippingType === "Free" ||
    shippingType === "Free/Pickup" ||
    shippingType === "Pickup" ||
    shippingType === "N/A"
  ) {
    return 0;
  }

  return Number.isFinite(shippingCost) ? shippingCost : 0;
}
