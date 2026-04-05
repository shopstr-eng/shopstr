import { getMarketplaceEventKey, searchMarketplaceProducts } from "../fetch-service";

jest.mock("@/utils/db/db-client", () => ({
  cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
}));

const { cacheEventsToDatabase } = jest.requireMock("@/utils/db/db-client");

describe("fetch-service marketplace helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("deduplicates NIP-50 marketplace search results by listing identity", async () => {
    const nostr = {
      fetch: jest.fn().mockResolvedValue([
        {
          id: "listing-old",
          pubkey: "seller-1",
          created_at: 10,
          kind: 30402,
          tags: [["d", "coffee-beans"]],
          content: "older",
          sig: "sig-1",
        },
        {
          id: "listing-new",
          pubkey: "seller-1",
          created_at: 20,
          kind: 30402,
          tags: [["d", "coffee-beans"]],
          content: "newer",
          sig: "sig-2",
        },
        {
          id: "flash-sale",
          pubkey: "seller-2",
          created_at: 15,
          kind: 1,
          tags: [["t", "shopstr-zapsnag"]],
          content: "sale",
          sig: "sig-3",
        },
      ]),
    };

    const results = await searchMarketplaceProducts(
      nostr as any,
      ["wss://relay.example"],
      "coffee"
    );

    expect(nostr.fetch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ kinds: [30402], search: "coffee" }),
        expect.objectContaining({ kinds: [1], search: "coffee" }),
      ]),
      {},
      ["wss://relay.example"]
    );
    expect(results.map((event) => event.id)).toEqual([
      "listing-new",
      "flash-sale",
    ]);
    expect(getMarketplaceEventKey(results[0]!)).toBe("30402:seller-1:coffee-beans");
    expect(cacheEventsToDatabase).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "listing-old" }),
        expect.objectContaining({ id: "listing-new" }),
        expect.objectContaining({ id: "flash-sale" }),
      ])
    );
  });

});
