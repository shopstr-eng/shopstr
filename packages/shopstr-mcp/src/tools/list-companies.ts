import { z } from "zod";

import {
  mergeAndDeduplicateProducts,
  mergeAndDeduplicateProfiles,
} from "../dedup.js";
import { createSuccessResponse, type ToolTextResponse } from "../errors.js";
import { parseProductEvent, parseProfileEvent } from "../parse-tags.js";
import { fetchFromRelays } from "../relay-fetch.js";
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
  until: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Unix timestamp. Only return profiles created at or before this time. Use for pagination by passing the oldest createdAt from the previous response."
    ),
  category: z
    .string()
    .max(100)
    .optional()
    .describe(
      "Optional product category filter. Sellers are included only when they have at least one public product tagged with this category."
    ),
};

export async function handleListCompanies(
  args: Record<string, unknown>,
  context: CoreToolContext
): Promise<ToolTextResponse> {
  const parsed = listCompaniesSchema.safeParse(args);
  if (!parsed.success) return createValidationErrorResponse(parsed.error);

  const startedAt = Date.now();
  const relayMetas = [];
  const profileRelayResult = await fetchFromRelays(
    context.nostr,
    context.relays,
    [
      {
        kinds: [SHOP_PROFILE_KIND],
        limit: Math.min(
          500,
          Math.min(parsed.data.limit, SELLER_LIST_RESPONSE_BUDGET) * 5
        ),
        ...(parsed.data.until !== undefined && { until: parsed.data.until }),
      },
    ],
    { timeoutMs: context.timeoutMs }
  );
  relayMetas.push(profileRelayResult.meta);

  if (allRelaysFailed(profileRelayResult.meta)) {
    return createRelayUnavailableResponse(profileRelayResult.meta);
  }

  let companies = mergeAndDeduplicateProfiles(profileRelayResult.events).map(
    parseProfileEvent
  );
  for (const company of companies) {
    context.cache.set(
      { pubkey: company.pubkey, kind: SHOP_PROFILE_KIND },
      company
    );
  }

  const hints: string[] = [];
  if (parsed.data.category) {
    const category = normalizeCategoryTag(parsed.data.category);
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
    companies = companies.filter((company) =>
      sellerPubkeys.has(company.pubkey)
    );
    if (sellerPubkeys.size === 0) {
      hints.push(
        `No public products tagged with category "${category}" were observed in the sampled relay results.`
      );
    }
  }

  const requestedLimit = parsed.data.limit;
  const responseLimit = Math.min(requestedLimit, SELLER_LIST_RESPONSE_BUDGET);
  const returnedCompanies = companies.slice(0, responseLimit);
  const truncated = returnedCompanies.length < companies.length;
  if (truncated) {
    hints.push(
      "Too many seller profiles matched; use get_company_details with a specific sellerPubkey to inspect one seller."
    );
  }
  const meta = buildToolMeta(
    combineRelayMetas(relayMetas, Date.now() - startedAt),
    {
      resultCount: returnedCompanies.length,
      totalMatches: companies.length,
      truncated,
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
        oldestCreatedAt:
          returnedCompanies.length > 0
            ? returnedCompanies[returnedCompanies.length - 1]!.createdAt
            : null,
        hasMore: truncated,
      },
    },
    meta,
    returnedCompanies.length
  );
}
