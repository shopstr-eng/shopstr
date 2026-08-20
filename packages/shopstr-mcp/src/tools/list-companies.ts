import { z } from "zod";

import {
  getProfileLogicalIdentity,
  mergeAndDeduplicateProducts,
  mergeAndDeduplicateProfiles,
  sortEventsNewestFirst,
} from "../dedup.js";
import {
  createErrorResponse,
  createSuccessResponse,
  type ToolTextResponse,
} from "../errors.js";
import { parseProductEvent, parseProfileEvent } from "../parse-tags.js";
import {
  fetchFromRelays,
  getNewestSaturatedFilterBoundary,
} from "../relay-fetch.js";
import type { NostrEvent } from "../types.js";
import { listCompaniesSchema } from "../validation.js";
import {
  PRODUCT_KIND,
  SELLER_LIST_RESPONSE_BUDGET,
  SHOP_PROFILE_KIND,
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
import { isPublicProduct } from "./utils/seller.js";
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

export const listCompaniesInputSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe(
      `Requested seller count. Responses are capped at ${SELLER_LIST_RESPONSE_BUDGET} sellers for MCP token budgeting.`
    ),
  cursor: z
    .string()
    .max(16_384)
    .optional()
    .describe(
      "Opaque pagination cursor returned by a previous request with the same category and effective result limit. It tracks consumed profile kind/pubkey identities so stale profile revisions cannot reappear."
    ),
  category: z
    .string()
    .max(100)
    .optional()
    .describe(
      "Optional product category filter. Sellers are included only when they have at least one public product tagged with this category."
    ),
};

function createCursorErrorResponse(
  error: PaginationCursorError
): ToolTextResponse {
  return createErrorResponse(error.message, error.errorCode, false);
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
    getProfileLogicalIdentity
  );
  assertPaginationProgress(cursorState, boundary, seen);
  return createPaginationCursor({
    tool: "list_companies",
    query,
    boundary,
    seen,
  });
}

export async function handleListCompanies(
  args: Record<string, unknown>,
  context: CoreToolContext
): Promise<ToolTextResponse> {
  const parsed = listCompaniesSchema.safeParse(args);
  if (!parsed.success) return createValidationErrorResponse(parsed.error);

  const startedAt = Date.now();
  const relayMetas = [];
  const responseLimit = Math.min(
    parsed.data.limit,
    SELLER_LIST_RESPONSE_BUDGET
  );
  const category = parsed.data.category
    ? normalizeCategoryTag(parsed.data.category)
    : undefined;
  const query = createQueryFingerprint("list_companies", [
    category,
    responseLimit,
  ]);
  let cursorState: PaginationCursorState | undefined;
  if (parsed.data.cursor !== undefined) {
    try {
      cursorState = decodePaginationCursor(parsed.data.cursor, {
        tool: "list_companies",
        query,
      });
    } catch (error) {
      if (error instanceof PaginationCursorError) {
        return createCursorErrorResponse(error);
      }
      throw error;
    }
  }

  const profileRelayLimit = parsed.data.category
    ? 500
    : getPaginatedRelayLimit(Math.min(500, responseLimit * 5), cursorState);
  const profileRelayResult = await fetchFromRelays(
    context.nostr,
    context.relays,
    [
      {
        kinds: [SHOP_PROFILE_KIND],
        limit: profileRelayLimit,
        ...(cursorState !== undefined && { until: cursorState.boundary }),
      },
    ],
    { timeoutMs: context.timeoutMs }
  );
  relayMetas.push(profileRelayResult.meta);

  if (allRelaysFailed(profileRelayResult.meta)) {
    return createRelayUnavailableResponse(profileRelayResult.meta);
  }

  const sparseBoundary = getNewestSaturatedFilterBoundary(
    profileRelayResult,
    profileRelayLimit,
    [0]
  );
  const rawProfileWindow = sortEventsNewestFirst(
    profileRelayResult.events
  ).filter(
    (event) =>
      sparseBoundary === undefined || event.created_at >= sparseBoundary
  );
  let eligibleRawProfiles = rawProfileWindow;
  if (cursorState) {
    eligibleRawProfiles = applyPaginationCursor(
      rawProfileWindow,
      cursorState,
      getProfileLogicalIdentity
    );
  }
  const scannedProfiles = mergeAndDeduplicateProfiles(eligibleRawProfiles);
  let companies = scannedProfiles.map((profile) => ({
    profile,
    company: parseProfileEvent(profile),
  }));
  for (const { company } of companies) {
    context.cache.set(
      { pubkey: company.pubkey, kind: SHOP_PROFILE_KIND },
      company
    );
  }

  const hints: string[] = [];
  if (category) {
    const categoryRelayResult = await fetchFromRelays(
      context.nostr,
      context.relays,
      [
        {
          kinds: [PRODUCT_KIND],
          "#t": getCategoryQueryVariants(category),
          limit: 500,
        },
      ],
      { timeoutMs: context.timeoutMs }
    );
    relayMetas.push(categoryRelayResult.meta);

    if (allRelaysFailed(categoryRelayResult.meta)) {
      return createRelayUnavailableResponse(categoryRelayResult.meta, [
        "Could not fetch products for the category filter; retry later or remove category.",
      ]);
    }

    observeProductEventsForCategories(categoryRelayResult.events);
    const sellerPubkeys = new Set(
      mergeAndDeduplicateProducts(categoryRelayResult.events)
        .map(parseProductEvent)
        .filter(
          (product) =>
            isPublicProduct(product) &&
            product.categories.some(
              (value) => normalizeCategoryTag(value) === category
            )
        )
        .map((product) => product.pubkey)
    );
    companies = companies.filter(({ company }) =>
      sellerPubkeys.has(company.pubkey)
    );
    if (sellerPubkeys.size === 0) {
      hints.push(
        `No public products tagged with category "${category}" were observed in the sampled relay results.`
      );
    }
  }

  const pageCompanies = companies.slice(0, responseLimit + 1);
  const returnedCompanyEntries = pageCompanies.slice(0, responseLimit);
  const returnedCompanies = returnedCompanyEntries.map(
    ({ company }) => company
  );
  const hasMatchingCompaniesBeyondPage = pageCompanies.length > responseLimit;
  const shouldAdvanceSparseWindow =
    !hasMatchingCompaniesBeyondPage &&
    sparseBoundary !== undefined &&
    rawProfileWindow.length > 0;
  const hasMore = hasMatchingCompaniesBeyondPage || shouldAdvanceSparseWindow;
  let nextCursor: string | null = null;
  if (hasMore) {
    try {
      if (hasMatchingCompaniesBeyondPage) {
        const boundary =
          returnedCompanyEntries[returnedCompanyEntries.length - 1]!.profile
            .created_at;
        nextCursor = createNextCursor(
          query,
          cursorState,
          boundary,
          returnedCompanyEntries.map(({ profile }) => profile)
        );
      } else {
        const returnedPubkeys = new Set(
          returnedCompanies.map((company) => company.pubkey)
        );
        nextCursor = createNextCursor(
          query,
          cursorState,
          sparseBoundary!,
          rawProfileWindow.filter(
            (event) =>
              event.created_at === sparseBoundary ||
              returnedPubkeys.has(event.pubkey)
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
  if (hasMatchingCompaniesBeyondPage) {
    hints.push(
      "Too many seller profiles matched; use get_company_details with a specific sellerPubkey to inspect one seller."
    );
  }
  const meta = buildToolMeta(
    combineRelayMetas(relayMetas, Date.now() - startedAt),
    {
      resultCount: returnedCompanies.length,
      totalMatches: companies.length,
      truncated: hasMatchingCompaniesBeyondPage,
      dataFreshness: getDataFreshness(returnedCompanies),
      hints,
    }
  );

  return createSuccessResponse(
    {
      count: returnedCompanies.length,
      totalMatches: companies.length,
      companies: returnedCompanies,
      _pagination: {
        nextCursor,
        hasMore,
      },
    },
    meta,
    returnedCompanies.length
  );
}
