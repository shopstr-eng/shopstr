import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { useContext, useMemo } from "react";
import { ReviewsContext } from "@/utils/context/context";
import { Chip } from "@heroui/react";
import { ProfileWithDropdown } from "@/components/utility-components/profile/profile-dropdown";
import SellerReviewReply from "@/components/utility-components/seller-review-reply";

interface Props {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
  shopPubkey: string;
  productDTag: string;
}

interface FlatReview {
  key: string;
  reviewerPubkey: string;
  reviewData: string[][];
}

export default function SectionProductReviews({
  section,
  colors,
  shopPubkey,
  productDTag,
}: Props) {
  const reviewsContext = useContext(ReviewsContext);

  const productReviews = useMemo(() => {
    const merchantProducts =
      reviewsContext?.productReviewsData?.get(shopPubkey);
    if (!merchantProducts) return new Map<string, string[][]>();
    return merchantProducts.get(productDTag) || new Map<string, string[][]>();
  }, [reviewsContext?.productReviewsData, shopPubkey, productDTag]);

  const reviews: FlatReview[] = useMemo(() => {
    const list: FlatReview[] = [];
    for (const [reviewerPubkey, reviewData] of productReviews.entries()) {
      list.push({
        key: `${productDTag}:${reviewerPubkey}`,
        reviewerPubkey,
        reviewData,
      });
    }
    return list;
  }, [productReviews, productDTag]);

  const ratings = useMemo(() => {
    const merchantReviewData =
      reviewsContext?.merchantReviewsData?.get(shopPubkey);
    if (!merchantReviewData) return [] as number[];
    const productRatings = (
      merchantReviewData as unknown as Map<string, number[]>
    ).get(productDTag);
    return productRatings || [];
  }, [reviewsContext?.merchantReviewsData, shopPubkey, productDTag]);

  const avg = useMemo(() => {
    if (ratings.length === 0) return 0;
    return ratings.reduce((a, b) => a + b, 0) / ratings.length;
  }, [ratings]);

  const heading = section.heading || "Customer Reviews";

  return (
    <div
      className="px-4 py-12 md:px-6"
      style={{ backgroundColor: colors.secondary + "08" }}
    >
      <div className="mx-auto max-w-4xl">
        <h2
          className="font-heading mb-2 text-2xl font-bold md:text-3xl"
          style={{ color: colors.text }}
        >
          {heading}
        </h2>
        {ratings.length === 0 ? (
          <p
            className="font-body text-sm opacity-60"
            style={{ color: colors.text }}
          >
            No reviews yet for this product.
          </p>
        ) : (
          <>
            <div className="mb-6 flex items-center gap-2">
              <span
                className="font-body text-base font-bold"
                style={{ color: colors.accent }}
              >
                {Math.round(avg * 100)}% positive
              </span>
              <span
                className="font-body text-sm opacity-60"
                style={{ color: colors.text }}
              >
                ({ratings.length} {ratings.length === 1 ? "review" : "reviews"})
              </span>
            </div>
            <div className="space-y-4">
              {reviews.map((review) => (
                <div
                  key={review.key}
                  className="rounded-lg p-5"
                  style={{
                    backgroundColor: colors.background,
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
                      `${productDTag}:${review.reviewerPubkey}`
                    )}
                    reviewerPubkey={review.reviewerPubkey}
                    merchantPubkey={shopPubkey}
                    compact
                    colorScheme={colors}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
