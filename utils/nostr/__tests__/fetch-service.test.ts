import { fetchAllPosts } from "../fetch-service";

jest.mock("@/utils/db/db-client", () => ({
  cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
}));

const { cacheEventsToDatabase } = jest.requireMock("@/utils/db/db-client");

describe("fetchAllPosts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("merges 30402 and 30018 variants by marketplace identity and prefers 30402", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "db-30018",
          pubkey: "seller-1",
          created_at: 10,
          kind: 30018,
          tags: [["d", "coldcard-q"]],
          content: JSON.stringify({
            id: "coldcard-q",
            stall_id: "shopstr-sat",
            name: "COLDCARD Q",
            currency: "SAT",
            price: 1000,
          }),
          sig: "sig-db",
        },
      ],
    });

    const nostr = {
      fetch: jest.fn().mockResolvedValue([
        {
          id: "relay-30018",
          pubkey: "seller-1",
          created_at: 20,
          kind: 30018,
          tags: [["d", "coldcard-q"]],
          content: JSON.stringify({
            id: "coldcard-q",
            stall_id: "shopstr-sat",
            name: "COLDCARD Q",
            currency: "SAT",
            price: 1000,
          }),
          sig: "sig-relay-30018",
        },
        {
          id: "relay-30402",
          pubkey: "seller-1",
          created_at: 20,
          kind: 30402,
          tags: [
            ["d", "coldcard-q"],
            ["title", "COLDCARD Q"],
            ["price", "1000", "SAT"],
          ],
          content: "COLDCARD Q",
          sig: "sig-relay-30402",
        },
      ]),
    };

    const editProductContext = jest.fn();

    const result = await fetchAllPosts(
      nostr as any,
      ["wss://relay.example"],
      editProductContext
    );

    expect(global.fetch).toHaveBeenCalledWith("/api/db/fetch-products");
    expect(nostr.fetch).toHaveBeenCalledWith(
      [
        { kinds: [30402, 30018] },
        { kinds: [1], "#t": ["shopstr-zapsnag", "zapsnag"] },
      ],
      {},
      ["wss://relay.example"]
    );
    expect(result.productEvents).toHaveLength(1);
    expect(result.productEvents[0]).toEqual(
      expect.objectContaining({
        id: "relay-30402",
        kind: 30402,
      })
    );
    expect(editProductContext).toHaveBeenLastCalledWith(
      [
        expect.objectContaining({
          id: "relay-30402",
          kind: 30402,
        }),
      ],
      false
    );
    expect(cacheEventsToDatabase).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "relay-30018", kind: 30018 }),
        expect.objectContaining({ id: "relay-30402", kind: 30402 }),
      ])
    );
  });
});
