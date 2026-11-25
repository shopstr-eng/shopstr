import {
  getRatingValue,
  calculateWeightedScore,
  getReviewScore,
  parseRatingValue,
} from "../review-parser-functions";

describe("parseRatingValue", () => {
  it("keeps values between 0 and 1", () => {
    expect(parseRatingValue("0")).toBe(0);
    expect(parseRatingValue("0.25")).toBe(0.25);
    expect(parseRatingValue("1")).toBe(1);
  });

  it("clamps out of range values", () => {
    expect(parseRatingValue("5")).toBe(1);
    expect(parseRatingValue("-1e9")).toBe(0);
  });

  it("ignores values that are not finite numbers", () => {
    expect(parseRatingValue("great")).toBeUndefined();
    expect(parseRatingValue("NaN")).toBeUndefined();
    expect(parseRatingValue("Infinity")).toBeUndefined();
    expect(parseRatingValue("")).toBeUndefined();
    expect(parseRatingValue(undefined)).toBeUndefined();
  });
});

describe("getRatingValue", () => {
  const sampleTags: string[][] = [
    ["rating", "0.5", "thumb"],
    ["rating", "5", "shipping"],
    ["p", "some_pubkey_here"],
  ];

  it("returns the clamped value of an existing rating tag", () => {
    expect(getRatingValue(sampleTags, "thumb")).toBe(0.5);
    expect(getRatingValue(sampleTags, "shipping")).toBe(1);
  });

  it("returns 0 when the rating is missing", () => {
    expect(getRatingValue(sampleTags, "quality")).toBe(0);
    expect(getRatingValue([], "thumb")).toBe(0);
  });
});

describe("getReviewScore", () => {
  it("uses the thumb alone when there are no other ratings", () => {
    expect(getReviewScore([["rating", "1", "thumb"]])).toBe(1);
    expect(getReviewScore([["rating", "0", "thumb"]])).toBe(0);
  });

  it("gives the thumb half and splits the rest", () => {
    expect(
      getReviewScore([
        ["rating", "1", "thumb"],
        ["rating", "1", "quality"],
        ["rating", "0", "delivery"],
        ["rating", "0", "value"],
        ["rating", "1", "communication"],
      ])
    ).toBe(0.75);
  });

  it("averages the ratings when there is no thumb", () => {
    expect(
      getReviewScore([
        ["rating", "1", "quality"],
        ["rating", "0", "delivery"],
      ])
    ).toBe(0.5);
  });

  it("returns null when there is no valid rating", () => {
    expect(getReviewScore([["p", "x"]])).toBeNull();
    expect(getReviewScore([["rating", "great", "thumb"]])).toBeNull();
  });

  it("stays between 0 and 1 for forged values", () => {
    expect(
      getReviewScore([
        ["rating", "-1e9", "thumb"],
        ["rating", "1e9", "quality"],
      ])
    ).toBe(0.5);
    expect(getReviewScore([["rating", "1e9", "thumb"]])).toBe(1);
  });

  it("ignores invalid categories and counts each category once", () => {
    expect(
      getReviewScore([
        ["rating", "1", "thumb"],
        ["rating", "oops", "quality"],
        ["rating", "0", "delivery"],
        ["rating", "1", "delivery"],
      ])
    ).toBe(1);
  });
});

describe("calculateWeightedScore", () => {
  it("returns the review score", () => {
    expect(
      calculateWeightedScore([
        ["rating", "1", "thumb"],
        ["rating", "0", "quality"],
      ])
    ).toBe(0.5);
  });

  it("returns 0 when there are no valid ratings", () => {
    expect(calculateWeightedScore([["p", "x"]])).toBe(0);
  });
});
