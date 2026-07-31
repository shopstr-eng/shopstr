import {
  getProductEventStats,
  resolveMarketplaceStats,
} from "../marketplace-stats";

function productEvent(pubkey: string, kind = 30402) {
  return { kind, pubkey };
}

describe("marketplace-stats", () => {
  test("keeps placeholders until either source has data", () => {
    expect(
      resolveMarketplaceStats({ listingCount: null, sellerCount: null }, [])
    ).toEqual({ listingCount: null, sellerCount: null });
  });

  test("uses API stats while product events are still loading", () => {
    expect(
      resolveMarketplaceStats({ listingCount: 42, sellerCount: 12 }, [])
    ).toEqual({ listingCount: 42, sellerCount: 12 });
  });

  test("uses loaded product events when DB stats are still partial", () => {
    const events = [
      productEvent("seller-a"),
      productEvent("seller-b"),
      productEvent("seller-a"),
    ];

    expect(
      resolveMarketplaceStats({ listingCount: 1, sellerCount: 1 }, events)
    ).toEqual({ listingCount: 3, sellerCount: 2 });
  });

  test("does not lower fuller API stats with a partial product context", () => {
    expect(
      resolveMarketplaceStats({ listingCount: 100, sellerCount: 25 }, [
        productEvent("seller-a"),
      ])
    ).toEqual({ listingCount: 100, sellerCount: 25 });
  });

  test("derives stats from kind 30402 listing events only", () => {
    expect(
      getProductEventStats([
        productEvent("seller-a"),
        productEvent("seller-b", 1),
        productEvent("seller-c", 30019),
      ])
    ).toEqual({ listingCount: 1, sellerCount: 1 });
  });
});
