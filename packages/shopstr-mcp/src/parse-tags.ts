import {
  buildPricingBlock,
  getEffectiveShippingCost,
  parseProductEventWithLimits,
  parseProfileEvent,
  parseReviewEvent,
  parseShippingFromTags,
  parseShippingTag,
  type ProductResponse,
} from "./generated/canonical-product-parser.js";

export {
  buildPricingBlock,
  getEffectiveShippingCost,
  parseProfileEvent,
  parseReviewEvent,
  parseShippingFromTags,
  parseShippingTag,
};

export const TAG_CAPS = {
  image: 10,
  t: 20,
  size: 50,
  volume: 50,
  weight: 50,
  bulk: 50,
  pickup_location: 20,
  shipping_option: 10,
} as const;

export function parseProductEvent(
  event: Parameters<typeof parseProductEventWithLimits>[0]
): ProductResponse {
  return parseProductEventWithLimits(event, {
    images: TAG_CAPS.image,
    categories: TAG_CAPS.t,
    sizes: TAG_CAPS.size,
    volumes: TAG_CAPS.volume,
    weights: TAG_CAPS.weight,
    bulk: TAG_CAPS.bulk,
    pickupLocations: TAG_CAPS.pickup_location,
    shippingOptions: TAG_CAPS.shipping_option,
  });
}
