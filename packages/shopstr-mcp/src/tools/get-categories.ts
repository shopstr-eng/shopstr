import { z } from "zod";

import {
  CATEGORY_SUMMARY_MAX_ENTRIES,
  getAcceptedCategoryTags,
} from "../category-tags.js";
import { mergeAndDeduplicateProducts } from "../dedup.js";
import { createSuccessResponse, type ToolTextResponse } from "../errors.js";
import { fetchFromRelays } from "../relay-fetch.js";
import type { RelayFetchMeta } from "../types.js";
import { getCategoriesSchema } from "../validation.js";
import {
  CACHE_KINDS,
  PRODUCT_KIND,
  allRelaysFailed,
  buildToolMeta,
  createRelayUnavailableResponse,
  createValidationErrorResponse,
  getDataFreshness,
  observeProductEventsForCategories,
} from "./utils/common.js";
import type { CoreToolContext } from "./utils/context.js";

const CATEGORY_CACHE_KEY = "__category_summary__";
const CATEGORY_SCAN_LIMIT = 500;

type CategorySummary = Array<{
  name: string;
  count: number;
}>;

export const getCategoriesInputSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe(
      "Maximum number of observed categories to return. Results are from a sampled recent-product scan and are not an exhaustive network catalog."
    ),
};

export async function handleGetCategories(
  args: Record<string, unknown>,
  context: CoreToolContext
): Promise<ToolTextResponse> {
  const parsed = getCategoriesSchema.safeParse(args);
  if (!parsed.success) return createValidationErrorResponse(parsed.error);

  const cached = context.categoryCache.get<CategorySummary>({
    pubkey: CATEGORY_CACHE_KEY,
    kind: CACHE_KINDS.CATEGORY_SUMMARY,
  });

  let categories = cached?.value;
  let relayMeta: RelayFetchMeta = {
    relaysQueried: [],
    relaysSucceeded: [],
    relaysFailed: [],
    degraded: false,
    coverage: 1,
    responseTimeMs: 0,
    eventCount: 0,
  };
  let dataFreshness: string | null = null;

  if (!categories) {
    const relayResult = await fetchFromRelays(
      context.nostr,
      context.relays,
      [
        {
          kinds: [PRODUCT_KIND],
          limit: CATEGORY_SCAN_LIMIT,
        },
      ],
      { timeoutMs: context.timeoutMs }
    );

    if (allRelaysFailed(relayResult.meta)) {
      return createRelayUnavailableResponse(relayResult.meta);
    }

    const events = mergeAndDeduplicateProducts(relayResult.events);
    observeProductEventsForCategories(events);
    categories = summarizeCategories(events);
    dataFreshness = getDataFreshness(
      events.map((event) => ({ createdAt: event.created_at }))
    );
    context.categoryCache.set(
      { pubkey: CATEGORY_CACHE_KEY, kind: CACHE_KINDS.CATEGORY_SUMMARY },
      categories
    );
    relayMeta = relayResult.meta;
  }

  const returnedCategories = categories.slice(0, parsed.data.limit);
  const meta = buildToolMeta(relayMeta, {
    resultCount: returnedCategories.length,
    totalMatches: categories.length,
    truncated: categories.length > returnedCategories.length,
    dataFreshness,
    hints: [
      "Categories are sampled observations from recent public products, not an authoritative or exhaustive Nostr category index.",
      "count is the number of sampled products with this tag, not a total network count.",
      "Normal product-fetching tool calls continuously enrich the in-memory category variant registry as this MCP instance observes more events.",
    ],
  });
  return createSuccessResponse(
    {
      count: returnedCategories.length,
      totalMatches: categories.length,
      categories: returnedCategories,
    },
    {
      ...meta,
      cached: {
        categories: cached?.cached ?? false,
      },
    },
    returnedCategories.length
  );
}

function summarizeCategories(
  events: readonly { tags: string[][] }[]
): CategorySummary {
  const counts = new Map<string, number>();

  for (const event of events) {
    const normalizedCategories = new Set(
      getAcceptedCategoryTags(event.tags || []).map(
        (category) => category.normalized
      )
    );
    for (const normalized of normalizedCategories) {
      const currentCount = counts.get(normalized);
      if (currentCount !== undefined) {
        counts.set(normalized, currentCount + 1);
      } else if (counts.size < CATEGORY_SUMMARY_MAX_ENTRIES) {
        counts.set(normalized, 1);
      }
    }
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
