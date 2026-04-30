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

describe("fetchAllFollows", () => {
  const userPubkey =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const olderFollowPubkey =
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const latestFollowPubkey =
    "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ wot: 2 })),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn(),
    }));
  });

  it("returns empty follows for logged-out users without fetching defaults", async () => {
    const { fetchAllFollows } = await import("../fetch-service");
    const editFollowsContext = jest.fn();
    const nostr = {
      fetch: jest.fn(),
    } as any;

    const result = await fetchAllFollows(
      nostr,
      ["wss://relay.example"],
      editFollowsContext
    );

    expect(result.followList).toEqual([]);
    expect(nostr.fetch).not.toHaveBeenCalled();
    expect(editFollowsContext).toHaveBeenCalledWith([], 0, false);
  });

  it("keeps follows empty when a logged-in user has no contact list", async () => {
    const { fetchAllFollows } = await import("../fetch-service");
    const editFollowsContext = jest.fn();
    const nostr = {
      fetch: jest.fn().mockResolvedValue([]),
    } as any;

    const result = await fetchAllFollows(
      nostr,
      ["wss://relay.example"],
      editFollowsContext,
      userPubkey
    );

    expect(result.followList).toEqual([]);
    expect(nostr.fetch).toHaveBeenCalledTimes(1);
    expect(nostr.fetch).toHaveBeenCalledWith(
      [{ kinds: [3], authors: [userPubkey] }],
      {},
      ["wss://relay.example"]
    );
    expect(editFollowsContext).toHaveBeenCalledWith([], 0, false);
  });

  it("uses only the latest kind 3 contact list for direct follows", async () => {
    const { fetchAllFollows } = await import("../fetch-service");
    const editFollowsContext = jest.fn();
    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: "older-contact-list",
            pubkey: userPubkey,
            created_at: 100,
            kind: 3,
            tags: [["p", olderFollowPubkey]],
            content: "",
            sig: "sig",
          },
          {
            id: "latest-contact-list",
            pubkey: userPubkey,
            created_at: 200,
            kind: 3,
            tags: [["p", latestFollowPubkey]],
            content: "",
            sig: "sig",
          },
        ])
        .mockResolvedValueOnce([]),
    } as any;

    const result = await fetchAllFollows(
      nostr,
      ["wss://relay.example"],
      editFollowsContext,
      userPubkey
    );

    expect(result.followList).toEqual([latestFollowPubkey]);
    expect(result.followList).not.toContain(olderFollowPubkey);
    expect(nostr.fetch).toHaveBeenNthCalledWith(
      2,
      [{ kinds: [3], authors: [latestFollowPubkey] }],
      {},
      ["wss://relay.example"]
    );
    expect(editFollowsContext).toHaveBeenCalledWith(
      [latestFollowPubkey],
      1,
      false
    );
  });
});
