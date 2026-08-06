import { z } from "zod";

import { mergeAndDeduplicateProducts } from "../dedup.js";
import { createSuccessResponse, type ToolTextResponse } from "../errors.js";
import { fetchFromRelays } from "../relay-fetch.js";
import { getCategoriesSchema } from "../validation.js";
import {
  CACHE_KINDS,
  PRODUCT_KIND,
  allRelaysFailed,
  buildToolMeta,
  createRelayUnavailableResponse,
  createValidationErrorResponse,
  getDataFreshness,
  normalizeCategoryTag,
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
  let meta = buildToolMeta(
    {
      relaysQueried: [],
      relaysSucceeded: [],
      relaysFailed: [],
      degraded: false,
      coverage: 1,
      responseTimeMs: 0,
      eventCount: 0,
    },
    {
      hints: [
        "Categories are sampled observations from recent public products, not an authoritative or exhaustive Nostr category index.",
        "Normal product-fetching tool calls continuously enrich the in-memory category variant registry as this MCP instance observes more events.",
      ],
    }
  );

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
    context.categoryCache.set(
      { pubkey: CATEGORY_CACHE_KEY, kind: CACHE_KINDS.CATEGORY_SUMMARY },
      categories
    );
    meta = buildToolMeta(relayResult.meta, {
      resultCount: Math.min(categories.length, parsed.data.limit),
      totalMatches: categories.length,
      truncated: categories.length > parsed.data.limit,
      dataFreshness: getDataFreshness(
        events.map((event) => ({ createdAt: event.created_at }))
      ),
      hints: [
        "Categories are sampled observations from recent public products, not an authoritative or exhaustive Nostr category index.",
        "Normal product-fetching tool calls continuously enrich the in-memory category variant registry as this MCP instance observes more events.",
      ],
    });
  }

  const returnedCategories = categories.slice(0, parsed.data.limit);
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
    for (const tag of event.tags || []) {
      if (tag[0] !== "t" || !tag[1]) continue;
      const normalized = normalizeCategoryTag(tag[1]);
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
