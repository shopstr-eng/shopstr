import {
  buildPricingBlock,
  getEffectiveShippingCost,
  parseProductEvent as parseCanonicalProductEvent,
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
  event: Parameters<typeof parseCanonicalProductEvent>[0]
): ProductResponse {
  const product = parseCanonicalProductEvent(event);

  return {
    ...product,
    images: product.images.slice(0, TAG_CAPS.image),
    categories: product.categories.slice(0, TAG_CAPS.t),
    ...(product.sizes && { sizes: product.sizes.slice(0, TAG_CAPS.size) }),
    ...(product.volumes && {
      volumes: product.volumes.slice(0, TAG_CAPS.volume),
    }),
    ...(product.weights && {
      weights: product.weights.slice(0, TAG_CAPS.weight),
    }),
    ...(product.bulk && { bulk: product.bulk.slice(0, TAG_CAPS.bulk) }),
    ...(product.pickupLocations && {
      pickupLocations: product.pickupLocations.slice(
        0,
        TAG_CAPS.pickup_location
      ),
    }),
    ...(product.shippingOptions && {
      shippingOptions: product.shippingOptions.slice(
        0,
        TAG_CAPS.shipping_option
      ),
    }),
  };
}
