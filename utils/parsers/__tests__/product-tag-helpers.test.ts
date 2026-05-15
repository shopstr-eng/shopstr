import {
  getEffectiveShippingCost,
  parseShippingFromTags,
  parseShippingTag,
} from "../product-tag-helpers";

describe("parseShippingTag", () => {
  it("parses the modern 3-value shipping tag format", () => {
    expect(parseShippingTag(["shipping", "Added Cost", "10", "USD"])).toEqual({
      shippingType: "Added Cost",
      shippingCost: 10,
    });
  });

  it("ignores legacy 2-value shipping tags", () => {
    expect(parseShippingTag(["shipping", "5", "USD"])).toBeUndefined();
  });

  it("ignores legacy 1-value shipping tags", () => {
    expect(parseShippingTag(["shipping", "Free"])).toBeUndefined();
  });

  it("ignores malformed shipping tags with non-numeric cost", () => {
    expect(
      parseShippingTag(["shipping", "Added Cost", "not-a-number", "USD"])
    ).toBeUndefined();
  });

  it("ignores malformed shipping tags with negative cost", () => {
    expect(
      parseShippingTag(["shipping", "Added Cost", "-10", "USD"])
    ).toBeUndefined();
  });

  it("property-style rejects legacy and malformed shipping tag shapes without throwing", () => {
    const invalidTags = [
      ["shipping"],
      ["shipping", "Free"],
      ["shipping", "5", "USD"],
      ["shipping", "Added Cost", "", "USD"],
      ["shipping", "Added Cost", "NaN", "USD"],
      ["shipping", "Added Cost", "10"],
      ["shipping", "Unsupported", "10", "USD"],
      ["price", "10", "USD"],
    ];

    for (const tag of invalidTags) {
      expect(() => parseShippingTag(tag)).not.toThrow();
      expect(parseShippingTag(tag)).toBeUndefined();
    }
  });
});

describe("getEffectiveShippingCost", () => {
  it("returns null when shipping metadata is missing", () => {
    expect(getEffectiveShippingCost(undefined, undefined)).toBeNull();
  });

  it("returns zero for non-paid shipping types", () => {
    expect(getEffectiveShippingCost("Free", 15)).toBe(0);
    expect(getEffectiveShippingCost("Free/Pickup", 15)).toBe(0);
    expect(getEffectiveShippingCost("Pickup", 15)).toBe(0);
    expect(getEffectiveShippingCost("N/A", 15)).toBe(0);
  });

  it("returns null when a paid shipping cost is invalid", () => {
    expect(getEffectiveShippingCost("Added Cost", Number.NaN)).toBeNull();
    expect(getEffectiveShippingCost("Added Cost", -15)).toBeNull();
  });

  it("returns the parsed cost for paid shipping", () => {
    expect(getEffectiveShippingCost("Added Cost", 15)).toBe(15);
  });
});

describe("parseShippingFromTags", () => {
  it("accepts a later valid modern shipping tag after legacy tags", () => {
    expect(
      parseShippingFromTags([
        ["shipping", "5", "USD"],
        ["shipping", "Added Cost", "12", "USD"],
      ])
    ).toEqual({
      shippingType: "Added Cost",
      shippingCost: 12,
    });
  });

  it("keeps the last valid modern shipping tag and ignores later malformed tags", () => {
    expect(
      parseShippingFromTags([
        ["shipping", "Added Cost", "12", "USD"],
        ["shipping", "Added Cost", "-1", "USD"],
        ["shipping", "Free"],
        ["shipping", "Added Cost", "15", "USD"],
        ["shipping", "Added Cost", "not-a-number", "USD"],
      ])
    ).toEqual({
      shippingType: "Added Cost",
      shippingCost: 15,
    });
  });
});
