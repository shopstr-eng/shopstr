const originalFetch = global.fetch;

describe("fetchProfile", () => {
  const pubkey =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
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
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const directFromDb =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const directFromRelay =
    "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
  const secondDegreeFromRelay =
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const ignoredHexTag =
    "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("hydrates direct follows from DB first, then merges the latest event with relay WoT data", async () => {
    const editFollowsContext = jest.fn();

    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({
        wot: 1,
      })),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn(),
    }));

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        contactList: {
          id: "db-contact-list",
          pubkey: userPubkey,
          created_at: 200,
          kind: 3,
          tags: [
            ["relay", ignoredHexTag],
            ["p", directFromDb],
          ],
          content: "",
          sig: "db-sig",
        },
      }),
    }) as typeof global.fetch;

    const { fetchAllFollows } = await import("../fetch-service");

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: "older-relay-contact-list",
            pubkey: userPubkey,
            created_at: 100,
            kind: 3,
            tags: [],
            content: "",
            sig: "relay-sig",
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "second-degree-event",
            pubkey: directFromDb,
            created_at: 250,
            kind: 3,
            tags: [
              ["e", ignoredHexTag],
              ["p", secondDegreeFromRelay],
            ],
            content: "",
            sig: "second-degree-sig",
          },
        ]),
    } as any;

    const result = await fetchAllFollows(
      nostr,
      ["wss://relay.example"],
      editFollowsContext,
      userPubkey
    );

    expect(editFollowsContext).toHaveBeenNthCalledWith(
      1,
      [directFromDb],
      [directFromDb],
      1,
      true
    );
    expect(editFollowsContext).toHaveBeenLastCalledWith(
      [directFromDb],
      [directFromDb, secondDegreeFromRelay],
      1,
      false
    );
    expect(result).toEqual({
      directFollowList: [directFromDb],
      followList: [directFromDb, secondDegreeFromRelay],
      firstDegreeFollowsLength: 1,
    });
    expect(nostr.fetch).toHaveBeenNthCalledWith(
      1,
      [{ kinds: [3], authors: [userPubkey] }],
      {},
      ["wss://relay.example"]
    );
    expect(nostr.fetch).toHaveBeenNthCalledWith(
      2,
      [{ kinds: [3], authors: [directFromDb] }],
      {},
      ["wss://relay.example"]
    );
  });

  it("uses the lower event id when DB and relay contact lists share the same timestamp", async () => {
    const editFollowsContext = jest.fn();

    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({
        wot: 1,
      })),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn(),
    }));

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        contactList: {
          id: "0".repeat(64),
          pubkey: userPubkey,
          created_at: 200,
          kind: 3,
          tags: [["p", directFromDb]],
          content: "",
          sig: "db-sig",
        },
      }),
    }) as typeof global.fetch;

    const { fetchAllFollows } = await import("../fetch-service");

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: "f".repeat(64),
            pubkey: userPubkey,
            created_at: 200,
            kind: 3,
            tags: [["p", directFromRelay]],
            content: "",
            sig: "relay-sig",
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

    expect(result).toEqual({
      directFollowList: [directFromDb],
      followList: [directFromDb],
      firstDegreeFollowsLength: 1,
    });
    expect(editFollowsContext).toHaveBeenLastCalledWith(
      [directFromDb],
      [directFromDb],
      1,
      false
    );
    expect(nostr.fetch).toHaveBeenNthCalledWith(
      2,
      [{ kinds: [3], authors: [directFromDb] }],
      {},
      ["wss://relay.example"]
    );
  });
});
