import { z } from "zod";

import { getDTag, mergeAndDeduplicateProducts } from "../dedup.js";
import {
  MCP_ERROR_CODES,
  createErrorResponse,
  createSuccessResponse,
  type ToolTextResponse,
} from "../errors.js";
import { parseProductEvent } from "../parse-tags.js";
import { fetchFromRelays } from "../relay-fetch.js";
import type { NostrFilter } from "../types.js";
import {
  parseProductAddress,
  productDetailsInputSchema,
} from "../validation.js";
import {
  PRODUCT_KIND,
  allRelaysFailed,
  buildToolMeta,
  createRelayUnavailableResponse,
  createValidationErrorResponse,
  getDataFreshness,
} from "./utils/common.js";
import type { CoreToolContext } from "./utils/context.js";

export const getProductDetailsInputSchema = {
  productId: z
    .string()
    .optional()
    .describe("The product event ID as 64-character hex"),
  productAddress: z
    .string()
    .optional()
    .describe("Product address as 30402:<seller-pubkey>:<product-d-tag>"),
};

/**
 * Resolve a productId to a product coordinate by doing a pre-flight fetch.
 * Returns the pubkey and dTag so we can query by coordinate for the latest version.
 */
async function resolveCoordinateFromId(
  productId: string,
  context: CoreToolContext
): Promise<{
  pubkey?: string;
  dTag?: string;
  errorResponse?: ToolTextResponse;
}> {
  const relayResult = await fetchFromRelays(
    context.nostr,
    context.relays,
    [{ kinds: [PRODUCT_KIND], ids: [productId] }],
    { timeoutMs: context.timeoutMs }
  );

  if (allRelaysFailed(relayResult.meta)) {
    return {
      errorResponse: createRelayUnavailableResponse(relayResult.meta, [
        "Could not resolve productId; retry later or pass productAddress directly.",
      ]),
    };
  }

  const event = relayResult.events.find(
    (e) => e.kind === PRODUCT_KIND && e.id === productId
  );
  if (!event) return {};

  const dTag = getDTag(event);
  return dTag ? { pubkey: event.pubkey, dTag } : {};
}

export async function handleGetProductDetails(
  args: Record<string, unknown>,
  context: CoreToolContext
): Promise<ToolTextResponse> {
  const parsed = productDetailsInputSchema.safeParse(args);
  if (!parsed.success) return createValidationErrorResponse(parsed.error);

  const { productId, productAddress } = parsed.data;

  let coordinateFilter: NostrFilter | undefined;
  let fallbackId: string | undefined;
  const hints: string[] = [];

  if (productAddress) {
    // Product Address already provided, parse it to build a coordinate filter
    const parts = parseProductAddress(productAddress);
    if (parts) {
      coordinateFilter = {
        kinds: [PRODUCT_KIND],
        authors: [parts.pubkey],
        "#d": [parts.dTag],
      };
    }
  }

  if (!coordinateFilter && productId) {
    // pre-flight check to resolve the coordinate (cached)
    const PREFLIGHT_CACHE_KIND = 30402;
    const cacheKey = { pubkey: productId, kind: PREFLIGHT_CACHE_KIND };
    const cached = context.cache.get<{ pubkey: string; dTag: string }>(
      cacheKey
    );

    let pubkey: string | undefined;
    let dTag: string | undefined;

    if (cached) {
      pubkey = cached.value.pubkey;
      dTag = cached.value.dTag;
    } else {
      const resolved = await resolveCoordinateFromId(productId, context);
      if (resolved.errorResponse) return resolved.errorResponse;
      pubkey = resolved.pubkey;
      dTag = resolved.dTag;
      if (pubkey && dTag) {
        context.cache.set(cacheKey, { pubkey, dTag });
      }
    }

    if (pubkey && dTag) {
      coordinateFilter = {
        kinds: [PRODUCT_KIND],
        authors: [pubkey],
        "#d": [dTag],
      };
    } else {
      // Could not resolve coordinate; fall back to exact ID lookup
      fallbackId = productId;
      hints.push(
        "Could not resolve productId to a coordinate; using exact-id lookup which may return stale data."
      );
    }
  }

  const relayFilter: NostrFilter = coordinateFilter ?? {
    kinds: [PRODUCT_KIND],
    ids: [fallbackId!],
  };

  const relayResult = await fetchFromRelays(
    context.nostr,
    context.relays,
    [relayFilter],
    { timeoutMs: context.timeoutMs }
  );

  if (allRelaysFailed(relayResult.meta)) {
    return createRelayUnavailableResponse(relayResult.meta);
  }

  const deduped = mergeAndDeduplicateProducts(relayResult.events);
  const event = deduped[0];
  if (!event) {
    hints.push(
      "Use search_products with keyword, category, or location filters to discover products."
    );
    return createErrorResponse(
      "Product not found.",
      MCP_ERROR_CODES.NOT_FOUND,
      false,
      undefined,
      buildToolMeta(relayResult.meta, { hints })
    );
  }

  const product = parseProductEvent(event);
  const successMeta = buildToolMeta(relayResult.meta, {
    resultCount: 1,
    totalMatches: 1,
    truncated: false,
    dataFreshness: getDataFreshness([product]),
    hints,
  });

  return createSuccessResponse({ product }, successMeta, 1);
}
