import {
  buildShippingAdjustedProductTotals,
  cartHasMixedShippingWithPickup,
  computeProductPricing,
  computeSellerFreeShippingStatus,
  computeWaivedShippingInSats,
  getCartUnitShippingCost,
  getFreeShippingThresholdsToConvert,
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

  describe("getCartUnitShippingCost", () => {
    it("charges the listed cost only for Added Cost listings", () => {
      expect(
        getCartUnitShippingCost({
          shippingType: "Added Cost",
          shippingCost: 15,
        })
      ).toBe(15);
    });

    it("never charges shipping for free, pickup, or untyped listings", () => {
      for (const shippingType of ["Free", "Free/Pickup", "Pickup", "N/A"]) {
        expect(
          getCartUnitShippingCost({ shippingType, shippingCost: 15 })
        ).toBe(0);
      }
      expect(getCartUnitShippingCost({ shippingCost: 15 })).toBe(0);
    });
  });

  describe("cartHasMixedShippingWithPickup", () => {
    it("is true only for a mixed cart that includes Free/Pickup", () => {
      expect(
        cartHasMixedShippingWithPickup({ a: "Added Cost", b: "Free/Pickup" })
      ).toBe(true);
      expect(
        cartHasMixedShippingWithPickup({ a: "Added Cost", b: "Pickup" })
      ).toBe(false);
      expect(
        cartHasMixedShippingWithPickup({ a: "Free/Pickup", b: "Free/Pickup" })
      ).toBe(false);
    });
  });

  describe("computeWaivedShippingInSats", () => {
    it("sums cost x quantity for every shipped product of qualifying sellers", () => {
      expect(
        computeWaivedShippingInSats({
          products,
          quantities: { "product-1": 2, "product-2": 1, "product-3": 3 },
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
          sellerFreeShippingStatus: { "seller-a": { qualifies: true } },
          shouldAddShipping: () => true,
        })
      ).toBe(15 * 2 + 25 * 3);
    });

    it("waives nothing for products the order type does not ship", () => {
      expect(
        computeWaivedShippingInSats({
          products,
          quantities: {},
          shippingTypes: { "product-1": "Added Cost" },
          shippingCostsInSats: { "product-1": 15, "product-3": 25 },
          sellerFreeShippingStatus: { "seller-a": { qualifies: true } },
          shouldAddShipping: () => false,
        })
      ).toBe(0);
    });
  });

  describe("computeSellerFreeShippingStatus", () => {
    const profile =
      (freeShippingThreshold: number, freeShippingCurrency?: string) => () => ({
        freeShippingThreshold,
        freeShippingCurrency,
        name: "Shop",
      });

    it("compares exactly in the threshold currency when the products share it", () => {
      const status = computeSellerFreeShippingStatus({
        products: [
          { id: "p1", pubkey: "seller-a", price: 25, currency: "USD" },
        ],
        quantities: { p1: 2 },
        appliedDiscounts: {},
        getShopProfileContent: profile(50, "USD"),
      });
      expect(status["seller-a"]).toMatchObject({
        qualifies: true,
        sellerSubtotal: 50,
        currency: "USD",
      });
    });

    it("keeps comparing in raw units when the seller set no threshold currency", () => {
      const status = computeSellerFreeShippingStatus({
        products: [
          { id: "p1", pubkey: "seller-a", price: 2000, currency: "sats" },
        ],
        quantities: {},
        appliedDiscounts: {},
        getShopProfileContent: profile(1500),
      });
      expect(status["seller-a"]?.qualifies).toBe(true);
    });

    it("does not let a sats cart meet a USD threshold by raw number", () => {
      // 2,000 sats is far below 50 USD (~50,000 sats here)
      const status = computeSellerFreeShippingStatus({
        products: [
          { id: "p1", pubkey: "seller-a", price: 2000, currency: "sats" },
        ],
        quantities: {},
        appliedDiscounts: {},
        getShopProfileContent: profile(50, "USD"),
        productTotalsInSats: { p1: 2000 },
        freeShippingThresholdsInSats: { "seller-a": 50000 },
      });
      expect(status["seller-a"]).toMatchObject({
        qualifies: false,
        sellerSubtotal: 2,
        currency: "USD",
      });
    });

    it("qualifies across currencies once the sats subtotal reaches the converted threshold", () => {
      const status = computeSellerFreeShippingStatus({
        products: [
          { id: "p1", pubkey: "seller-a", price: 30000, currency: "sats" },
          { id: "p2", pubkey: "seller-a", price: 20000, currency: "sats" },
        ],
        quantities: {},
        appliedDiscounts: {},
        getShopProfileContent: profile(50, "USD"),
        productTotalsInSats: { p1: 30000, p2: 20000 },
        freeShippingThresholdsInSats: { "seller-a": 50000 },
      });
      expect(status["seller-a"]?.qualifies).toBe(true);
    });

    it("never qualifies when a cross-currency threshold could not be converted", () => {
      const status = computeSellerFreeShippingStatus({
        products: [
          { id: "p1", pubkey: "seller-a", price: 999999, currency: "sats" },
        ],
        quantities: {},
        appliedDiscounts: {},
        getShopProfileContent: profile(50, "USD"),
        productTotalsInSats: { p1: 999999 },
      });
      expect(status["seller-a"]?.qualifies).toBe(false);
    });
  });

  describe("getFreeShippingThresholdsToConvert", () => {
    it("lists only sellers with a threshold in a different currency than a product", () => {
      const profiles: Record<
        string,
        { freeShippingThreshold: number; freeShippingCurrency?: string }
      > = {
        "seller-a": { freeShippingThreshold: 50, freeShippingCurrency: "USD" },
        "seller-b": { freeShippingThreshold: 50, freeShippingCurrency: "USD" },
        "seller-c": { freeShippingThreshold: 1500 },
      };
      expect(
        getFreeShippingThresholdsToConvert({
          products: [
            { pubkey: "seller-a", currency: "sats" },
            { pubkey: "seller-b", currency: "usd" },
            { pubkey: "seller-c", currency: "sats" },
          ],
          getShopProfileContent: (pubkey) => profiles[pubkey],
        })
      ).toEqual([{ pubkey: "seller-a", threshold: 50, currency: "USD" }]);
    });
  });
});
