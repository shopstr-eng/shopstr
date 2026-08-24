import type { ZodError } from "zod";

import {
  acceptCategoryTag,
  getAcceptedCategoryTags,
  normalizeCategoryTag,
} from "../../category-tags.js";
import {
  MCP_ERROR_CODES,
  createErrorResponse,
  type ToolMeta,
  type ToolTextResponse,
} from "../../errors.js";
import type { RelayFetchMeta } from "../../types.js";

export const PRODUCT_KIND = 30402;
export const REVIEW_KIND = 31555;
export const PROFILE_KIND = 0;
export const SHOP_PROFILE_KIND = 30019;
export const CACHE_KINDS = {
  SELLER_PRODUCTS: 0x7e570001,
  SELLER_REVIEWS: 0x7e570002,
  CATEGORY_SUMMARY: 0x7e570003,
  NIP05_VERIFICATION: 0x7e570004,
  PRODUCT_COORDINATE: 30402,
} as const;
export const PRODUCT_RESPONSE_BUDGET = 37;
export const REVIEW_RESPONSE_BUDGET = 50;
export const SELLER_LIST_RESPONSE_BUDGET = 50;
export const REVIEW_PRODUCT_FILTER_LIMIT = 20;
export const RELAY_RETRY_AFTER_MS = 2_000;
export const CATEGORY_VARIANT_REGISTRY_MAX_ENTRIES = 5_000;

export { normalizeCategoryTag } from "../../category-tags.js";

const categoryVariantRegistry = new Map<string, Set<string>>();
const categoryVariantInsertionOrder = new Map<
  string,
  { normalized: string; raw: string }
>();

export function observeCategoryTags(tags: readonly string[][]): void {
  for (const category of getAcceptedCategoryTags(tags)) {
    observeAcceptedCategoryTag(category);
  }
}

export function observeCategoryTag(raw: string): void {
  const category = acceptCategoryTag(raw);
  if (!category) return;
  observeAcceptedCategoryTag(category);
}

function observeAcceptedCategoryTag(category: {
  normalized: string;
  raw: string;
}): void {
  const { normalized, raw } = category;
  const variants = categoryVariantRegistry.get(normalized) ?? new Set<string>();
  if (variants.has(raw)) return;

  if (
    categoryVariantInsertionOrder.size >= CATEGORY_VARIANT_REGISTRY_MAX_ENTRIES
  ) {
    evictOldestCategoryVariant();
  }

  variants.add(raw);
  categoryVariantRegistry.set(normalized, variants);
  categoryVariantInsertionOrder.set(toCategoryVariantKey(normalized, raw), {
    normalized,
    raw,
  });
}

export function observeProductEventsForCategories(
  events: readonly { tags: string[][] }[]
): void {
  for (const event of events) {
    observeCategoryTags(event.tags || []);
  }
}

export function getObservedCategoryVariants(category: string): string[] {
  const normalized = normalizeCategoryTag(category);
  const observed = categoryVariantRegistry.get(normalized);
  return observed ? Array.from(observed) : [];
}

export function getCategoryQueryVariants(category: string): string[] {
  const normalized = normalizeCategoryTag(category);
  if (!normalized) return [];

  return Array.from(
    new Set([
      ...getObservedCategoryVariants(normalized),
      normalized,
      toTitleCase(normalized),
      normalized.toUpperCase(),
    ])
  );
}

function toTitleCase(value: string): string {
  return value.replace(
    /\S+/g,
    (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}

function evictOldestCategoryVariant(): void {
  const oldestKey = categoryVariantInsertionOrder.keys().next().value;
  if (oldestKey === undefined) return;

  const oldest = categoryVariantInsertionOrder.get(oldestKey);
  categoryVariantInsertionOrder.delete(oldestKey);
  if (!oldest) return;

  const variants = categoryVariantRegistry.get(oldest.normalized);
  if (!variants) return;

  variants.delete(oldest.raw);
  if (variants.size === 0) {
    categoryVariantRegistry.delete(oldest.normalized);
  }
}

function toCategoryVariantKey(normalized: string, raw: string): string {
  return JSON.stringify([normalized, raw]);
}

export function formatValidationError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "input";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function createValidationErrorResponse(
  error: ZodError
): ToolTextResponse {
  return createErrorResponse(
    `Invalid input: ${formatValidationError(error)}`,
    MCP_ERROR_CODES.VALIDATION_ERROR,
    false,
    undefined,
    {
      _hints: ["Check the tool input schema and retry with valid arguments."],
    }
  );
}

export function buildToolMeta(
  relayMeta: RelayFetchMeta,
  fields: {
    hints?: string[];
    resultCount?: number;
    totalMatches?: number;
    truncated?: boolean;
    dataFreshness?: string | null;
  } = {}
): ToolMeta {
  return {
    ...relayMeta,
    dataSource: "nostr_relays",
    ...(fields.dataFreshness !== undefined && {
      dataFreshness: fields.dataFreshness,
    }),
    ...(fields.resultCount !== undefined && {
      resultCount: fields.resultCount,
    }),
    ...(fields.totalMatches !== undefined && {
      totalMatches: fields.totalMatches,
    }),
    ...(fields.truncated !== undefined && { _truncated: fields.truncated }),
    _hints: fields.hints ?? [],
  };
}

export function emptyRelayMeta(responseTimeMs = 0): RelayFetchMeta {
  return {
    relaysQueried: [],
    relaysSucceeded: [],
    relaysFailed: [],
    degraded: false,
    coverage: 1,
    responseTimeMs,
    eventCount: 0,
  };
}

export function combineRelayMetas(
  metas: readonly RelayFetchMeta[],
  responseTimeMs: number
): RelayFetchMeta {
  const relaysQueried = new Set<string>();
  const relaysSucceeded = new Set<string>();
  const relaysFailed = new Map<string, { url: string; error: string }>();
  let eventCount = 0;

  for (const meta of metas) {
    meta.relaysQueried.forEach((relay) => relaysQueried.add(relay));
    meta.relaysSucceeded.forEach((relay) => relaysSucceeded.add(relay));
    for (const failure of meta.relaysFailed) {
      relaysFailed.set(`${failure.url}:${failure.error}`, failure);
    }
    eventCount += meta.eventCount;
  }

  return {
    relaysQueried: Array.from(relaysQueried),
    relaysSucceeded: Array.from(relaysSucceeded),
    relaysFailed: Array.from(relaysFailed.values()),
    degraded: Array.from(relaysFailed.values()).length > 0,
    coverage:
      relaysQueried.size === 0 ? 1 : relaysSucceeded.size / relaysQueried.size,
    responseTimeMs,
    eventCount,
  };
}

export function allRelaysFailed(meta: RelayFetchMeta): boolean {
  return meta.relaysQueried.length > 0 && meta.relaysSucceeded.length === 0;
}

export function createRelayUnavailableResponse(
  meta: RelayFetchMeta,
  hints: string[] = ["Retry later or configure additional relays."]
): ToolTextResponse {
  return createErrorResponse(
    "All configured relays failed to return data.",
    MCP_ERROR_CODES.RELAY_UNAVAILABLE,
    true,
    RELAY_RETRY_AFTER_MS,
    buildToolMeta(meta, { hints })
  );
}

export function getDataFreshness(
  items: readonly { createdAt: number }[]
): string | null {
  const latestTimestamp = items.reduce(
    (latest, item) => Math.max(latest, item.createdAt || 0),
    0
  );
  return latestTimestamp
    ? new Date(latestTimestamp * 1000).toISOString()
    : null;
}
