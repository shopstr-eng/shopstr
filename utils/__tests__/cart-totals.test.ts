import {
  buildShippingAdjustedProductTotals,
  computeProductPricing,
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

  describe("computeProductPricing", () => {
    it("passes price and shipping through when there is no discount or quantity", () => {
      expect(
        computeProductPricing({
          id: "product-1",
          priceSats: 1000,
          shippingSats: 50,
          discountPercent: 0,
          quantity: undefined,
        })
      ).toEqual({
        id: "product-1",
        status: "priced",
        price: 1000,
        shipping: 50,
      });
    });

    it("scales price and shipping by quantity (rounding up)", () => {
      expect(
        computeProductPricing({
          id: "product-1",
          priceSats: 1000,
          shippingSats: 50,
          discountPercent: 0,
          quantity: 3,
        })
      ).toEqual({
        id: "product-1",
        status: "priced",
        price: 3000,
        shipping: 150,
      });
    });

    it("applies the discount and rounds up", () => {
      // 1005 * 0.9 = 904.5 -> ceil 905
      expect(
        computeProductPricing({
          id: "product-1",
          priceSats: 1005,
          shippingSats: 0,
          discountPercent: 10,
          quantity: undefined,
        })
      ).toEqual({ id: "product-1", status: "priced", price: 905, shipping: 0 });
    });

    it("rounds up after multiplying fractional sat amounts by quantity", () => {
      // ceil(50.5 * 3) = ceil(151.5) = 152; ceil(10.2 * 3) = ceil(30.6) = 31
      expect(
        computeProductPricing({
          id: "product-1",
          priceSats: 10.2,
          shippingSats: 50.5,
          discountPercent: 0,
          quantity: 3,
        })
      ).toEqual({
        id: "product-1",
        status: "priced",
        price: 31,
        shipping: 152,
      });
    });

    it("applies the discount before multiplying by quantity", () => {
      // discount: ceil(1005 * 0.85) = ceil(854.25) = 855; then * 2 = 1710
      expect(
        computeProductPricing({
          id: "product-1",
          priceSats: 1005,
          shippingSats: 20,
          discountPercent: 15,
          quantity: 2,
        })
      ).toEqual({
        id: "product-1",
        status: "priced",
        price: 1710,
        shipping: 40,
      });
    });
  });
});
