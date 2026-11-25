import {
  buildPricingBlock,
  getEffectiveShippingCost,
  parseProductEventWithLimits,
  parseProfileEvent,
  parseReviewEvent as parseCanonicalReviewEvent,
  parseShippingFromTags,
  parseShippingTag,
  type ProductResponse,
} from "./generated/canonical-product-parser.js";
import type { ReviewResponse } from "./types.js";

export {
  buildPricingBlock,
  getEffectiveShippingCost,
  parseProfileEvent,
  parseShippingFromTags,
  parseShippingTag,
};

/**
 * Reviews are written by arbitrary third parties, so every reviewer-controlled
 * field is bounded before it reaches a tool response. Without these caps one
 * reviewer can publish a few oversized events against any seller or product and
 * push that target's review and reputation responses past the size an MCP
 * client will accept.
 */
export const REVIEW_LIMITS = {
  contentChars: 1_000,
  ratingKeys: 10,
  ratingKeyChars: 32,
  dTagChars: 300,
} as const;

const TRUNCATION_SUFFIX = "...";

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  let body = value.slice(0, maxChars - TRUNCATION_SUFFIX.length);
  // Do not leave half of a surrogate pair at the cut.
  const lastCodeUnit = body.charCodeAt(body.length - 1);
  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) {
    body = body.slice(0, -1);
  }
  return `${body}${TRUNCATION_SUFFIX}`;
}

function boundReviewRatings(
  ratings: Record<string, number>
): Record<string, number> {
  const bounded: Record<string, number> = {};
  let kept = 0;
  // thumb drives half of the score, so it is never the key that gets dropped.
  if (typeof ratings.thumb === "number") {
    bounded.thumb = ratings.thumb;
    kept += 1;
  }
  for (const [key, value] of Object.entries(ratings)) {
    if (kept >= REVIEW_LIMITS.ratingKeys) break;
    if (key === "thumb" || key.length > REVIEW_LIMITS.ratingKeyChars) continue;
    bounded[key] = value;
    kept += 1;
  }
  return bounded;
}

export function parseReviewEvent(
  event: Parameters<typeof parseCanonicalReviewEvent>[0],
  matchConfidence?: ReviewResponse["matchConfidence"]
): ReviewResponse {
  const review = parseCanonicalReviewEvent(event, matchConfidence);
  const content = truncateText(review.content, REVIEW_LIMITS.contentChars);

  return {
    ...review,
    ...(review.d !== undefined && {
      d: truncateText(review.d, REVIEW_LIMITS.dTagChars),
    }),
    content,
    ...(content !== review.content && { contentTruncated: true }),
    ratings: boundReviewRatings(review.ratings),
  };
}

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
