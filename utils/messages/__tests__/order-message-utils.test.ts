import {
  buildOrderGroupingKey,
  getOrderConsolidationKey,
  getLatestShippingInfo,
  getOrderStatusLookupKeys,
  registerTaggedOrderGroupingKey,
  resolveExplicitPaymentMethod,
} from "../order-message-utils";

describe("order-message-utils", () => {
  test("buildOrderGroupingKey stays stable across lifecycle subjects", () => {
    const baseEvent = {
      id: "msg-1",
      tags: [
        ["subject", "order-info"],
        ["a", "30402:merchant:dtag"],
        ["amount", "1200"],
        ["address", "123 Main St"],
        ["pickup", "Storefront"],
      ],
    } as any;

    const followUpEvent = {
      ...baseEvent,
      id: "msg-2",
      tags: [
        ["subject", "shipping-info"],
        ["a", "30402:merchant:dtag"],
        ["amount", "1200"],
        ["address", "123 Main St"],
        ["pickup", "Storefront"],
      ],
    } as any;

    expect(buildOrderGroupingKey(baseEvent)).toBe(
      buildOrderGroupingKey(followUpEvent)
    );
  });

  test("buildOrderGroupingKey returns empty string when fallback metadata is incomplete", () => {
    const incompleteEvent = {
      id: "msg-incomplete",
      tags: [["subject", "payment-change"]],
    } as any;

    expect(buildOrderGroupingKey(incompleteEvent)).toBe("");
  });

  test("resolveExplicitPaymentMethod only uses explicit tags", () => {
    expect(resolveExplicitPaymentMethod("ecash")).toBe("Cashu");
    expect(resolveExplicitPaymentMethod("lightning")).toBe("Lightning");
    expect(resolveExplicitPaymentMethod()).toBe("Not specified");
  });

  test("getOrderStatusLookupKeys includes tag, grouping key, and message id", () => {
    const event = {
      id: "msg-3",
      tags: [
        ["subject", "order-receipt"],
        ["order", "order-123"],
        ["a", "30402:merchant:dtag"],
        ["amount", "2400"],
      ],
    } as any;

    const lookupKeys = getOrderStatusLookupKeys(event);
    expect(lookupKeys).toEqual(
      expect.arrayContaining(["order-123", "msg-3"])
    );
    expect(lookupKeys.length).toBeGreaterThanOrEqual(2);
  });

  test("repeated tagged orders keep distinct consolidation keys", () => {
    const taggedOrderGroupKeys = new Map<string, string | null>();
    const firstOrder = {
      orderId: "msg-1",
      orderTag: "order-1",
      orderGroupKey: "same-group",
    };
    const secondOrder = {
      orderId: "msg-2",
      orderTag: "order-2",
      orderGroupKey: "same-group",
    };

    const firstKey = getOrderConsolidationKey(firstOrder, taggedOrderGroupKeys);
    registerTaggedOrderGroupingKey(
      firstOrder,
      taggedOrderGroupKeys,
      firstKey
    );

    const secondKey = getOrderConsolidationKey(
      secondOrder,
      taggedOrderGroupKeys
    );
    registerTaggedOrderGroupingKey(
      secondOrder,
      taggedOrderGroupKeys,
      secondKey
    );

    expect(firstKey).toBe("order-1");
    expect(secondKey).toBe("order-2");
    expect(
      getOrderConsolidationKey(
        {
          orderId: "msg-3",
          orderGroupKey: "same-group",
        },
        taggedOrderGroupKeys
      )
    ).toBe("msg-3");
  });

  test("getLatestShippingInfo surfaces missing fields", () => {
    const shippingEvent = {
      id: "msg-4",
      tags: [
        ["subject", "shipping-info"],
        ["tracking", ""],
        ["carrier", "UPS"],
      ],
    } as any;

    const result = getLatestShippingInfo([shippingEvent]);
    expect(result?.carrier).toBe("UPS");
    expect(result?.missingFields).toEqual(["tracking"]);
  });
});
