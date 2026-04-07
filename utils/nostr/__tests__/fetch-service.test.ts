import {
  getMarketplaceEventKey,
  searchMarketplaceProducts,
} from "../fetch-service";

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
    expect(getMarketplaceEventKey(results[0]!)).toBe(
      "30402:seller-1:coffee-beans"
    );
    expect(cacheEventsToDatabase).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "listing-old" }),
        expect.objectContaining({ id: "listing-new" }),
        expect.objectContaining({ id: "flash-sale" }),
      ])
    );
  });
});

describe("fetchProfile", () => {
  const pubkey =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("keeps the latest kind 0 profile from the DB and ignores shop profile rows", async () => {
    const verifyNip05Identifier = jest.fn().mockResolvedValue(false);
    const cacheEventsToDatabase = jest.fn();

    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(),
      deleteEvent: jest.fn(),
      verifyNip05Identifier,
    }));

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchProfile } = await import("../fetch-service");

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "latest-user-profile",
          pubkey,
          created_at: 300,
          kind: 0,
          tags: [],
          content: JSON.stringify({
            display_name: "Latest User",
            name: "latest-user",
          }),
          sig: "sig-latest-user-profile",
        },
        {
          id: "shop-profile",
          pubkey,
          created_at: 250,
          kind: 30019,
          tags: [],
          content: JSON.stringify({
            name: "Latest Shop",
            about: "Shop profile content should not populate user settings.",
          }),
          sig: "sig-shop-profile",
        },
        {
          id: "older-user-profile",
          pubkey,
          created_at: 200,
          kind: 0,
          tags: [],
          content: JSON.stringify({
            display_name: "Older User",
            name: "older-user",
          }),
          sig: "sig-older-user-profile",
        },
      ],
    }) as typeof global.fetch;

    const editProfileContext = jest.fn();
    const nostr = {
      fetch: jest.fn().mockResolvedValue([]),
    } as any;

    const { profileMap } = await fetchProfile(
      nostr,
      ["wss://relay.example"],
      [pubkey],
      editProfileContext
    );

    expect(profileMap.get(pubkey)).toMatchObject({
      pubkey,
      created_at: 300,
      content: {
        display_name: "Latest User",
        name: "latest-user",
      },
    });
    expect(profileMap.get(pubkey)?.content.about).toBeUndefined();
    expect(editProfileContext).toHaveBeenLastCalledWith(profileMap, false);
    expect(cacheEventsToDatabase).not.toHaveBeenCalled();
  });
});
