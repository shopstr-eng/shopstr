import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { useContext } from "react";
import { ReviewsContext } from "@/utils/context/context";

interface SectionReviewsProps {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
  shopPubkey: string;
}

export default function SectionReviews({
  section,
  colors,
  shopPubkey,
}: SectionReviewsProps) {
  const reviewsContext = useContext(ReviewsContext);

  const merchantReviewData =
    reviewsContext?.merchantReviewsData?.get(shopPubkey);
  const ratings: number[] = merchantReviewData || [];

  if (ratings.length === 0) return null;

  const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;

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
            <div className="flex gap-1 text-xl">
              {Array.from({ length: 5 }).map((_, i) => (
                <span
                  key={i}
                  style={{
                    color:
                      i < Math.round(avgRating)
                        ? colors.primary
                        : colors.text + "22",
                  }}
                >
                  ★
                </span>
              ))}
            </div>
            <span className="font-body text-lg font-bold">
              {avgRating.toFixed(1)}
            </span>
            <span className="font-body opacity-50">
              ({ratings.length} reviews)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
