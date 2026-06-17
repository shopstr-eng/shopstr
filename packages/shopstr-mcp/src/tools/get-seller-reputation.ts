import { z } from "zod";

import type { ReviewResponse } from "../types.js";
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

const RECENT_REVIEW_BUDGET = 10;

export const getSellerReputationInputSchema = {
  sellerPubkey: z.string().describe("Seller public key as hex or npub"),
};

type ReviewScore = {
  score: number | null;
  ratings: Record<string, number>;
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
  const meta = {
    ...buildToolMeta(relayMeta, {
      resultCount: recentReviews.length,
      totalMatches: reviews.reviews.length,
      truncated: recentReviews.length < reviews.reviews.length,
      dataFreshness: getDataFreshness([
        ...recentReviews,
        ...products.returnedProducts,
      ]),
      hints:
        reviews.reviews.length === 0
          ? [
              "No public reviews were found for this seller; inspect product freshness and profile details before recommending purchases.",
            ]
          : [],
    }),
    cached: profiles.cache,
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
      },
      productCount: products.products.length,
      reviewCount: reviews.reviews.length,
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

function calculateReputationStats(reviews: readonly ReviewResponse[]): {
  averageScore: number | null;
  averagePercent: number | null;
  ratingBreakdown: Record<string, { average: number; count: number }>;
  positiveReviewCount: number;
  neutralReviewCount: number;
  negativeReviewCount: number;
  trustLevel: "unknown" | "low" | "medium" | "high";
  formula: string;
} {
  const scores = reviews.map(scoreReview);
  const numericScores = scores
    .map((entry) => entry.score)
    .filter((score): score is number => score !== null);
  const averageScore =
    numericScores.length > 0
      ? round(
          numericScores.reduce((sum, score) => sum + score, 0) /
            numericScores.length
        )
      : null;
  const ratingBreakdown = buildRatingBreakdown(scores);
  const positiveReviewCount = numericScores.filter(
    (score) => score >= 0.75
  ).length;
  const negativeReviewCount = numericScores.filter(
    (score) => score <= 0.4
  ).length;
  const neutralReviewCount =
    numericScores.length - positiveReviewCount - negativeReviewCount;

  return {
    averageScore,
    averagePercent:
      averageScore === null ? null : Math.round(averageScore * 100),
    ratingBreakdown,
    positiveReviewCount,
    neutralReviewCount,
    negativeReviewCount,
    trustLevel: determineTrustLevel(averageScore, reviews.length),
    formula:
      "Scores use kind 31555 rating tags. When thumb is present it contributes 50%; other rating categories split the remaining 50%. Scores are normalized from 0 to 1.",
  };
}

function scoreReview(review: ReviewResponse): ReviewScore {
  const entries = Object.entries(review.ratings)
    .filter(([, value]) => Number.isFinite(value))
    .map(([key, value]) => [key, clamp01(value)] as const);
  if (entries.length === 0) return { score: null, ratings: {} };

  const ratings = Object.fromEntries(entries);
  const thumb = ratings.thumb;
  const otherRatings = entries.filter(([key]) => key !== "thumb");
  if (thumb !== undefined) {
    const otherAverage =
      otherRatings.length > 0
        ? otherRatings.reduce((sum, [, value]) => sum + value, 0) /
          otherRatings.length
        : thumb;
    return {
      score: round(thumb * 0.5 + otherAverage * 0.5),
      ratings,
    };
  }

  return {
    score: round(
      entries.reduce((sum, [, value]) => sum + value, 0) / entries.length
    ),
    ratings,
  };
}

function buildRatingBreakdown(
  scores: readonly ReviewScore[]
): Record<string, { average: number; count: number }> {
  const buckets = new Map<string, number[]>();

  for (const score of scores) {
    for (const [key, value] of Object.entries(score.ratings)) {
      const bucket = buckets.get(key) ?? [];
      bucket.push(value);
      buckets.set(key, bucket);
    }
  }

  return Object.fromEntries(
    Array.from(buckets.entries()).map(([key, values]) => [
      key,
      {
        average: round(
          values.reduce((sum, value) => sum + value, 0) / values.length
        ),
        count: values.length,
      },
    ])
  );
}

function determineTrustLevel(
  averageScore: number | null,
  reviewCount: number
): "unknown" | "low" | "medium" | "high" {
  if (averageScore === null || reviewCount === 0) return "unknown";
  if (reviewCount >= 5 && averageScore >= 0.8) return "high";
  if (reviewCount >= 2 && averageScore >= 0.6) return "medium";
  return "low";
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
