import {
  buildOrderGroupingKey,
  getLatestShippingInfo,
  getOrderStatusLookupKeys,
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