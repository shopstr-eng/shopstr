import parseTags from "../product-parser-functions";
import { calculateTotalCost } from "@/components/utility-components/display-monetary-info";
import { NostrEvent } from "@/utils/types/types";

jest.mock("@/components/utility-components/display-monetary-info", () => ({
  calculateTotalCost: jest.fn(),
}));

const mockedCalculateTotalCost = calculateTotalCost as jest.Mock;

describe("parseTags", () => {
  const baseEvent: NostrEvent = {
    id: "test-id",
    pubkey: "test-pubkey",
    created_at: 1672531200,
    kind: 30023,
    tags: [],
    content: "Product description",
    sig: "test-sig",
  };

  beforeEach(() => {
    mockedCalculateTotalCost.mockClear();
    mockedCalculateTotalCost.mockReturnValue(999);
  });

  it("should parse top-level event data and simple tags correctly", () => {
    const event = {
      ...baseEvent,
      tags: [
        ["title", "My Product"],
        ["summary", "A great product"],
        ["location", "Online"],
      ],
    };
    const result = parseTags(event);

    expect(result.id).toBe("test-id");
    expect(result.pubkey).toBe("test-pubkey");
    expect(result.createdAt).toBe(1672531200);
    expect(result.title).toBe("My Product");
    expect(result.summary).toBe("A great product");
    expect(result.location).toBe("Online");
  });

  it("should parse multiple image and category tags into arrays", () => {
    const event = {
      ...baseEvent,
      tags: [
        ["image", "url1.jpg"],
        ["image", "url2.jpg"],
        ["t", "electronics"],
        ["t", "nostr"],
      ],
    };
    const result = parseTags(event);

    expect(result.images).toEqual(["url1.jpg", "url2.jpg"]);
    expect(result.categories).toEqual(["electronics", "nostr"]);
  });

  it("should parse the price tag into a number and currency string", () => {
    const event = { ...baseEvent, tags: [["price", "19.99", "USD"]] };
    const result = parseTags(event);

    expect(result.price).toBe(19.99);
    expect(result.currency).toBe("USD");
  });

  it("should parse the modern 3-value shipping tag", () => {
    const event = {
      ...baseEvent,
      tags: [["shipping", "Added Cost", "10", "USD"]],
    };
    const result = parseTags(event);

    expect(result.shippingType).toBe("Added Cost");
    expect(result.shippingCost).toBe(10);
  });

  it("should parse the legacy 2-value shipping tag", () => {
    const event = { ...baseEvent, tags: [["shipping", "5", "USD"]] };
    const result = parseTags(event);

    expect(result.shippingType).toBe("Added Cost");
    expect(result.shippingCost).toBe(5);
  });

  it("should parse the simple 1-value shipping tag", () => {
    const event = { ...baseEvent, tags: [["shipping", "Free"]] };
    const result = parseTags(event);

    expect(result.shippingType).toBe("Free");
    expect(result.shippingCost).toBe(0);
  });

  it("should parse various content-warning tags as true", () => {
    const event1 = { ...baseEvent, tags: [["content-warning"]] };
    expect(parseTags(event1).contentWarning).toBe(true);

    const event2 = { ...baseEvent, tags: [["L", "content-warning"]] };
    expect(parseTags(event2).contentWarning).toBe(true);

    const event3 = {
      ...baseEvent,
      tags: [["l", "some-label", "content-warning"]],
    };
    expect(parseTags(event3).contentWarning).toBe(true);
  });

  it("should parse size tags into sizes array and quantities map", () => {
    const event = {
      ...baseEvent,
      tags: [
        ["size", "S", "10"],
        ["size", "M", "5"],
      ],
    };
    const result = parseTags(event);

    expect(result.sizes).toEqual(["S", "M"]);
    expect(result.sizeQuantities).toBeInstanceOf(Map);
    expect(result.sizeQuantities.get("S")).toBe(10);
    expect(result.sizeQuantities.get("M")).toBe(5);
  });

  it("should parse volume tags into volumes array and prices map", () => {
    const event = {
      ...baseEvent,
      tags: [
        ["volume", "100g", "10"],
        ["volume", "500g", "40"],
      ],
    };
    const result = parseTags(event);

    expect(result.volumes).toEqual(["100g", "500g"]);
    expect(result.volumePrices).toBeInstanceOf(Map);
    expect(result.volumePrices.get("100g")).toBe(10);
    expect(result.volumePrices.get("500g")).toBe(40);
  });

  it("should return undefined if tags array is missing", () => {
    const event = { ...baseEvent, tags: undefined };
    expect(parseTags(event)).toBeUndefined();
  });

  it("should call calculateTotalCost with the parsed data and assign its return value", () => {
    const event = { ...baseEvent, tags: [["price", "50", "USD"]] };
    const result = parseTags(event);

    expect(mockedCalculateTotalCost).toHaveBeenCalledTimes(1);
    expect(mockedCalculateTotalCost).toHaveBeenCalledWith(
      expect.objectContaining({
        price: 50,
        currency: "USD",
      })
    );

    expect(result.totalCost).toBe(999);
  });

  it("should ignore unknown tags", () => {
    const event = {
      ...baseEvent,
      tags: [
        ["title", "My Product"],
        ["unknown_tag", "some_value"],
      ],
    };
    const result = parseTags(event);

    expect(result.title).toBe("My Product");
    expect(result).not.toHaveProperty("unknown_tag");
  });

  it("should handle a volume tag without a price", () => {
    const event = { ...baseEvent, tags: [["volume", "100g"]] };
    const result = parseTags(event);

    expect(result.volumes).toEqual(["100g"]);
    expect(result.volumePrices.get("100g")).toBeUndefined();
  });

  it("should ignore L/l tags that are not for content-warning", () => {
    const event = {
      ...baseEvent,
      tags: [
        ["L", "some-other-label"],
        ["l", "another-label", "not-a-warning"],
      ],
    };
    const result = parseTags(event);

    expect(result.contentWarning).toBeFalsy();
  });
});
