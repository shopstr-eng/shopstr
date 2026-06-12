import { z } from "zod";

import {
  getParameterizedReplaceableCoordinate,
  mergeAndDeduplicateProducts,
  mergeAndDeduplicateReviews,
} from "../dedup.js";
import { createSuccessResponse, type ToolTextResponse } from "../errors.js";
import { parseReviewEvent } from "../parse-tags.js";
import { fetchFromRelays } from "../relay-fetch.js";
import type { NostrEvent, NostrFilter } from "../types.js";
import { reviewsInputSchema } from "../validation.js";
import {
  PRODUCT_KIND,
  REVIEW_KIND,
  REVIEW_RESPONSE_BUDGET,
  allRelaysFailed,
  buildToolMeta,
  createRelayUnavailableResponse,
  createValidationErrorResponse,
  getDataFreshness,
} from "./utils/common.js";
import type { CoreToolContext } from "./utils/context.js";

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
};

function hasTag(event: NostrEvent, key: string, value: string): boolean {
  return event.tags.some((tag) => tag[0] === key && tag[1] === value);
}

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

function hasProductAddress(event: NostrEvent, productAddress: string): boolean {
  return (
    hasTag(event, "d", `a:${productAddress}`) ||
    hasTag(event, "d", productAddress) ||
    hasTag(event, "a", productAddress)
  );
}

function eventReferencesSeller(
  event: NostrEvent,
  sellerPubkey: string
): boolean {
  return event.tags.some((tag) => {
    const [key, value] = tag;
    return (
      typeof value === "string" &&
      (key === "d" || key === "a") &&
      value.includes(sellerPubkey)
    );
  });
}

function createReviewFilter(fields: Partial<NostrFilter>): NostrFilter {
  return {
    kinds: [REVIEW_KIND],
    limit: 500,
    ...fields,
  };
}

function buildReviewFilters(
  productAddresses: readonly string[],
  productId?: string,
  sellerPubkey?: string
): NostrFilter[] {
  const filters: NostrFilter[] = [];

  for (const productAddress of productAddresses) {
    filters.push(
      createReviewFilter({ "#d": [`a:${productAddress}`, productAddress] }),
      createReviewFilter({ "#a": [productAddress] })
    );
  }

  if (productId) filters.push(createReviewFilter({ "#e": [productId] }));
  if (sellerPubkey) filters.push(createReviewFilter({ "#p": [sellerPubkey] }));

  return filters.length > 0 ? filters : [createReviewFilter({})];
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

async function resolveProductAddressesFromSellerPubkey(
  sellerPubkey: string,
  context: CoreToolContext
): Promise<{ addresses: string[]; errorResponse?: ToolTextResponse }> {
  const relayResult = await fetchFromRelays(
    context.nostr,
    context.relays,
    [
      {
        kinds: [PRODUCT_KIND],
        authors: [sellerPubkey],
        limit: 500,
      },
    ],
    { timeoutMs: context.timeoutMs }
  );

  if (allRelaysFailed(relayResult.meta)) {
    return {
      addresses: [],
      errorResponse: createRelayUnavailableResponse(relayResult.meta, [
        "Could not resolve seller products to review addresses; retry later or query a specific productAddress.",
      ]),
    };
  }

  const addresses = new Set<string>();
  addProductAddressesFromEvents(relayResult.events, addresses);
  return { addresses: Array.from(addresses) };
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

  const { productAddress, productId, sellerPubkey } = parsed.data;
  const productAddresses = new Set<string>();
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
    // Cache the seller's product addresses to avoid repeated relay lookups.
    // Uses a synthetic kind to name the cache key separately since cache key is built from kind+pubkey.
    const SELLER_PRODUCTS_CACHE_KIND = 0x7e570000;
    const cacheKey = { pubkey: sellerPubkey, kind: SELLER_PRODUCTS_CACHE_KIND };
    const cached = context.cache.get<string[]>(cacheKey);

    let resolvedAddresses: string[];

    if (cached) {
      resolvedAddresses = cached.value;
    } else {
      const resolved = await resolveProductAddressesFromSellerPubkey(
        sellerPubkey,
        context
      );
      if (resolved.errorResponse) return resolved.errorResponse;
      resolvedAddresses = resolved.addresses;
      if (resolvedAddresses.length > 0) {
        context.cache.set(cacheKey, resolvedAddresses);
      }
    }

    for (const address of resolvedAddresses) {
      productAddresses.add(address);
    }

    if (resolvedAddresses.length === 0) {
      addressResolutionHint =
        addressResolutionHint ??
        "Could not resolve seller products to review addresses; used legacy #p review lookup only.";
    }
  }

  const resolvedProductAddresses = Array.from(productAddresses);
  const relayFilters = buildReviewFilters(
    resolvedProductAddresses,
    productId,
    sellerPubkey
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
  const reviews = reviewEvents.map(parseReviewEvent);
  const returnedReviews = reviews.slice(0, REVIEW_RESPONSE_BUDGET);
  const truncated = returnedReviews.length < reviews.length;
  const hints = buildReviewHints(
    reviews.length,
    returnedReviews.length,
    addressResolutionHint
  );
  const meta = buildToolMeta(relayResult.meta, {
    resultCount: returnedReviews.length,
    totalMatches: reviews.length,
    truncated,
    dataFreshness: getDataFreshness(returnedReviews),
    hints,
  });

  return createSuccessResponse(
    {
      count: returnedReviews.length,
      totalMatches: reviews.length,
      reviews: returnedReviews,
    },
    meta,
    returnedReviews.length
  );
}
