import { render } from "@testing-library/react";
import { ReviewsContext } from "@/utils/context/context";
import SectionReviews from "@/components/storefront/sections/section-reviews";

const SELLER = "a".repeat(64);

function renderWith(scores: number[]) {
  const ctx: any = {
    merchantReviewsData: new Map([[SELLER, scores]]),
    productReviewsData: new Map(),
  };
  const { container } = render(
    <ReviewsContext.Provider value={ctx}>
      <SectionReviews
        section={{ type: "reviews", heading: "Reviews" } as any}
        colors={
          { primary: "#ff0000", secondary: "#000000", text: "#111111" } as any
        }
        shopPubkey={SELLER}
      />
    </ReviewsContext.Provider>
  );
  const stars = Array.from(container.querySelectorAll("span")).filter(
    (s) => s.textContent === "★"
  );
  const lit = stars.filter(
    (s) => (s as HTMLElement).style.color === "rgb(255, 0, 0)"
  );
  return { text: container.textContent, lit: lit.length, total: stars.length };
}

describe("SectionReviews", () => {
  it("shows a perfect shop as 5 of 5 stars", () => {
    const { text, lit, total } = renderWith([1, 1, 1]);
    expect(total).toBe(5);
    expect(lit).toBe(5);
    expect(text).toContain("5.0");
    expect(text).toContain("(3 reviews)");
  });

  it("scales a mixed score to the 5 star range", () => {
    const { text, lit } = renderWith([1, 0.5]);
    expect(lit).toBe(4);
    expect(text).toContain("3.8");
  });

  it("shows 0 lit stars for a shop with only bad reviews", () => {
    expect(renderWith([0, 0]).lit).toBe(0);
  });
});
