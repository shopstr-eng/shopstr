import { z } from "zod";

import {
  getReviewLogicalIdentity,
  getParameterizedReplaceableCoordinate,
  mergeAndDeduplicateProducts,
  mergeAndDeduplicateReviews,
  sortEventsNewestFirst,
} from "../dedup.js";
import {
  createErrorResponse,
  createSuccessResponse,
  type ToolTextResponse,
} from "../errors.js";
import { parseReviewEvent } from "../parse-tags.js";
import {
  fetchFromRelays,
  getNewestSaturatedFilterBoundary,
} from "../relay-fetch.js";
import type {
  NostrEvent,
  NostrFilter,
  RelayFetchMeta,
  ReviewResponse,
} from "../types.js";
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
import { fetchSellerProducts, fetchSellerReviews } from "./utils/seller.js";
import {
  PaginationCursorError,
  accumulatePaginationSeen,
  applyPaginationCursor,
  assertPaginationProgress,
  createPaginationCursor,
  createQueryFingerprint,
  decodePaginationCursor,
  getPaginatedRelayLimit,
  type PaginationCursorState,
} from "./utils/pagination-cursor.js";

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
  cursor: z
    .string()
    .max(16_384)
    .optional()
    .describe(
      "Opaque pagination cursor returned by a previous request with the same lookup identifiers. It tracks consumed reviewer/target identities so stale review revisions cannot reappear."
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
  cursorState?: PaginationCursorState,
  limit = REVIEW_RESPONSE_BUDGET + 1
): NostrFilter[] {
  const filters: NostrFilter[] = [];

  for (const productAddress of productAddresses) {
    filters.push(
      createReviewFilter({
        "#d": [`a:${productAddress}`, productAddress],
        limit,
        ...(cursorState !== undefined && { until: cursorState.boundary }),
      }),
      createReviewFilter({
        "#a": [productAddress],
        limit,
        ...(cursorState !== undefined && { until: cursorState.boundary }),
      })
    );
  }

  if (productId) {
    filters.push(
      createReviewFilter({
        "#e": [productId],
        limit,
        ...(cursorState !== undefined && { until: cursorState.boundary }),
      })
    );
  }
  if (sellerPubkey) {
    filters.push(
      createReviewFilter({
        "#p": [sellerPubkey],
        limit,
        ...(cursorState !== undefined && { until: cursorState.boundary }),
      })
    );
  }

  return filters.length > 0
    ? filters
    : [
        createReviewFilter({
          limit,
          ...(cursorState !== undefined && { until: cursorState.boundary }),
        }),
      ];
}

function createCursorErrorResponse(
  error: PaginationCursorError
): ToolTextResponse {
  return createErrorResponse(error.message, error.errorCode, false);
}

function createNextCursor(
  query: string,
  cursorState: PaginationCursorState | undefined,
  boundary: number,
  consumedEvents: readonly NostrEvent[]
): string {
  const seen = accumulatePaginationSeen(
    cursorState,
    consumedEvents,
    getReviewLogicalIdentity
  );
  assertPaginationProgress(cursorState, boundary, seen);
  return createPaginationCursor({
    tool: "get_reviews",
    query,
    boundary,
    seen,
  });
}

function paginateReviewEvents(
  events: readonly NostrEvent[],
  cursorState: PaginationCursorState | undefined
): NostrEvent[] {
  return applyPaginationCursor(events, cursorState, getReviewLogicalIdentity);
}

function buildResponse(
  reviews: readonly ReviewResponse[],
  reviewEvents: readonly NostrEvent[],
  allReviews: readonly ReviewResponse[],
  query: string,
  cursorState: PaginationCursorState | undefined,
  reviewCoverage: "complete" | "partial",
  meta: ReturnType<typeof buildToolMeta>,
  addressResolutionHint?: string,
  sparseScan?: {
    rawEvents: readonly NostrEvent[];
    boundary: number | undefined;
  }
): ToolTextResponse {
  const pageReviews = reviews.slice(0, REVIEW_RESPONSE_BUDGET + 1);
  const hasMatchingReviewsBeyondPage =
    pageReviews.length > REVIEW_RESPONSE_BUDGET;
  const returnedReviews = pageReviews.slice(0, REVIEW_RESPONSE_BUDGET);
  const returnedReviewIds = new Set(returnedReviews.map((review) => review.id));
  const returnedReviewEvents = reviewEvents.filter((event) =>
    returnedReviewIds.has(event.id)
  );
  const shouldAdvanceSparseWindow =
    !hasMatchingReviewsBeyondPage &&
    sparseScan?.boundary !== undefined &&
    sparseScan.rawEvents.length > 0;
  const hasMore = hasMatchingReviewsBeyondPage || shouldAdvanceSparseWindow;
  let nextCursor: string | null = null;
  if (hasMore) {
    try {
      if (hasMatchingReviewsBeyondPage) {
        nextCursor = createNextCursor(
          query,
          cursorState,
          returnedReviewEvents[returnedReviewEvents.length - 1]!.created_at,
          returnedReviewEvents
        );
      } else {
        const returnedIds = new Set(
          returnedReviewEvents.map((event) => event.id)
        );
        nextCursor = createNextCursor(
          query,
          cursorState,
          sparseScan!.boundary!,
          sparseScan!.rawEvents.filter(
            (event) =>
              event.created_at === sparseScan!.boundary ||
              returnedIds.has(event.id)
          )
        );
      }
    } catch (error) {
      if (error instanceof PaginationCursorError) {
        return createCursorErrorResponse(error);
      }
      throw error;
    }
  }
  const hints = buildReviewHints(
    reviews.length,
    returnedReviews.length,
    addressResolutionHint
  );

  return createSuccessResponse(
    {
      count: returnedReviews.length,
      totalMatches: reviews.length,
      reviews: returnedReviews,
      ratingsSummary: calculateReputationStats(allReviews),
      reviewCoverage,
      _pagination: {
        nextCursor,
        hasMore,
      },
    },
    {
      ...meta,
      resultCount: returnedReviews.length,
      totalMatches: reviews.length,
      _truncated: hasMore,
      dataFreshness: getDataFreshness(returnedReviews),
      _hints: hints,
    },
    returnedReviews.length
  );
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

  const { productAddress, productId, sellerPubkey, cursor } = parsed.data;
  const query = createQueryFingerprint("get_reviews", [
    productId,
    productAddress,
    sellerPubkey,
    REVIEW_RESPONSE_BUDGET,
  ]);
  let cursorState: PaginationCursorState | undefined;
  if (cursor !== undefined) {
    try {
      cursorState = decodePaginationCursor(cursor, {
        tool: "get_reviews",
        query,
      });
    } catch (error) {
      if (error instanceof PaginationCursorError) {
        return createCursorErrorResponse(error);
      }
      throw error;
    }
  }

  const startedAt = Date.now();
  if (sellerPubkey && !productId && !productAddress) {
    const products = await fetchSellerProducts(sellerPubkey, context);
    if (allRelaysFailed(products.meta)) {
      return createRelayUnavailableResponse(products.meta, [
        "Could not resolve seller products to review addresses; retry later or query a specific productAddress.",
      ]);
    }

    const sellerReviews = await fetchSellerReviews(
      sellerPubkey,
      products.events,
      context
    );
    if (allRelaysFailed(sellerReviews.meta)) {
      return createRelayUnavailableResponse(sellerReviews.meta);
    }

    const paginatedReviewEvents = paginateReviewEvents(
      sellerReviews.events,
      cursorState
    );
    const paginatedReviewIds = new Set(
      paginatedReviewEvents.map((event) => event.id)
    );
    const paginatedReviews = sellerReviews.reviews.filter((review) =>
      paginatedReviewIds.has(review.id)
    );
    return buildResponse(
      paginatedReviews,
      paginatedReviewEvents,
      sellerReviews.reviews,
      query,
      cursorState,
      sellerReviews.reviewLookupPartial ? "partial" : "complete",
      {
        ...buildToolMeta(
          combineRelayMetas(
            [products.meta, sellerReviews.meta],
            Date.now() - startedAt
          )
        ),
        cached: {
          products: products.cache.products,
          reviews: sellerReviews.cache.reviews,
        },
      }
    );
  }

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
  const requestedRelayLimit = getPaginatedRelayLimit(
    REVIEW_RESPONSE_BUDGET + 1,
    cursorState
  );
  const relayFilters = buildReviewFilters(
    resolvedProductAddresses,
    productId,
    sellerPubkey,
    cursorState,
    requestedRelayLimit
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

  const sparseBoundary = getNewestSaturatedFilterBoundary(
    relayResult,
    requestedRelayLimit
  );
  const rawReviewWindow = sortEventsNewestFirst(relayResult.events).filter(
    (event) =>
      sparseBoundary === undefined || event.created_at >= sparseBoundary
  );
  let eligibleRawReviewEvents = rawReviewWindow;
  if (cursorState) {
    eligibleRawReviewEvents = applyPaginationCursor(
      rawReviewWindow,
      cursorState,
      getReviewLogicalIdentity
    );
  }
  const reviewEvents = mergeAndDeduplicateReviews(
    eligibleRawReviewEvents.filter((event) =>
      reviewMatchesTarget(
        event,
        resolvedProductAddresses,
        productId,
        sellerPubkey
      )
    )
  );
  const reviews = reviewEvents.map((event) =>
    parseReviewEvent(
      event,
      confidenceField(reviewMatchConfidence(event, resolvedProductAddresses))
    )
  );
  return buildResponse(
    reviews,
    reviewEvents,
    reviews,
    query,
    cursorState,
    reviewLookupPartial ? "partial" : "complete",
    buildToolMeta(
      combineRelayMetas(
        [...addressResolutionMetas, relayResult.meta],
        Date.now() - startedAt
      )
    ),
    addressResolutionHint,
    {
      rawEvents: rawReviewWindow,
      boundary: sparseBoundary,
    }
  );
}
