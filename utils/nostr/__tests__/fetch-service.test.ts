import { fetchAllPosts, fetchReports } from "../fetch-service";

jest.mock("@/utils/db/db-client", () => ({
  cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
}));

const { cacheEventsToDatabase } = jest.requireMock("@/utils/db/db-client");

describe("fetch-service report helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("filters report fetches to loaded listings and related profiles", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "db-relevant",
          pubkey: "reporter-1",
          created_at: 10,
          kind: 1984,
          tags: [
            ["e", "listing-1", "spam"],
            ["p", "seller-1"],
          ],
          content: "spam listing",
          sig: "sig-1",
        },
        {
          id: "db-irrelevant",
          pubkey: "reporter-2",
          created_at: 11,
          kind: 1984,
          tags: [["p", "seller-999", "spam"]],
          content: "other seller",
          sig: "sig-2",
        },
        {
          id: "db-reviewer-report",
          pubkey: "reporter-5",
          created_at: 14,
          kind: 1984,
          tags: [["p", "reviewer-1", "spam"]],
          content: "bad reviewer",
          sig: "sig-5",
        },
      ],
    });

    const nostr = {
      fetch: jest.fn().mockResolvedValue([
        {
          id: "relay-profile-report",
          pubkey: "reporter-3",
          created_at: 12,
          kind: 1984,
          tags: [["p", "seller-1", "impersonation"]],
          content: "fake shop",
          sig: "sig-3",
        },
        {
          id: "relay-irrelevant-report",
          pubkey: "reporter-4",
          created_at: 13,
          kind: 1984,
          tags: [["e", "listing-999", "spam"]],
          content: "ignore",
          sig: "sig-4",
        },
      ]),
    };

    const editReportsContext = jest.fn();
    const products = [
      {
        id: "listing-1",
        pubkey: "seller-1",
        created_at: 1,
        kind: 30402,
        tags: [["d", "coffee-beans"]],
        content: "coffee",
        sig: "sig-product",
      },
    ];

    const result = await fetchReports(
      nostr as any,
      ["wss://relay.example"],
      products as any,
      editReportsContext,
      ["reviewer-1"]
    );

    expect(global.fetch).toHaveBeenCalledWith("/api/db/fetch-reports");
    expect(nostr.fetch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          kinds: [1984],
          "#p": expect.arrayContaining(["seller-1", "reviewer-1"]),
        }),
        expect.objectContaining({ kinds: [1984], "#e": ["listing-1"] }),
      ]),
      {},
      ["wss://relay.example"]
    );
    expect(result.reportEvents.map((event) => event.id)).toEqual([
      "db-reviewer-report",
      "relay-profile-report",
      "db-relevant",
    ]);
    expect(editReportsContext).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "db-reviewer-report" }),
        expect.objectContaining({ id: "relay-profile-report" }),
        expect.objectContaining({ id: "db-relevant" }),
      ]),
      false
    );
    expect(cacheEventsToDatabase).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "relay-profile-report" }),
        expect.objectContaining({ id: "relay-irrelevant-report" }),
      ])
    );
  });
});

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
