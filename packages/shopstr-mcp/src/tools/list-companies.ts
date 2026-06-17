import { z } from "zod";

import { mergeAndDeduplicateProfiles } from "../dedup.js";
import { createSuccessResponse, type ToolTextResponse } from "../errors.js";
import { parseProfileEvent } from "../parse-tags.js";
import { fetchFromRelays } from "../relay-fetch.js";
import { listCompaniesSchema } from "../validation.js";
import {
  SELLER_LIST_RESPONSE_BUDGET,
  SHOP_PROFILE_KIND,
  allRelaysFailed,
  buildToolMeta,
  createRelayUnavailableResponse,
  createValidationErrorResponse,
  getDataFreshness,
} from "./utils/common.js";
import type { CoreToolContext } from "./utils/context.js";

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
};

export async function handleListCompanies(
  args: Record<string, unknown>,
  context: CoreToolContext
): Promise<ToolTextResponse> {
  const parsed = listCompaniesSchema.safeParse(args);
  if (!parsed.success) return createValidationErrorResponse(parsed.error);

  const relayResult = await fetchFromRelays(
    context.nostr,
    context.relays,
    [
      {
        kinds: [SHOP_PROFILE_KIND],
        limit: 500,
        ...(parsed.data.until !== undefined && { until: parsed.data.until }),
      },
    ],
    { timeoutMs: context.timeoutMs }
  );

  if (allRelaysFailed(relayResult.meta)) {
    return createRelayUnavailableResponse(relayResult.meta);
  }

  const companies = mergeAndDeduplicateProfiles(relayResult.events).map(
    parseProfileEvent
  );
  for (const company of companies) {
    context.cache.set(
      { pubkey: company.pubkey, kind: SHOP_PROFILE_KIND },
      company
    );
  }

  const requestedLimit = parsed.data.limit;
  const responseLimit = Math.min(requestedLimit, SELLER_LIST_RESPONSE_BUDGET);
  const returnedCompanies = companies.slice(0, responseLimit);
  const truncated = returnedCompanies.length < companies.length;
  const hints = truncated
    ? [
        "Too many seller profiles matched; use get_company_details with a specific pubkey to inspect one seller.",
      ]
    : [];
  const meta = buildToolMeta(relayResult.meta, {
    resultCount: returnedCompanies.length,
    totalMatches: companies.length,
    truncated,
    dataFreshness: getDataFreshness(returnedCompanies),
    hints,
  });

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
      },
    },
    meta,
    returnedCompanies.length
  );
}
