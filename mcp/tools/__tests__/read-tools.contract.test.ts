import { describe, expect, it } from "@jest/globals";
import { buildPricingBlock, parseProductEvent } from "@/mcp/tools/read-tools";
import { NostrEvent } from "@/utils/types/types";

function makeProductEvent(overrides?: Partial<NostrEvent>): NostrEvent {
  return {
    id: "product-1",
    pubkey: "seller-pubkey",
    created_at: 1710000000,
    kind: 30402,
    content: "",
    sig: "sig",
    tags: [
      ["d", "tea-001"],
      ["title", "Green Tea"],
      ["summary", "Single origin"],
      ["image", "https://example.com/tea.jpg"],
      ["t", "beverages"],
      ["location", "Online"],
      ["price", "100", "USD"],
      ["shipping", "Added Cost", "5", "USD"],
      ["required_customer_info", "email"],
      ["size", "M", "8"],
      ["volume", "250g", "140"],
      ["weight", "1 lb", "220"],
      ["bulk", "10", "900"],
      ["subscription", "true"],
      ["subscription_discount", "10"],
      ["subscription_frequency", "weekly", "monthly"],
      ["published_at", "1700000000"],
      ["valid_until", "1900000000"],
      ["content-warning"],
      ["restrictions", "US only"],
    ],
    ...overrides,
  };
}

describe("read-tools MCP product contract helpers", () => {
  it("parseProductEvent returns MCP-safe product shape with pricing and subscription", () => {
    const parsed = parseProductEvent(makeProductEvent());

    expect(parsed).toEqual(
      expect.objectContaining({
        id: "product-1",
        pubkey: "seller-pubkey",
        d: "tea-001",
        title: "Green Tea",
        summary: "Single origin",
        requiredCustomerInfo: "email",
        publishedAt: "1700000000",
        validUntil: 1900000000,
        contentWarning: true,
      })
    );

    expect(parsed.pricing).toEqual({
      amount: 100,
      currency: "USD",
      unit: "per item",
      shippingCost: 5,
      shippingType: "Added Cost",
      totalEstimate: 105,
      paymentMethods: ["lightning", "cashu"],
    });

    expect(parsed.subscription).toEqual({
      enabled: true,
      discount: 10,
      frequencies: ["weekly", "monthly"],
    });
  });

  it("parseProductEvent maps legacy UI-only 'required' to MCP requiredCustomerInfo", () => {
    const parsed = parseProductEvent(
      makeProductEvent({
        tags: [
          ["title", "Legacy Product"],
          ["price", "25", "USD"],
          ["required", "email"],
        ],
      })
    );

    expect(parsed.requiredCustomerInfo).toBe("email");
  });

  it("buildPricingBlock keeps free shipping total estimate deterministic", () => {
    const pricing = buildPricingBlock(120, "USD", "Free", 999, 2);

    expect(pricing).toEqual({
      amount: 120,
      currency: "USD",
      unit: "per item",
      shippingCost: 0,
      shippingType: "Free",
      totalEstimate: 240,
      paymentMethods: ["lightning", "cashu"],
    });
  });
});
