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
  type RelayFetchResult,
} from "../relay-fetch.js";
import type {
  NostrEvent,
  NostrFilter,
  ProductResponse,
  RelayFetchMeta,
} from "../types.js";
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
  hashPaginationLogicalIdentity,
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
type SearchProductResponse = ProductResponse & { matchedVia?: "nip50" };

type Nip50Meta = {
  attempted: boolean;
  relaysQueried: string[];
  eventCount: number;
};

type SearchWindowFetch = {
  normalEvents: NostrEvent[];
  nip50Events: NostrEvent[];
  normalResult: RelayFetchResult;
  relayMetas: RelayFetchMeta[];
  nip50: Nip50Meta;
  errorResponse?: ToolTextResponse;
};

type PageAssembly = {
  products: ProductResponse[];
  nip50Products: ProductResponse[];
  rawProductWindow: NostrEvent[];
  sparseBoundary: number | undefined;
  scannedProducts: NostrEvent[];
  nip50ScannedProducts: NostrEvent[];
};

const NIP50_RESERVED_SLOTS = 5;
const NIP50_MAX_TIMEOUT_MS = 3_000;
const NIP50_MAX_RELAY_LIMIT = 100;
const SEARCH_EVENT_CONTENT_CHAR_LIMIT = 20_000;

function productMatchesFilters(
  product: ProductResponse,
  filters: SearchProductsInput,
  eventContent = ""
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
      eventContent.slice(0, SEARCH_EVENT_CONTENT_CHAR_LIMIT),
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
  if (sortBy === "newest") {
    return [...products].sort(
      (a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)
    );
  }

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

function preserveSourceOrderWithLatestRevisions(
  sourceEvents: readonly NostrEvent[],
  latestEvents: readonly NostrEvent[]
): NostrEvent[] {
  const latestByIdentity = new Map(
    latestEvents.map((event) => [getProductLogicalIdentity(event), event])
  );
  const seen = new Set<string>();
  const ordered: NostrEvent[] = [];

  for (const event of sourceEvents) {
    const identity = getProductLogicalIdentity(event);
    if (seen.has(identity)) continue;
    const latest = latestByIdentity.get(identity);
    if (!latest) continue;
    seen.add(identity);
    ordered.push(latest);
  }

  return ordered;
}

function shouldAttemptNip50Search(
  filters: SearchProductsInput,
  context: CoreToolContext
): boolean {
  return Boolean(
    filters.keyword && (context.nip50SearchRelays?.length ?? 0) > 0
  );
}

function buildNip50Filter(filter: NostrFilter, keyword: string): NostrFilter {
  const { until: _until, ...rest } = filter;
  return {
    ...rest,
    limit: Math.min(rest.limit ?? NIP50_MAX_RELAY_LIMIT, NIP50_MAX_RELAY_LIMIT),
    search: keyword,
  };
}

async function fetchSearchWindow(
  context: CoreToolContext,
  filters: SearchProductsInput,
  cursorState: PaginationCursorState | undefined,
  relayFilter: NostrFilter
): Promise<SearchWindowFetch> {
  const startedAt = Date.now();
  const attemptNip50 = shouldAttemptNip50Search(filters, context);
  const nip50Relays = context.nip50SearchRelays ?? [];

  const normalPromise = fetchFromRelays(
    context.nostr,
    context.relays,
    [relayFilter],
    { timeoutMs: context.timeoutMs }
  );
  const nip50Promise = attemptNip50
    ? fetchFromRelays(
        context.nostr,
        nip50Relays,
        [buildNip50Filter(relayFilter, filters.keyword!)],
        { timeoutMs: Math.min(context.timeoutMs, NIP50_MAX_TIMEOUT_MS) }
      )
    : Promise.resolve(undefined);

  const [normalResult, nip50Result] = await Promise.all([
    normalPromise,
    nip50Promise,
  ]);
  const seenIds = new Set(cursorState?.seen ?? []);
  const nip50Events = (nip50Result?.events ?? []).filter(
    (event) =>
      !seenIds.has(
        hashPaginationLogicalIdentity(getProductLogicalIdentity(event))
      )
  );
  const relayMetas = [
    normalResult.meta,
    ...(nip50Result ? [nip50Result.meta] : []),
  ];
  const normalFailed = allRelaysFailed(normalResult.meta);
  const nip50Failed = nip50Result ? allRelaysFailed(nip50Result.meta) : true;
  const errorResponse =
    normalFailed && (!attemptNip50 || nip50Failed)
      ? createRelayUnavailableResponse(
          combineRelayMetas(relayMetas, Date.now() - startedAt)
        )
      : undefined;

  return {
    normalEvents: normalResult.events,
    nip50Events,
    normalResult,
    relayMetas,
    nip50: {
      attempted: attemptNip50,
      relaysQueried: nip50Result?.meta.relaysQueried ?? [],
      eventCount: nip50Result?.meta.eventCount ?? 0,
    },
    ...(errorResponse && { errorResponse }),
  };
}

function assemblePage(
  relayResult: SearchWindowFetch,
  filters: SearchProductsInput,
  cursorState: PaginationCursorState | undefined,
  requestedRelayLimit: number
): PageAssembly {
  const sparseBoundary =
    filters.sortBy === "newest"
      ? getNewestSaturatedFilterBoundary(
          relayResult.normalResult,
          requestedRelayLimit,
          [0]
        )
      : undefined;
  const rawProductWindow = sortEventsNewestFirst(
    relayResult.normalEvents
  ).filter(
    (event) =>
      sparseBoundary === undefined || event.created_at >= sparseBoundary
  );
  const eligibleRawProducts = cursorState
    ? applyPaginationCursor(
        rawProductWindow,
        cursorState,
        getProductLogicalIdentity
      )
    : rawProductWindow;
  const normalScannedProducts =
    mergeAndDeduplicateProducts(eligibleRawProducts);
  const latestProducts = mergeAndDeduplicateProducts([
    ...normalScannedProducts,
    ...relayResult.nip50Events,
  ]);
  const latestByIdentity = new Map(
    latestProducts.map((event) => [getProductLogicalIdentity(event), event])
  );
  const normalIdentities = new Set(
    normalScannedProducts.map(getProductLogicalIdentity)
  );
  const scannedProducts = normalScannedProducts.map(
    (event) => latestByIdentity.get(getProductLogicalIdentity(event)) ?? event
  );
  const products = scannedProducts
    .map((event) => ({ event, product: parseProductEvent(event) }))
    .filter(({ event, product }) =>
      productMatchesFilters(product, filters, event.content)
    )
    .map(({ product }) => product);
  const nip50ScannedProducts = preserveSourceOrderWithLatestRevisions(
    relayResult.nip50Events,
    latestProducts
  ).filter((event) => !normalIdentities.has(getProductLogicalIdentity(event)));
  const nip50Products = nip50ScannedProducts
    .map((event) => ({ event, product: parseProductEvent(event) }))
    .filter(({ event, product }) =>
      productMatchesFilters(product, filters, event.content)
    )
    .map(({ product }) => product);

  return {
    products,
    nip50Products,
    rawProductWindow,
    sparseBoundary,
    scannedProducts,
    nip50ScannedProducts,
  };
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
  const relayMetas: RelayFetchMeta[] = [];
  let nip50Meta: Nip50Meta;
  let usedFallbackQuery = false;

  let relayResult = await fetchSearchWindow(
    context,
    filters,
    cursorState,
    primary
  );
  relayMetas.push(...relayResult.relayMetas);
  nip50Meta = relayResult.nip50;

  if (relayResult.errorResponse) return relayResult.errorResponse;

  observeProductEventsForCategories([
    ...relayResult.normalEvents,
    ...relayResult.nip50Events,
  ]);
  let assembly = assemblePage(
    relayResult,
    filters,
    cursorState,
    requestedRelayLimit
  );

  // Fallback: if targeted #t query returned nothing and we have a broad fallback,
  // retry with the broad filter (merchant may have written category in description
  // but forgotten the official #t tag).
  if (
    assembly.products.length === 0 &&
    assembly.nip50Products.length === 0 &&
    fallback
  ) {
    relayResult = await fetchSearchWindow(
      context,
      filters,
      cursorState,
      fallback
    );
    relayMetas.push(...relayResult.relayMetas);
    nip50Meta = relayResult.nip50;
    usedFallbackQuery = true;

    if (!relayResult.errorResponse) {
      observeProductEventsForCategories([
        ...relayResult.normalEvents,
        ...relayResult.nip50Events,
      ]);
      assembly = assemblePage(
        relayResult,
        filters,
        cursorState,
        requestedRelayLimit
      );
    }
  }

  const products = sortProducts(assembly.products, filters.sortBy);
  const priceSorted =
    filters.sortBy === "price_asc" || filters.sortBy === "price_desc";
  const nip50Products = priceSorted
    ? sortProducts(assembly.nip50Products, filters.sortBy)
    : assembly.nip50Products;
  // NIP50_RESERVED_SLOTS is a guaranteed minimum, not a hard cap — if normal
  // matches don't use their full share of the budget, hand the leftover to NIP-50.
  const reservedSlotsMin = Math.min(
    NIP50_RESERVED_SLOTS,
    nip50Products.length,
    Math.max(0, responseLimit - 1)
  );
  const tentativeNormalBudget = responseLimit - reservedSlotsMin;
  const normalDemand = Math.min(products.length, tentativeNormalBudget);
  const unusedNormalBudget = tentativeNormalBudget - normalDemand;
  const extraNip50Slots = Math.min(
    unusedNormalBudget,
    Math.max(0, nip50Products.length - reservedSlotsMin)
  );
  const reservedSlots = reservedSlotsMin + extraNip50Slots;
  const normalBudget = responseLimit - reservedSlots;
  const pageProducts = products.slice(0, normalBudget + 1);
  const returnedNormal = pageProducts.slice(0, normalBudget);
  const returnedNip50 = nip50Products
    .slice(0, reservedSlots)
    .map((product): SearchProductResponse => ({
      ...product,
      matchedVia: "nip50",
    }));
  const returnedProducts = sortProducts(
    [...returnedNormal, ...returnedNip50],
    filters.sortBy
  ) as SearchProductResponse[];
  const hasMatchingProductsBeyondPage = pageProducts.length > normalBudget;
  const hasNip50ProductsBeyondPage =
    nip50Products.length > returnedNip50.length;
  const shouldAdvanceSparseWindow =
    !priceSorted &&
    !hasMatchingProductsBeyondPage &&
    assembly.sparseBoundary !== undefined &&
    assembly.rawProductWindow.length > 0;
  const hasMore =
    !priceSorted &&
    (hasMatchingProductsBeyondPage ||
      shouldAdvanceSparseWindow ||
      hasNip50ProductsBeyondPage);
  let nextCursor: string | null = null;
  if (hasMore) {
    try {
      if (hasMatchingProductsBeyondPage) {
        const returnedBoundary =
          returnedNormal[returnedNormal.length - 1]!.createdAt;
        const boundary = cursorState
          ? Math.min(returnedBoundary, cursorState.boundary)
          : returnedBoundary;
        const consumedForCursor = [
          ...assembly.scannedProducts.filter((event) =>
            returnedNormal.some((product) => product.id === event.id)
          ),
          ...assembly.nip50ScannedProducts.filter((event) =>
            returnedNip50.some((product) => product.id === event.id)
          ),
        ];
        nextCursor = createNextCursor(
          query,
          cursorState,
          boundary,
          consumedForCursor
        );
      } else if (shouldAdvanceSparseWindow) {
        const returnedIds = new Set(
          returnedProducts.map((product) => product.id)
        );
        const consumedForCursor = [
          ...assembly.rawProductWindow.filter(
            (event) =>
              event.created_at === assembly.sparseBoundary ||
              returnedIds.has(event.id)
          ),
          ...assembly.nip50ScannedProducts.filter((event) =>
            returnedNip50.some((product) => product.id === event.id)
          ),
        ];
        nextCursor = createNextCursor(
          query,
          cursorState,
          assembly.sparseBoundary!,
          consumedForCursor
        );
      } else {
        const newestNormalTimestamp = assembly.rawProductWindow[0]?.created_at;
        const boundary =
          cursorState?.boundary ??
          Math.max(Math.floor(Date.now() / 1000), newestNormalTimestamp ?? 0);
        const returnedIds = new Set(
          returnedProducts.map((product) => product.id)
        );
        const consumedForCursor = [
          ...assembly.scannedProducts.filter((event) =>
            returnedIds.has(event.id)
          ),
          ...assembly.nip50ScannedProducts.filter((event) =>
            returnedIds.has(event.id)
          ),
        ];
        nextCursor = createNextCursor(
          query,
          cursorState,
          boundary,
          consumedForCursor
        );
      }
    } catch (error) {
      if (error instanceof PaginationCursorError) {
        return createCursorErrorResponse(error);
      }
      throw error;
    }
  }
  const totalMatches = products.length + assembly.nip50Products.length;
  const truncated = totalMatches > returnedProducts.length;
  const hints = buildSearchHints(
    filters,
    totalMatches,
    returnedProducts.length
  );
  const meta = {
    ...buildToolMeta(combineRelayMetas(relayMetas, Date.now() - startedAt), {
      resultCount: returnedProducts.length,
      totalMatches,
      truncated,
      dataFreshness: getDataFreshness(returnedProducts),
      hints,
    }),
    nip50: {
      ...nip50Meta,
      reservedSlotsUsed: returnedNip50.length,
    },
    ...(usedFallbackQuery && { usedFallbackQuery }),
  };

  return createSuccessResponse(
    {
      count: returnedProducts.length,
      totalMatches,
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
