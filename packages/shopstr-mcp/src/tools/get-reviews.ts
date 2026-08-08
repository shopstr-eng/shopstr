import { z } from "zod";

import {
  getParameterizedReplaceableCoordinate,
  mergeAndDeduplicateProducts,
  mergeAndDeduplicateReviews,
} from "../dedup.js";
import { createSuccessResponse, type ToolTextResponse } from "../errors.js";
import { parseReviewEvent } from "../parse-tags.js";
import { fetchFromRelays } from "../relay-fetch.js";
import type { NostrEvent, NostrFilter, RelayFetchMeta } from "../types.js";
import { reviewsInputSchema } from "../validation.js";
import {
  PRODUCT_KIND,
  REVIEW_RESPONSE_BUDGET,
  REVIEW_PRODUCT_FILTER_LIMIT,
  allRelaysFailed,
  buildToolMeta,
  combineRelayMetas,
  createRelayUnavailableResponse,
  createValidationErrorResponse,
  getDataFreshness,
} from "./utils/common.js";
import type { CoreToolContext } from "./utils/context.js";
import {
  confidenceField,
  createReviewFilter,
  eventReferencesSeller,
  hasProductAddress,
  hasTag,
  reviewMatchConfidence,
} from "./utils/review-helpers.js";
import { calculateReputationStats } from "./utils/rating-stats.js";
import { fetchSellerProducts } from "./utils/seller.js";

export const getReviewsInputSchema = {
  productId: z
    .string()
    .optional()
    .describe("Product event ID; MCP resolves it to the product address"),
  productAddress: z
    .string()
    .optional()
    .describe("Product address as 30402:<seller-pubkey>:<product-d-tag>"),
  sellerPubkey: z
    .string()
    .optional()
    .describe("Seller public key as hex or npub"),
  until: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Unix timestamp. Only return reviews created at or before this time. Use for pagination by passing the oldest createdAt from the previous response."
    ),
};

function reviewMatchesTarget(
  event: NostrEvent,
  productAddresses: readonly string[],
  productId?: string,
  sellerPubkey?: string
): boolean {
  const dTag = event.tags.find((tag) => tag[0] === "d")?.[1] ?? "";

  if (
    productAddresses.length > 0 &&
    !productAddresses.some((address) => hasProductAddress(event, address)) &&
    !(productId && hasTag(event, "e", productId))
  ) {
    return false;
  }

  if (
    productId &&
    productAddresses.length === 0 &&
    !hasTag(event, "e", productId) &&
    !dTag.includes(productId)
  ) {
    return false;
  }

  if (
    sellerPubkey &&
    !hasTag(event, "p", sellerPubkey) &&
    !eventReferencesSeller(event, sellerPubkey)
  ) {
    return false;
  }
  return true;
}

function buildReviewFilters(
  productAddresses: readonly string[],
  productId?: string,
  sellerPubkey?: string,
  until?: number,
  limit = REVIEW_RESPONSE_BUDGET + 1
): NostrFilter[] {
  const filters: NostrFilter[] = [];

  for (const productAddress of productAddresses) {
    filters.push(
      createReviewFilter({
        "#d": [`a:${productAddress}`, productAddress],
        limit,
        ...(until !== undefined && { until }),
      }),
      createReviewFilter({
        "#a": [productAddress],
        limit,
        ...(until !== undefined && { until }),
      })
    );
  }

  if (productId) {
    filters.push(
      createReviewFilter({
        "#e": [productId],
        limit,
        ...(until !== undefined && { until }),
      })
    );
  }
  if (sellerPubkey) {
    filters.push(
      createReviewFilter({
        "#p": [sellerPubkey],
        limit,
        ...(until !== undefined && { until }),
      })
    );
  }

  return filters.length > 0
    ? filters
    : [
        createReviewFilter({
          limit,
          ...(until !== undefined && { until }),
        }),
      ];
}

function addProductAddressesFromEvents(
  events: readonly NostrEvent[],
  productAddresses: Set<string>
): void {
  for (const event of mergeAndDeduplicateProducts(events)) {
    const coordinate = getParameterizedReplaceableCoordinate(event);
    if (coordinate) productAddresses.add(coordinate);
  }
}

async function resolveProductAddressFromProductId(
  productId: string,
  context: CoreToolContext
): Promise<{ address?: string; errorResponse?: ToolTextResponse }> {
  const relayResult = await fetchFromRelays(
    context.nostr,
    context.relays,
    [
      {
        kinds: [PRODUCT_KIND],
        ids: [productId],
      },
    ],
    { timeoutMs: context.timeoutMs }
  );

  if (allRelaysFailed(relayResult.meta)) {
    return {
      errorResponse: createRelayUnavailableResponse(relayResult.meta, [
        "Could not resolve productId to a product address; retry later or pass productAddress directly.",
      ]),
    };
  }

  const productEvent = relayResult.events.find(
    (event) => event.kind === PRODUCT_KIND && event.id === productId
  );

  return {
    address: productEvent
      ? getParameterizedReplaceableCoordinate(productEvent)
      : undefined,
  };
}

function buildReviewHints(
  totalMatches: number,
  returnedCount: number,
  addressResolutionHint?: string
): string[] {
  const hints: string[] = [];
  if (addressResolutionHint) hints.push(addressResolutionHint);
  if (totalMatches > returnedCount) {
    hints.push(
      "Too many reviews matched; narrow by productAddress, productId, or sellerPubkey for a smaller response."
    );
  }
  return hints;
}

export async function handleGetReviews(
  args: Record<string, unknown>,
  context: CoreToolContext
): Promise<ToolTextResponse> {
  const parsed = reviewsInputSchema.safeParse(args);
  if (!parsed.success) return createValidationErrorResponse(parsed.error);

  const startedAt = Date.now();
  const { productAddress, productId, sellerPubkey, until } = parsed.data;
  const productAddresses = new Set<string>();
  const addressResolutionMetas: RelayFetchMeta[] = [];
  if (productAddress) productAddresses.add(productAddress);

  let addressResolutionHint: string | undefined;
  if (productId && !productAddress) {
    const resolved = await resolveProductAddressFromProductId(
      productId,
      context
    );
    if (resolved.errorResponse) return resolved.errorResponse;
    if (resolved.address) {
      productAddresses.add(resolved.address);
    } else {
      addressResolutionHint =
        "Could not resolve productId to a product address; used legacy #e review lookup only.";
    }
  }

  if (sellerPubkey) {
    const products = await fetchSellerProducts(sellerPubkey, context);
    addressResolutionMetas.push(products.meta);
    if (allRelaysFailed(products.meta)) {
      return createRelayUnavailableResponse(products.meta, [
        "Could not resolve seller products to review addresses; retry later or query a specific productAddress.",
      ]);
    }
    const resolvedAddresses = new Set<string>();
    addProductAddressesFromEvents(products.events, resolvedAddresses);

    for (const address of resolvedAddresses.values()) {
      productAddresses.add(address);
    }

    if (resolvedAddresses.size === 0) {
      addressResolutionHint =
        addressResolutionHint ??
        "Could not resolve seller products to review addresses; used legacy #p review lookup only.";
    }
  }

  const allResolvedProductAddresses = Array.from(productAddresses);
  const reviewLookupPartial =
    allResolvedProductAddresses.length > REVIEW_PRODUCT_FILTER_LIMIT;
  const resolvedProductAddresses = allResolvedProductAddresses.slice(
    0,
    REVIEW_PRODUCT_FILTER_LIMIT
  );
  if (reviewLookupPartial) {
    addressResolutionHint =
      addressResolutionHint ??
      "Review lookup was partial: too many product addresses matched for complete review scanning.";
  }
  const relayFilters = buildReviewFilters(
    resolvedProductAddresses,
    productId,
    sellerPubkey,
    until,
    REVIEW_RESPONSE_BUDGET + 1
  );
  const relayResult = await fetchFromRelays(
    context.nostr,
    context.relays,
    relayFilters,
    { timeoutMs: context.timeoutMs }
  );

  if (allRelaysFailed(relayResult.meta)) {
    return createRelayUnavailableResponse(relayResult.meta);
  }

  const reviewEvents = mergeAndDeduplicateReviews(relayResult.events).filter(
    (event) =>
      reviewMatchesTarget(
        event,
        resolvedProductAddresses,
        productId,
        sellerPubkey
      )
  );
  const reviews = reviewEvents.map((event) =>
    parseReviewEvent(
      event,
      confidenceField(reviewMatchConfidence(event, resolvedProductAddresses))
    )
  );
  const pageReviews = reviews.slice(0, REVIEW_RESPONSE_BUDGET + 1);
  const hasMore = pageReviews.length > REVIEW_RESPONSE_BUDGET;
  const returnedReviews = pageReviews.slice(0, REVIEW_RESPONSE_BUDGET);
  const oldestCreatedAt =
    returnedReviews.length > 0
      ? returnedReviews[returnedReviews.length - 1]!.createdAt
      : null;
  const hints = buildReviewHints(
    reviews.length,
    returnedReviews.length,
    addressResolutionHint
  );
  const meta = buildToolMeta(
    combineRelayMetas(
      [...addressResolutionMetas, relayResult.meta],
      Date.now() - startedAt
    ),
    {
      resultCount: returnedReviews.length,
      totalMatches: reviews.length,
      truncated: hasMore,
      dataFreshness: getDataFreshness(returnedReviews),
      hints,
    }
  );

  return createSuccessResponse(
    {
      count: returnedReviews.length,
      totalMatches: reviews.length,
      reviews: returnedReviews,
      ratingsSummary: calculateReputationStats(reviews),
      reviewCoverage: reviewLookupPartial ? "partial" : "complete",
      _pagination: {
        oldestCreatedAt,
        hasMore,
      },
    },
    meta,
    returnedReviews.length
  );
}
