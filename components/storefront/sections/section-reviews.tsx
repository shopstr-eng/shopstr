import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { useContext, useMemo } from "react";
import { ReviewsContext } from "@/utils/context/context";
import { Chip } from "@nextui-org/react";
import { ProfileWithDropdown } from "@/components/utility-components/profile/profile-dropdown";
import SellerReviewReply from "@/components/utility-components/seller-review-reply";

interface SectionReviewsProps {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
  shopPubkey: string;
}

interface FlatReview {
  key: string;
  reviewerPubkey: string;
  productDTag: string;
  reviewData: string[][];
}

const getMerchantQuality = (score: number): string => {
  if (score >= 0.75) return "Trustworthy";
  if (score >= 0.5) return "Solid";
  if (score >= 0.25) return "Questionable";
  return "Don't trust, don't bother verifying";
};

const getQualityColor = (score: number): string => {
  if (score >= 0.75) return "#22c55e";
  if (score >= 0.5) return "#3b82f6";
  if (score >= 0.25) return "#f59e0b";
  return "#ef4444";
};

export default function SectionReviews({
  section,
  colors,
  shopPubkey,
}: SectionReviewsProps) {
  const reviewsContext = useContext(ReviewsContext);

  const merchantReviewData =
    reviewsContext?.merchantReviewsData?.get(shopPubkey);
  const ratings = merchantReviewData
    ? Array.from(merchantReviewData.values()).flat()
    : [];

  const weightedScore = useMemo(() => {
    if (ratings.length === 0) return 0;
    return ratings.reduce((a, b) => a + b, 0) / ratings.length;
  }, [ratings]);

  const allReviews = useMemo((): FlatReview[] => {
    const merchantProducts =
      reviewsContext?.productReviewsData?.get(shopPubkey);
    if (!merchantProducts) return [];

    const reviews: FlatReview[] = [];
    for (const [productDTag, productReviews] of merchantProducts.entries()) {
      for (const [reviewerPubkey, reviewData] of productReviews.entries()) {
        reviews.push({
          key: `${productDTag}:${reviewerPubkey}`,
          reviewerPubkey,
          productDTag,
          reviewData,
        });
      }
    }
    return reviews;
  }, [reviewsContext?.productReviewsData, shopPubkey]);

  const orderedReviews = useMemo(() => {
    if (!section.reviewOrder || section.reviewOrder.length === 0)
      return allReviews;

    const reviewMap = new Map(allReviews.map((r) => [r.key, r]));
    const ordered: FlatReview[] = [];
    for (const key of section.reviewOrder) {
      const review = reviewMap.get(key);
      if (review) {
        ordered.push(review);
        reviewMap.delete(key);
      }
    }
    for (const review of reviewMap.values()) {
      ordered.push(review);
    }
    return ordered;
  }, [allReviews, section.reviewOrder]);

  if (ratings.length === 0) return null;

  const quality = getMerchantQuality(weightedScore);
  const qualityColor = getQualityColor(weightedScore);

  return (
    <div
      className="px-4 py-16 md:px-6"
      style={{ backgroundColor: colors.secondary + "08" }}
    >
      <div className="mx-auto max-w-6xl">
        {section.heading && (
          <h2
            className="font-heading mb-4 text-center text-3xl font-bold"
            style={{ color: "var(--sf-text)" }}
          >
            {section.heading}
          </h2>
        )}
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2">
            <span
              className="font-body text-lg font-bold"
              style={{ color: qualityColor }}
            >
              {quality}
            </span>
            <span className="font-body opacity-50">
              ({ratings.length} {ratings.length === 1 ? "review" : "reviews"})
            </span>
          </div>
        </div>

        {orderedReviews.length > 0 && (
          <div className="mx-auto max-w-3xl space-y-4">
            {orderedReviews.map((review) => (
              <div
                key={review.key}
                className="rounded-lg p-5"
                style={{
                  backgroundColor: colors.secondary + "12",
                  border: `1px solid ${colors.text}15`,
                }}
              >
                <div className="mb-3 flex items-center gap-2">
                  <ProfileWithDropdown
                    pubkey={review.reviewerPubkey}
                    dropDownKeys={["shop", "inquiry", "copy_npub"]}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    {review.reviewData.map(([_, value, category], index) => {
                      if (category === undefined) return null;
                      if (category === "thumb") {
                        return (
                          <Chip
                            key={index}
                            className={`border-2 font-bold ${
                              value === "1" ? "bg-green-400" : "bg-red-400"
                            }`}
                            style={{ borderColor: colors.text + "33" }}
                          >
                            {`overall: ${value === "1" ? "👍" : "👎"}`}
                          </Chip>
                        );
                      }
                      return (
                        <Chip
                          key={index}
                          className={`border-2 font-bold ${
                            value === "1" ? "bg-green-400" : "bg-red-400"
                          }`}
                          style={{ borderColor: colors.text + "33" }}
                        >
                          {`${category}: ${value === "1" ? "👍" : "👎"}`}
                        </Chip>
                      );
                    })}
                  </div>
                  {review.reviewData.map(([category, value], index) => {
                    if (category === "comment" && value !== "") {
                      return (
                        <p
                          key={index}
                          className="font-body mt-1 italic"
                          style={{ color: colors.text + "cc" }}
                        >
                          &ldquo;{value}&rdquo;
                        </p>
                      );
                    }
                    return null;
                  })}
                </div>
                <SellerReviewReply
                  reviewEventId={reviewsContext.reviewEventIds.get(
                    `${review.productDTag}:${review.reviewerPubkey}`
                  )}
                  reviewerPubkey={review.reviewerPubkey}
                  merchantPubkey={shopPubkey}
                  compact
                  colorScheme={colors}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
