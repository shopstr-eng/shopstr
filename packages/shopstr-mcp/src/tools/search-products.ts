import { z } from "zod";

import {
  getProductLogicalIdentity,
  mergeAndDeduplicateProducts,
  sortEventsNewestFirst,
} from "../dedup.js";
import {
  createErrorResponse,
  createSuccessResponse,
  type ToolTextResponse,
} from "../errors.js";
import { parseProductEvent } from "../parse-tags.js";
import {
  fetchFromRelays,
  getNewestSaturatedFilterBoundary,
} from "../relay-fetch.js";
import type { NostrEvent, NostrFilter, ProductResponse } from "../types.js";
import { searchProductsSchema } from "../validation.js";
import {
  PRODUCT_KIND,
  PRODUCT_RESPONSE_BUDGET,
  allRelaysFailed,
  buildToolMeta,
  combineRelayMetas,
  createRelayUnavailableResponse,
  createValidationErrorResponse,
  getDataFreshness,
  getCategoryQueryVariants,
  normalizeCategoryTag,
  observeProductEventsForCategories,
} from "./utils/common.js";
import type { CoreToolContext } from "./utils/context.js";
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

export const searchProductsInputSchema = {
  keyword: z
    .string()
    .max(200)
    .optional()
    .describe("Search keyword to match against product title or summary"),
  category: z.string().max(100).optional().describe("Product category tag"),
  location: z.string().max(100).optional().describe("Product location"),
  minPrice: z.number().min(0).finite().optional().describe("Minimum price"),
  maxPrice: z.number().min(0).finite().optional().describe("Maximum price"),
  currency: z
    .string()
    .max(10)
    .optional()
    .describe("Currency code required when using price filters or price sort"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe(
      `Requested result count. Responses are capped at ${PRODUCT_RESPONSE_BUDGET} products for MCP token budgeting.`
    ),
  cursor: z
    .string()
    .max(16_384)
    .optional()
    .describe(
      "Opaque pagination cursor returned by a previous newest-first search with the same case-insensitive filters. It tracks consumed logical product coordinates so stale revisions cannot reappear. Cursors are not supported with price sorting."
    ),
  sortBy: z
    .enum(["newest", "price_asc", "price_desc"])
    .optional()
    .describe(
      "Sort returned products by newest first, ascending known price, or descending known price. currency is required for price_asc and price_desc. Unknown-price products are placed last for price sorts."
    ),
};

type SearchProductsInput = z.infer<typeof searchProductsSchema>;

function productMatchesFilters(
  product: ProductResponse,
  filters: SearchProductsInput
): boolean {
  // hidden products never returned in search results.
  if (product.visibility === "hidden") return false;

  if (filters.keyword) {
    const keyword = filters.keyword.toLowerCase();
    const searchableText = [
      product.title,
      product.summary,
      product.location,
      product.condition,
      product.productFormat,
      product.status,
      ...product.categories,
    ]
      .join(" ")
      .toLowerCase();
    if (!searchableText.includes(keyword)) return false;
  }

  if (filters.category) {
    const category = normalizeCategoryTag(filters.category);
    if (
      !product.categories.some(
        (value) => normalizeCategoryTag(value) === category
      )
    ) {
      return false;
    }
  }

  if (filters.location) {
    const location = filters.location.toLowerCase();
    if (!product.location.toLowerCase().includes(location)) return false;
  }

  if (filters.currency) {
    if (product.currency?.toLowerCase() !== filters.currency.toLowerCase()) {
      return false;
    }
  }

  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    if (product.priceStatus !== "known" || product.price === undefined) {
      return false;
    }
    if (filters.minPrice !== undefined && product.price < filters.minPrice) {
      return false;
    }
    if (filters.maxPrice !== undefined && product.price > filters.maxPrice) {
      return false;
    }
  }

  return true;
}

function buildSearchHints(
  filters: SearchProductsInput,
  totalMatches: number,
  returnedCount: number
): string[] {
  const hints: string[] = [];
  if (totalMatches > returnedCount) {
    hints.push(
      "Too many products matched; narrow the search with keyword, category, location, currency, or price filters."
    );
  }
  if (!filters.keyword && !filters.category && !filters.location) {
    hints.push(
      "Add keyword, category, or location filters for a more focused product search."
    );
  }
  if (
    (filters.minPrice !== undefined || filters.maxPrice !== undefined) &&
    !filters.currency
  ) {
    hints.push("Currency is required for price filters.");
  }
  if (filters.sortBy === "price_asc" || filters.sortBy === "price_desc") {
    hints.push(
      "Price-sorted search is limited to the current fetch window and does not support cursor pagination."
    );
  }
  return hints;
}

function buildSearchFilters(
  filters: SearchProductsInput,
  cursorState: PaginationCursorState | undefined,
  responseLimit: number
): {
  primary: NostrFilter;
  fallback: NostrFilter | undefined;
} {
  const relayLimit = getPaginatedRelayLimit(responseLimit * 5, cursorState);
  const base: NostrFilter = {
    kinds: [PRODUCT_KIND],
    limit: relayLimit,
    ...(cursorState !== undefined && { until: cursorState.boundary }),
  };
  if (filters.category) {
    return {
      primary: { ...base, "#t": getCategoryQueryVariants(filters.category) },
      fallback: base, // Fall back to broad query if #t returns nothing
    };
  }

  return { primary: base, fallback: undefined };
}

function createNextCursor(
  query: string,
  cursorState: PaginationCursorState | undefined,
  boundary: number,
  consumed: readonly NostrEvent[]
): string {
  const seen = accumulatePaginationSeen(
    cursorState,
    consumed,
    getProductLogicalIdentity
  );
  assertPaginationProgress(cursorState, boundary, seen);
  return createPaginationCursor({
    tool: "search_products",
    query,
    boundary,
    seen,
  });
}

function createCursorErrorResponse(
  error: PaginationCursorError
): ToolTextResponse {
  return createErrorResponse(error.message, error.errorCode, false);
}

function sortProducts(
  products: ProductResponse[],
  sortBy: SearchProductsInput["sortBy"]
): ProductResponse[] {
  if (sortBy === "newest") return products;

  const knownPrice = products.filter(
    (product) => product.priceStatus === "known" && product.price !== undefined
  );
  const unknownPrice = products.filter(
    (product) => product.priceStatus !== "known" || product.price === undefined
  );
  knownPrice.sort((a, b) => {
    const difference = (a.price ?? 0) - (b.price ?? 0);
    return sortBy === "price_asc" ? difference : -difference;
  });
  return [...knownPrice, ...unknownPrice];
}

export async function handleSearchProducts(
  args: Record<string, unknown>,
  context: CoreToolContext
): Promise<ToolTextResponse> {
  const parsed = searchProductsSchema.safeParse(args);
  if (!parsed.success) return createValidationErrorResponse(parsed.error);

  const filters = parsed.data;
  const responseLimit = Math.min(filters.limit, PRODUCT_RESPONSE_BUDGET);
  const query = createQueryFingerprint("search_products", [
    filters.keyword?.toLowerCase(),
    filters.category ? normalizeCategoryTag(filters.category) : undefined,
    filters.location?.toLowerCase(),
    filters.minPrice,
    filters.maxPrice,
    filters.currency?.toLowerCase(),
    responseLimit,
    filters.sortBy,
  ]);
  let cursorState: PaginationCursorState | undefined;
  if (filters.cursor !== undefined) {
    try {
      cursorState = decodePaginationCursor(filters.cursor, {
        tool: "search_products",
        query,
      });
    } catch (error) {
      if (error instanceof PaginationCursorError) {
        return createCursorErrorResponse(error);
      }
      throw error;
    }
  }

  const { primary, fallback } = buildSearchFilters(
    filters,
    cursorState,
    responseLimit
  );
  const requestedRelayLimit = getPaginatedRelayLimit(
    responseLimit * 5,
    cursorState
  );
  const startedAt = Date.now();
  const relayMetas = [];
  let usedFallbackQuery = false;

  let relayResult = await fetchFromRelays(
    context.nostr,
    context.relays,
    [primary],
    { timeoutMs: context.timeoutMs }
  );
  relayMetas.push(relayResult.meta);

  if (allRelaysFailed(relayResult.meta)) {
    return createRelayUnavailableResponse(relayResult.meta);
  }

  observeProductEventsForCategories(relayResult.events);
  let sparseBoundary =
    filters.sortBy === "newest"
      ? getNewestSaturatedFilterBoundary(relayResult, requestedRelayLimit, [0])
      : undefined;
  let rawProductWindow = sortEventsNewestFirst(relayResult.events).filter(
    (event) =>
      sparseBoundary === undefined || event.created_at >= sparseBoundary
  );
  let eligibleRawProducts = rawProductWindow;
  if (cursorState) {
    eligibleRawProducts = applyPaginationCursor(
      rawProductWindow,
      cursorState,
      getProductLogicalIdentity
    );
  }
  let scannedProducts = mergeAndDeduplicateProducts(eligibleRawProducts);
  let products = scannedProducts
    .map(parseProductEvent)
    .filter((product) => productMatchesFilters(product, filters));

  // Fallback: if targeted #t query returned nothing and we have a broad fallback,
  // retry with the broad filter (merchant may have written category in description
  // but forgotten the official #t tag).
  if (products.length === 0 && fallback) {
    relayResult = await fetchFromRelays(
      context.nostr,
      context.relays,
      [fallback],
      { timeoutMs: context.timeoutMs }
    );
    relayMetas.push(relayResult.meta);
    usedFallbackQuery = true;

    if (!allRelaysFailed(relayResult.meta)) {
      observeProductEventsForCategories(relayResult.events);
      sparseBoundary =
        filters.sortBy === "newest"
          ? getNewestSaturatedFilterBoundary(
              relayResult,
              requestedRelayLimit,
              [0]
            )
          : undefined;
      rawProductWindow = sortEventsNewestFirst(relayResult.events).filter(
        (event) =>
          sparseBoundary === undefined || event.created_at >= sparseBoundary
      );
      eligibleRawProducts = rawProductWindow;
      if (cursorState) {
        eligibleRawProducts = applyPaginationCursor(
          rawProductWindow,
          cursorState,
          getProductLogicalIdentity
        );
      }
      scannedProducts = mergeAndDeduplicateProducts(eligibleRawProducts);
      products = scannedProducts
        .map(parseProductEvent)
        .filter((product) => productMatchesFilters(product, filters));
    }
  }

  products = sortProducts(products, filters.sortBy);
  const pageProducts = products.slice(0, responseLimit + 1);
  const priceSorted =
    filters.sortBy === "price_asc" || filters.sortBy === "price_desc";
  const returnedProducts = pageProducts.slice(0, responseLimit);
  const hasMatchingProductsBeyondPage = pageProducts.length > responseLimit;
  const shouldAdvanceSparseWindow =
    !priceSorted &&
    !hasMatchingProductsBeyondPage &&
    sparseBoundary !== undefined &&
    rawProductWindow.length > 0;
  const hasMore =
    !priceSorted &&
    (hasMatchingProductsBeyondPage || shouldAdvanceSparseWindow);
  let nextCursor: string | null = null;
  if (hasMore) {
    try {
      if (hasMatchingProductsBeyondPage) {
        const boundary =
          returnedProducts[returnedProducts.length - 1]!.createdAt;
        nextCursor = createNextCursor(
          query,
          cursorState,
          boundary,
          scannedProducts.filter((event) =>
            returnedProducts.some((product) => product.id === event.id)
          )
        );
      } else {
        nextCursor = createNextCursor(
          query,
          cursorState,
          sparseBoundary!,
          rawProductWindow
        );
      }
    } catch (error) {
      if (error instanceof PaginationCursorError) {
        return createCursorErrorResponse(error);
      }
      throw error;
    }
  }
  const truncated = products.length > returnedProducts.length;
  const hints = buildSearchHints(
    filters,
    products.length,
    returnedProducts.length
  );
  const meta = {
    ...buildToolMeta(combineRelayMetas(relayMetas, Date.now() - startedAt), {
      resultCount: returnedProducts.length,
      totalMatches: products.length,
      truncated,
      dataFreshness: getDataFreshness(returnedProducts),
      hints,
    }),
    ...(usedFallbackQuery && { usedFallbackQuery }),
  };

  return createSuccessResponse(
    {
      count: returnedProducts.length,
      totalMatches: products.length,
      products: returnedProducts,
      _pagination: {
        nextCursor,
        hasMore,
      },
    },
    meta,
    returnedProducts.length
  );
}
