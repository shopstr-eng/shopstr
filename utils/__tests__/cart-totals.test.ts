import {
  buildShippingAdjustedProductTotals,
  sumProductTotalsInSats,
} from "../cart-totals";

describe("cart totals helpers", () => {
  const products = [
    { id: "product-1", pubkey: "seller-a" },
    { id: "product-2", pubkey: "seller-b" },
    { id: "product-3", pubkey: "seller-a" },
  ];

  it("builds shipping-adjusted totals per product", () => {
    const adjustedTotals = buildShippingAdjustedProductTotals({
      products,
      baseProductTotalsInSats: {
        "product-1": 100,
        "product-2": 200,
        "product-3": 300,
      },
      quantities: {
        "product-1": 2,
        "product-2": 1,
        "product-3": 1,
      },
      shippingTypes: {
        "product-1": "Added Cost",
        "product-2": "Free",
        "product-3": "Free/Pickup",
      },
      shippingCostsInSats: {
        "product-1": 15,
        "product-2": 0,
        "product-3": 25,
      },
      sellerFreeShippingStatus: {},
      shouldAddShipping: (shippingType) =>
        shippingType === "Added Cost" || shippingType === "Free",
    });

    expect(adjustedTotals).toEqual({
      "product-1": 130,
      "product-2": 200,
      "product-3": 300,
    });
  });

  it("skips shipping when the seller qualifies for free shipping", () => {
    const adjustedTotals = buildShippingAdjustedProductTotals({
      products,
      baseProductTotalsInSats: {
        "product-1": 100,
        "product-2": 200,
        "product-3": 300,
      },
      quantities: {
        "product-1": 2,
        "product-2": 1,
        "product-3": 1,
      },
      shippingTypes: {
        "product-1": "Added Cost",
        "product-2": "Added Cost",
        "product-3": "Added Cost",
      },
      shippingCostsInSats: {
        "product-1": 15,
        "product-2": 20,
        "product-3": 25,
      },
      sellerFreeShippingStatus: {
        "seller-a": { qualifies: true },
      },
      shouldAddShipping: () => true,
    });

    expect(adjustedTotals).toEqual({
      "product-1": 100,
      "product-2": 220,
      "product-3": 300,
    });
  });

  it("sums per-product totals into a final cart amount", () => {
    expect(
      sumProductTotalsInSats({
        "product-1": 130,
        "product-2": 220,
        "product-3": 300,
      })
    ).toBe(650);
  });
});
