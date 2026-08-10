import {
  isCartDiscountsMap,
  type CartDiscountsMap,
} from "@/utils/cart-discounts";

describe("isCartDiscountsMap", () => {
  it("returns true for an empty object", () => {
    expect(isCartDiscountsMap({})).toBe(true);
  });

  it("returns true for a map with a single valid entry", () => {
    const value: CartDiscountsMap = { "shop-a": { code: "SAVE10" } };
    expect(isCartDiscountsMap(value)).toBe(true);
  });

  it("returns true for a map with multiple valid entries", () => {
    const value: CartDiscountsMap = {
      "shop-a": { code: "SAVE10" },
      "shop-b": { code: "SAVE20" },
    };
    expect(isCartDiscountsMap(value)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isCartDiscountsMap(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isCartDiscountsMap(undefined)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isCartDiscountsMap("SAVE10")).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isCartDiscountsMap(42)).toBe(false);
  });

  it("returns false for a boolean", () => {
    expect(isCartDiscountsMap(true)).toBe(false);
  });

  it("returns false for an array, even one containing valid-shaped entries", () => {
    expect(isCartDiscountsMap([{ code: "SAVE10" }])).toBe(false);
  });

  it("returns false when an entry is null", () => {
    expect(isCartDiscountsMap({ "shop-a": null })).toBe(false);
  });

  it("returns false when an entry is undefined", () => {
    expect(isCartDiscountsMap({ "shop-a": undefined })).toBe(false);
  });

  it("returns false when an entry is not an object", () => {
    expect(isCartDiscountsMap({ "shop-a": "SAVE10" })).toBe(false);
  });

  it("returns false when an entry is an array", () => {
    expect(isCartDiscountsMap({ "shop-a": ["SAVE10"] })).toBe(false);
  });

  it("returns false when an entry's code is missing", () => {
    expect(isCartDiscountsMap({ "shop-a": {} })).toBe(false);
  });

  it("returns false when an entry's code is not a string", () => {
    expect(isCartDiscountsMap({ "shop-a": { code: 123 } })).toBe(false);
  });

  it("returns false when any single entry among several is invalid", () => {
    expect(
      isCartDiscountsMap({
        "shop-a": { code: "SAVE10" },
        "shop-b": { code: 123 },
      })
    ).toBe(false);
  });
});
