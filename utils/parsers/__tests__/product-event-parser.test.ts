import { parseCanonicalProductEvent } from "@/utils/parsers/product-event/base-parser";
import { toMcpProductData } from "@/utils/parsers/product-event/mcp-adapter";
import { NostrEvent } from "@/utils/types/types";

describe("product canonical parser + adapters", () => {
  const baseEvent: NostrEvent = {
    id: "product-1",
    pubkey: "seller-pubkey",
    created_at: 1710000000,
    kind: 30402,
    content: "",
    sig: "sig",
    tags: [],
  };

  it("parses shared tags once and exposes alias fields", () => {
    const event: NostrEvent = {
      ...baseEvent,
      tags: [
        ["title", "Tea"],
        ["summary", "Organic green tea"],
        ["price", "12", "USD"],
        ["required_customer_info", "Phone number"],
        ["restrictions", "US only"],
      ],
    };

    const canonical = parseCanonicalProductEvent(event);

    expect(canonical.title).toBe("Tea");
    expect(canonical.summary).toBe("Organic green tea");
    expect(canonical.price).toBe(12);
    expect(canonical.currency).toBe("USD");
    expect(canonical.requiredCustomerInfo).toBe("Phone number");
    expect(canonical.required).toBe("Phone number");
    expect(canonical.restrictions).toBe("US only");
  });

  it("uses last valid shipping tag", () => {
    const event: NostrEvent = {
      ...baseEvent,
      tags: [
        ["shipping", "5", "USD"],
        ["shipping", "Added Cost", "7", "USD"],
      ],
    };

    const canonical = parseCanonicalProductEvent(event);

    expect(canonical.shippingType).toBe("Added Cost");
    expect(canonical.shippingCost).toBe(7);
  });

  it("builds MCP-safe variant and subscription blocks", () => {
    const event: NostrEvent = {
      ...baseEvent,
      tags: [
        ["size", "M", "5"],
        ["volume", "250g", "18"],
        ["weight", "1 lb", "30"],
        ["bulk", "10", "99"],
        ["subscription", "true"],
        ["subscription_discount", "15"],
        ["subscription_frequency", "weekly", "monthly"],
      ],
    };

    const canonical = parseCanonicalProductEvent(event);
    const mcpProduct = toMcpProductData(canonical);

    expect(mcpProduct.sizes).toEqual([{ size: "M", quantity: 5 }]);
    expect(mcpProduct.volumes).toEqual([{ volume: "250g", price: 18 }]);
    expect(mcpProduct.weights).toEqual([{ weight: "1 lb", price: 30 }]);
    expect(mcpProduct.bulk).toEqual([{ units: 10, price: 99 }]);
    expect(mcpProduct.subscription).toEqual({
      enabled: true,
      discount: 15,
      frequencies: ["weekly", "monthly"],
    });
  });
});
