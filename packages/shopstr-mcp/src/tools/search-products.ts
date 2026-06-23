import { z } from "zod";

import { mergeAndDeduplicateProducts } from "../dedup.js";
import { createSuccessResponse, type ToolTextResponse } from "../errors.js";
import { parseProductEvent } from "../parse-tags.js";
import { fetchFromRelays } from "../relay-fetch.js";
import type { NostrFilter, ProductResponse } from "../types.js";
import { searchProductsSchema } from "../validation.js";
import {
  PRODUCT_KIND,
  PRODUCT_RESPONSE_BUDGET,
  allRelaysFailed,
  buildToolMeta,
  createRelayUnavailableResponse,
  createValidationErrorResponse,
  getDataFreshness,
} from "./utils/common.js";
import type { CoreToolContext } from "./utils/context.js";

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
    .describe("Currency code required when using price filters"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe(
      `Requested result count. Responses are capped at ${PRODUCT_RESPONSE_BUDGET} products for MCP token budgeting.`
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
      ...product.categories,
    ]
      .join(" ")
      .toLowerCase();
    if (!searchableText.includes(keyword)) return false;
  }

  if (filters.category) {
    const category = filters.category.toLowerCase();
    if (!product.categories.some((value) => value.toLowerCase() === category)) {
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
  return hints;
}

function buildSearchFilters(filters: SearchProductsInput): {
  primary: NostrFilter;
  fallback: NostrFilter | undefined;
} {
  const effectiveLimit = Math.min(filters.limit, PRODUCT_RESPONSE_BUDGET);
  const relayLimit = Math.min(500, effectiveLimit * 5);
  const base: NostrFilter = { kinds: [PRODUCT_KIND], limit: relayLimit };
  if (filters.category) {
    const variants = new Set([
      filters.category,
      filters.category.toLowerCase(),
    ]);
    return {
      primary: { ...base, "#t": Array.from(variants) },
      fallback: base, // Fall back to broad query if #t returns nothing
    };
  }

  return { primary: base, fallback: undefined };
}

export async function handleSearchProducts(
  args: Record<string, unknown>,
  context: CoreToolContext
): Promise<ToolTextResponse> {
  const parsed = searchProductsSchema.safeParse(args);
  if (!parsed.success) return createValidationErrorResponse(parsed.error);

  const filters = parsed.data;
  const { primary, fallback } = buildSearchFilters(filters);

  let relayResult = await fetchFromRelays(
    context.nostr,
    context.relays,
    [primary],
    { timeoutMs: context.timeoutMs }
  );

  if (allRelaysFailed(relayResult.meta)) {
    return createRelayUnavailableResponse(relayResult.meta);
  }

  let products = mergeAndDeduplicateProducts(relayResult.events)
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

    if (!allRelaysFailed(relayResult.meta)) {
      products = mergeAndDeduplicateProducts(relayResult.events)
        .map(parseProductEvent)
        .filter((product) => productMatchesFilters(product, filters));
    }
  }

  const requestedLimit = filters.limit;
  const responseLimit = Math.min(requestedLimit, PRODUCT_RESPONSE_BUDGET);
  const returnedProducts = products.slice(0, responseLimit);
  const truncated = returnedProducts.length < products.length;
  const hints = buildSearchHints(
    filters,
    products.length,
    returnedProducts.length
  );
  const meta = buildToolMeta(relayResult.meta, {
    resultCount: returnedProducts.length,
    totalMatches: products.length,
    truncated,
    dataFreshness: getDataFreshness(returnedProducts),
    hints,
  });

  return createSuccessResponse(
    {
      count: returnedProducts.length,
      totalMatches: products.length,
      products: returnedProducts,
    },
    meta,
    returnedProducts.length
  );
}
