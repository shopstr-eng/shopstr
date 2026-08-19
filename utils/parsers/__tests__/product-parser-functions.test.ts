import parseTags, { buildUiVariantMaps } from "../product-parser-functions";
import {
  parseProductEvent,
  parseProductEventWithLimits,
} from "../canonical-product-parser";
import { calculateTotalCost } from "@/utils/parsers/product-tag-helpers";
import { NostrEvent } from "@/utils/types/types";

jest.mock("@/utils/parsers/product-tag-helpers", () => ({
  ...jest.requireActual("@/utils/parsers/product-tag-helpers"),
  calculateTotalCost: jest.fn(),
}));

const mockedCalculateTotalCost = calculateTotalCost as jest.Mock;
const totalCostWithoutShipping = ({
  price,
  shippingCost,
}: {
  price: number;
  shippingCost?: number;
}) => price + (shippingCost ?? 0);

describe("parseTags", () => {
  const baseEvent: NostrEvent = {
    id: "test-id",
    pubkey: "test-pubkey",
    created_at: 1672531200,
    kind: 30402,
    tags: [],
    content: "Product description",
    sig: "test-sig",
  };

  beforeEach(() => {
    mockedCalculateTotalCost.mockClear();
    mockedCalculateTotalCost.mockReturnValue(999);
  });

  it("should parse top-level event data and prefer content as description", () => {
    const event = {
      ...baseEvent,
      tags: [
        ["title", "My Product"],
        ["summary", "A great product"],
        ["location", "Online"],
      ],
    };
    const result = parseTags(event)!;

    expect(result.id).toBe("test-id");
    expect(result.pubkey).toBe("test-pubkey");
    expect(result.createdAt).toBe(1672531200);
    expect(result.title).toBe("My Product");
    expect(result.summary).toBe("Product description");
    expect(result.location).toBe("Online");
  });

  it("should parse a NIP-99 classified listing event", () => {
    const event = {
      ...baseEvent,
      id: "listing-event-id",
      pubkey: "seller-pubkey",
      created_at: 1710000000,
      content: "NIP-99 listing description from event content",
      tags: [
        ["d", "seller-listing-1"],
        ["title", "Handmade Wallet"],
        ["summary", "Legacy summary should not replace content"],
        ["published_at", "1710000000"],
        ["image", "https://example.com/front.jpg"],
        ["image", "https://example.com/back.jpg"],
        ["t", "accessories"],
        ["t", "nostr"],
        ["location", "Austin, TX"],
        ["price", "25", "USD"],
        ["shipping", "Added Cost", "5", "USD"],
        ["quantity", "3"],
      ],
    };

    const result = parseTags(event)!;

    expect(result).toEqual(
      expect.objectContaining({
        id: "listing-event-id",
        pubkey: "seller-pubkey",
        createdAt: 1710000000,
        d: "seller-listing-1",
        title: "Handmade Wallet",
        summary: "NIP-99 listing description from event content",
        publishedAt: "1710000000",
        images: [
          "https://example.com/front.jpg",
          "https://example.com/back.jpg",
        ],
        categories: ["accessories", "nostr"],
        location: "Austin, TX",
        price: 25,
        currency: "USD",
        shippingType: "Added Cost",
        shippingCost: 5,
        quantity: 3,
        totalCost: 999,
        rawEvent: event,
      })
    );
    expect(mockedCalculateTotalCost).toHaveBeenCalledWith(
      expect.objectContaining({
        d: "seller-listing-1",
        price: 25,
        currency: "USD",
        shippingCost: 5,
      })
    );
  });

  it("should fallback to summary tag when content is empty", () => {
    const event = {
      ...baseEvent,
      content: "",
      tags: [["summary", "Fallback summary"]],
    };
    const result = parseTags(event)!;

    expect(result.summary).toBe("Fallback summary");
  });

  it("should fallback to summary tag when content is only whitespace", () => {
    const event = {
      ...baseEvent,
      content: "   ",
      tags: [
        ["d", "listing-with-blank-content"],
        ["summary", "Whitespace fallback summary"],
      ],
    };
    const result = parseTags(event)!;

    expect(result.d).toBe("listing-with-blank-content");
    expect(result.summary).toBe("Whitespace fallback summary");
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
    const result = parseTags(event)!;

    expect(result.images).toEqual(["url1.jpg", "url2.jpg"]);
    expect(result.categories).toEqual(["electronics", "nostr"]);
  });

  it("should parse the price tag into a number and currency string", () => {
    const event = { ...baseEvent, tags: [["price", "19.99", "USD"]] };
    const result = parseTags(event)!;

    expect(result.price).toBe(19.99);
    expect(result.currency).toBe("USD");
    expect(result.priceStatus).toBe("known");
  });

  it("should preserve canonical product type, format, visibility, and subscription fields", () => {
    const result = parseTags({
      ...baseEvent,
      tags: [
        ["type", "variable", "physical"],
        ["visibility", "pre-order"],
        ["price", "19.99", "USD", "monthly"],
        ["subscription_discount", "10"],
      ],
    })!;

    expect(result.productType).toBe("variable");
    expect(result.productFormat).toBe("physical");
    expect(result.visibility).toBe("pre-order");
    expect(result.subscription).toEqual({
      enabled: true,
      discount: 10,
      frequencies: ["monthly"],
    });
  });

  it("should not coerce malformed or negative prices to zero", () => {
    const malformed = parseTags({
      ...baseEvent,
      tags: [["price", "not-a-number", "USD"]],
    })!;
    const negative = parseTags({
      ...baseEvent,
      tags: [["price", "-1", "USD"]],
    })!;

    expect(malformed.price).toBeUndefined();
    expect(malformed.currency).toBe("USD");
    expect(malformed.priceStatus).toBe("invalid");
    expect(negative.price).toBeUndefined();
    expect(negative.currency).toBe("USD");
    expect(negative.priceStatus).toBe("invalid");
  });

  it("should mark missing prices without adding a zero price", () => {
    const result = parseTags({ ...baseEvent, tags: [] })!;

    expect(result.price).toBeUndefined();
    expect(result.currency).toBe("");
    expect(result.priceStatus).toBe("missing");
  });

  it("should parse the modern 4-element shipping tag", () => {
    const event = {
      ...baseEvent,
      tags: [["shipping", "Added Cost", "10", "USD"]],
    };
    const result = parseTags(event)!;

    expect(result.shippingType).toBe("Added Cost");
    expect(result.shippingCost).toBe(10);
  });

  it("should ignore legacy shipping tags when a modern shipping tag is also present", () => {
    mockedCalculateTotalCost.mockImplementation(totalCostWithoutShipping);

    const event = {
      ...baseEvent,
      tags: [
        ["price", "50", "USD"],
        ["shipping", "5", "USD"],
        ["shipping", "Free", "0", "USD"],
      ],
    };
    const result = parseTags(event)!;

    expect(result.shippingType).toBe("Free");
    expect(result.shippingCost).toBe(0);
    expect(result.totalCost).toBe(50);
  });

  it("should ignore legacy 2-value shipping tags", () => {
    mockedCalculateTotalCost.mockImplementation(totalCostWithoutShipping);

    const event = {
      ...baseEvent,
      tags: [
        ["price", "50", "USD"],
        ["shipping", "5", "USD"],
      ],
    };
    const result = parseTags(event)!;

    expect(result.shippingType).toBeUndefined();
    expect(result.shippingCost).toBeUndefined();
    expect(result.totalCost).toBe(50);
  });

  it("should ignore legacy 1-value shipping tags", () => {
    mockedCalculateTotalCost.mockImplementation(totalCostWithoutShipping);

    const event = {
      ...baseEvent,
      tags: [
        ["price", "50", "USD"],
        ["shipping", "Free"],
      ],
    };
    const result = parseTags(event)!;

    expect(result.shippingType).toBeUndefined();
    expect(result.shippingCost).toBeUndefined();
    expect(result.totalCost).toBe(50);
  });

  it("should ignore malformed modern shipping tags with non-numeric cost", () => {
    mockedCalculateTotalCost.mockImplementation(totalCostWithoutShipping);

    const event = {
      ...baseEvent,
      tags: [
        ["price", "50", "USD"],
        ["shipping", "Added Cost", "not-a-number", "USD"],
      ],
    };
    const result = parseTags(event)!;

    expect(result.shippingType).toBeUndefined();
    expect(result.shippingCost).toBeUndefined();
    expect(result.totalCost).toBe(50);
  });

  it("should ignore malformed modern shipping tags with negative cost", () => {
    mockedCalculateTotalCost.mockImplementation(totalCostWithoutShipping);

    const event = {
      ...baseEvent,
      tags: [
        ["price", "50", "USD"],
        ["shipping", "Added Cost", "-10", "USD"],
      ],
    };
    const result = parseTags(event)!;

    expect(result.shippingType).toBeUndefined();
    expect(result.shippingCost).toBeUndefined();
    expect(result.totalCost).toBe(50);
  });

  it("should parse various content-warning tags as true", () => {
    const event1 = { ...baseEvent, tags: [["content-warning"]] };
    expect(parseTags(event1)!.contentWarning).toBe(true);

    const event2 = { ...baseEvent, tags: [["L", "content-warning"]] };
    expect(parseTags(event2)!.contentWarning).toBe(true);

    const event3 = {
      ...baseEvent,
      tags: [["l", "some-label", "content-warning"]],
    };
    expect(parseTags(event3)!.contentWarning).toBe(true);
  });

  it("should parse size tags into sizes array and quantities map", () => {
    const event = {
      ...baseEvent,
      tags: [
        ["size", "S", "10"],
        ["size", "M", "5"],
      ],
    };
    const result = parseTags(event)!;

    expect(result.sizes).toEqual(["S", "M"]);
    expect(result.sizeQuantities).toBeInstanceOf(Map);
    expect(result.sizeQuantities!.get("S")).toBe(10);
    expect(result.sizeQuantities!.get("M")).toBe(5);
  });

  it("should convert canonical variant arrays into UI maps", () => {
    const maps = buildUiVariantMaps({
      id: "product",
      pubkey: "seller",
      title: "",
      summary: "",
      images: [],
      categories: [],
      location: "",
      priceStatus: "missing",
      createdAt: 1,
      subscription: { enabled: false, frequencies: [] },
      sizes: [{ size: "S", quantity: 2 }],
      volumes: [{ volume: "100g", price: 10 }],
      weights: [{ weight: "1lb", price: 20 }],
      bulk: [{ units: 5, price: 45 }],
    });

    expect(maps.sizes).toEqual(["S"]);
    expect(maps.sizeQuantities.get("S")).toBe(2);
    expect(maps.volumes).toEqual(["100g"]);
    expect(maps.volumePrices.get("100g")).toBe(10);
    expect(maps.weights).toEqual(["1lb"]);
    expect(maps.weightPrices.get("1lb")).toBe(20);
    expect(maps.bulkPrices.get(5)).toBe(45);
  });

  it("does not cap UI images or variant tags", () => {
    const tags: string[][] = [];
    for (let i = 0; i < 500; i++) {
      tags.push(["image", `image-${i}`]);
      tags.push(["size", `size-${i}`, `${i}`]);
    }

    const result = parseTags({ ...baseEvent, tags })!;

    expect(result.images).toHaveLength(500);
    expect(result.sizes).toHaveLength(500);
    expect(result.images[499]).toBe("image-499");
    expect(result.sizes![499]).toBe("size-499");
  });

  it("applies collection limits inside the canonical parser for bounded consumers", () => {
    const tags: string[][] = [];
    for (let i = 0; i < 500; i++) {
      tags.push(["image", `image-${i}`]);
      tags.push(["size", `size-${i}`, `${i}`]);
      tags.push(["shipping_option", `shipping-${i}`, `${i}`]);
    }

    const result = parseProductEventWithLimits(
      { ...baseEvent, tags },
      {
        images: 10,
        sizes: 50,
        shippingOptions: 10,
      }
    );

    expect(result.images).toHaveLength(10);
    expect(result.sizes).toHaveLength(50);
    expect(result.shippingOptions).toHaveLength(10);
  });

  it("should parse volume tags into volumes array and prices map", () => {
    const event = {
      ...baseEvent,
      tags: [
        ["volume", "100g", "10"],
        ["volume", "500g", "40"],
      ],
    };
    const result = parseTags(event)!;

    expect(result.volumes).toEqual(["100g", "500g"]);
    expect(result.volumePrices).toBeInstanceOf(Map);
    expect(result.volumePrices!.get("100g")).toBe(10);
    expect(result.volumePrices!.get("500g")).toBe(40);
  });

  it("should parse bulk, condition, status, required, restrictions, pickup_location, and valid_until tags", () => {
    const event = {
      ...baseEvent,
      tags: [
        ["bulk", "10", "15.5"],
        ["bulk", "25", "30"],
        ["condition", "new"],
        ["status", "available"],
        ["required", "membership"],
        ["restrictions", "18+ only"],
        ["pickup_location", "Warehouse A"],
        ["pickup_location", "Shop Front"],
        ["valid_until", "1710001234"],
      ],
    };
    const result = parseTags(event)!;

    expect(result.bulkPrices).toBeInstanceOf(Map);
    expect(result.bulkPrices!.get(10)).toBe(15.5);
    expect(result.bulkPrices!.get(25)).toBe(30);
    expect(result.condition).toBe("new");
    expect(result.status).toBe("available");
    expect(result.required).toBe("membership");
    expect(result.restrictions).toBe("18+ only");
    expect(result.pickupLocations).toEqual(["Warehouse A", "Shop Front"]);
    expect(result.expiration).toBe(1710001234);
  });

  it("should expose required_customer_info through the legacy UI required field", () => {
    const result = parseTags({
      ...baseEvent,
      tags: [["required_customer_info", "email"]],
    })!;

    expect(result.required).toBe("email");
    expect(result.requiredCustomerInfo).toBe("email");
  });

  it("should expose the legacy required field through requiredCustomerInfo", () => {
    const result = parseProductEvent({
      ...baseEvent,
      tags: [["required", "membership"]],
    });

    expect(result.required).toBe("membership");
    expect(result.requiredCustomerInfo).toBe("membership");
  });

  it("should preserve both required fields when both are explicitly provided", () => {
    const result = parseProductEvent({
      ...baseEvent,
      tags: [
        ["required", "membership"],
        ["required_customer_info", "email"],
      ],
    });

    expect(result.required).toBe("membership");
    expect(result.requiredCustomerInfo).toBe("email");
  });

  it("should return undefined if tags array is missing", () => {
    const event = { ...baseEvent, tags: undefined } as unknown as NostrEvent;
    expect(parseTags(event)).toBeUndefined();
  });

  it("should call calculateTotalCost with the parsed data and assign its return value", () => {
    const event = { ...baseEvent, tags: [["price", "50", "USD"]] };
    const result = parseTags(event)!;

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
    const result = parseTags(event)!;

    expect(result.title).toBe("My Product");
    expect(result).not.toHaveProperty("unknown_tag");
  });

  it("should handle a volume tag without a price", () => {
    const event = { ...baseEvent, tags: [["volume", "100g"]] };
    const result = parseTags(event)!;

    expect(result.volumes).toEqual(["100g"]);
    expect(result.volumePrices!.get("100g")).toBeUndefined();
  });

  it("should ignore a volume tag without a value", () => {
    const event = { ...baseEvent, tags: [["volume"]] };
    const result = parseTags(event)!;

    expect(result.volumes).toEqual([]);
    expect(result.volumePrices).toBeInstanceOf(Map);
    expect(result.volumePrices!.size).toBe(0);
  });

  it("should parse weight tags into weights array and prices map", () => {
    const event = {
      ...baseEvent,
      tags: [
        ["weight", "1 oz", "10"],
        ["weight", "1 lb", "80"],
      ],
    };
    const result = parseTags(event)!;

    expect(result.weights).toEqual(["1 oz", "1 lb"]);
    expect(result.weightPrices).toBeInstanceOf(Map);
    expect(result.weightPrices!.get("1 oz")).toBe(10);
    expect(result.weightPrices!.get("1 lb")).toBe(80);
  });

  it("should handle a weight tag without a price", () => {
    const event = { ...baseEvent, tags: [["weight", "1 oz"]] };
    const result = parseTags(event)!;

    expect(result.weights).toEqual(["1 oz"]);
    expect(result.weightPrices!.get("1 oz")).toBeUndefined();
  });

  it("should ignore a weight tag without a value", () => {
    const event = { ...baseEvent, tags: [["weight"]] };
    const result = parseTags(event)!;

    expect(result.weights).toEqual([]);
    expect(result.weightPrices).toBeInstanceOf(Map);
    expect(result.weightPrices!.size).toBe(0);
  });

  it("should ignore a bulk tag without enough values", () => {
    const event = { ...baseEvent, tags: [["bulk", "10"]] };
    const result = parseTags(event)!;

    expect(result.bulkPrices).toBeInstanceOf(Map);
    expect(result.bulkPrices!.size).toBe(0);
  });

  it("should ignore L/l tags that are not for content-warning", () => {
    const event = {
      ...baseEvent,
      tags: [
        ["L", "some-other-label"],
        ["l", "another-label", "not-a-warning"],
      ],
    };
    const result = parseTags(event)!;

    expect(result.contentWarning).toBeFalsy();
  });
});
