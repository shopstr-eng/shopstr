import { z } from "zod";

import { sellerReputationInputSchema } from "../validation.js";
import { createSuccessResponse, type ToolTextResponse } from "../errors.js";
import {
  buildToolMeta,
  combineRelayMetas,
  createValidationErrorResponse,
  getDataFreshness,
} from "./utils/common.js";
import type { CoreToolContext } from "./utils/context.js";
import {
  fetchSellerProducts,
  fetchSellerProfiles,
  fetchSellerReviews,
  guardSellerNotFound,
} from "./utils/seller.js";
import { calculateReputationStats } from "./utils/rating-stats.js";

const RECENT_REVIEW_BUDGET = 10;

export const getSellerReputationInputSchema = {
  sellerPubkey: z.string().describe("Seller public key as hex or npub"),
};

export async function handleGetSellerReputation(
  args: Record<string, unknown>,
  context: CoreToolContext
): Promise<ToolTextResponse> {
  const parsed = sellerReputationInputSchema.safeParse(args);
  if (!parsed.success) return createValidationErrorResponse(parsed.error);

  const startedAt = Date.now();
  const { sellerPubkey } = parsed.data;
  const [profiles, products] = await Promise.all([
    fetchSellerProfiles(sellerPubkey, context),
    fetchSellerProducts(sellerPubkey, context),
  ]);
  const reviews = await fetchSellerReviews(
    sellerPubkey,
    products.events,
    context
  );
  const relayMeta = combineRelayMetas(
    [profiles.meta, products.meta, reviews.meta],
    Date.now() - startedAt
  );

  const guardError = guardSellerNotFound(
    relayMeta,
    profiles,
    products,
    reviews,
    "Use list_companies to discover seller pubkeys before checking reputation."
  );
  if (guardError) return guardError;

  const stats = calculateReputationStats(reviews.reviews);
  const recentReviews = reviews.reviews.slice(0, RECENT_REVIEW_BUDGET);
  const reputationHints: string[] = [];
  if (reviews.reviews.length === 0) {
    reputationHints.push(
      "No public reviews were found for this seller; inspect product freshness and profile details before recommending purchases."
    );
  }
  if (reviews.reviewLookupPartial) {
    reputationHints.push("Review lookup was partial.");
  }
  const meta = {
    ...buildToolMeta(relayMeta, {
      resultCount: recentReviews.length,
      totalMatches: reviews.reviews.length,
      truncated: recentReviews.length < reviews.reviews.length,
      dataFreshness: getDataFreshness([
        ...recentReviews,
        ...products.returnedProducts,
      ]),
      hints: reputationHints,
    }),
    cached: {
      ...profiles.cache,
      ...products.cache,
      ...reviews.cache,
    },
  };

  const oldestListingTimestamp = products.products.reduce(
    (oldest, product) =>
      product.createdAt > 0 && (oldest === 0 || product.createdAt < oldest)
        ? product.createdAt
        : oldest,
    0
  );

  return createSuccessResponse(
    {
      sellerPubkey,
      seller: {
        shopProfile: profiles.shopProfile,
        userProfile: profiles.userProfile,
        nip05Verification: profiles.nip05Verification,
      },
      productCount: products.products.length,
      reviewCount: reviews.reviews.length,
      reviewCoverage: reviews.reviewLookupPartial ? "partial" : "complete",
      oldestListingDate: oldestListingTimestamp
        ? new Date(oldestListingTimestamp * 1000).toISOString()
        : null,
      reputation: stats,
      recentReviews,
    },
    meta,
    recentReviews.length
  );
}
