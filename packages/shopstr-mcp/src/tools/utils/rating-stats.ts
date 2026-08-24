import type { ReviewResponse } from "../../types.js";

type ReviewScore = {
  score: number | null;
  ratings: Record<string, number>;
};

export function calculateReputationStats(reviews: readonly ReviewResponse[]): {
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
    trustLevel: determineTrustLevel(averageScore, numericScores.length),
    formula:
      "Scores use kind 31555 rating tags, deduplicated to one review per unique reviewer pubkey per target. Each rating value is clamped to the 0..1 range; when a thumb rating is present it contributes 50% of the overall score and the remaining ratings split the other 50% (or 100% when thumb is absent). Reviewer pubkeys are freely creatable and not linked to verified purchases, and reviews are replaceable events that may have been edited after initial publication; no edit history is exposed.",
  };
}

export function scoreReview(review: ReviewResponse): ReviewScore {
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

export function buildRatingBreakdown(
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

export function determineTrustLevel(
  averageScore: number | null,
  reviewCount: number
): "unknown" | "low" | "medium" | "high" {
  if (averageScore === null || reviewCount === 0) return "unknown";
  if (reviewCount >= 5 && averageScore >= 0.8) return "high";
  if (reviewCount >= 2 && averageScore >= 0.6) return "medium";
  return "low";
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
