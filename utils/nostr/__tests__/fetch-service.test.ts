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

const setupFetchService = async ({
  localStorageData = { wot: 2 },
  verifyNip05Identifier = jest.fn().mockResolvedValue(false),
}: {
  localStorageData?: Record<string, unknown>;
  verifyNip05Identifier?: jest.Mock;
} = {}) => {
  const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
  const deleteEvent = jest.fn();

  jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
    getLocalStorageData: jest.fn(() => localStorageData),
    deleteEvent,
    verifyNip05Identifier,
  }));

  jest.doMock("@/utils/db/db-client", () => ({
    cacheEventsToDatabase,
  }));

  const service = await import("../fetch-service");

  return {
    ...service,
    cacheEventsToDatabase,
    deleteEvent,
    verifyNip05Identifier,
  };
};

describe("fetch-service database and relay fallback behavior", () => {
  const pubkey =
    "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const relays = ["wss://relay.example"];

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("fetchAllPosts merges DB products with fresher relay products and caches valid relay events", async () => {
    const { fetchAllPosts, cacheEventsToDatabase } = await setupFetchService();
    const editProductContext = jest.fn();
    const olderProduct = {
      id: "older-product",
      pubkey,
      created_at: 10,
      kind: 30402,
      tags: [["d", "product-1"]],
      content: "older",
      sig: "sig",
    };
    const newerProduct = {
      ...olderProduct,
      id: "newer-product",
      created_at: 20,
      content: "newer",
    };
    const zapsnagPost = {
      id: "zapsnag-post",
      pubkey: "feed-author",
      created_at: 15,
      kind: 1,
      tags: [["t", "shopstr-zapsnag"]],
      content: "note",
      sig: "sig",
    };
    const nostr = {
      fetch: jest.fn().mockResolvedValue([newerProduct, zapsnagPost]),
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [olderProduct],
    });

    const result = await fetchAllPosts(nostr as any, relays, editProductContext);

    expect(editProductContext).toHaveBeenNthCalledWith(
      1,
      [olderProduct],
      false
    );
    expect(result.productEvents).toEqual([newerProduct, zapsnagPost]);
    expect(result.profileSetFromProducts).toEqual(
      new Set([pubkey, "feed-author"])
    );
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([
      newerProduct,
      zapsnagPost,
    ]);
  });

  it("fetchAllPosts continues when the database API rejects and returns an empty relay result", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation();
    const { fetchAllPosts } = await setupFetchService();
    const editProductContext = jest.fn();
    const nostr = { fetch: jest.fn().mockResolvedValue([]) };
    (global.fetch as jest.Mock).mockRejectedValue(new Error("db down"));

    const result = await fetchAllPosts(nostr as any, relays, editProductContext);

    expect(result).toEqual({
      productEvents: [],
      profileSetFromProducts: new Set(),
    });
    expect(editProductContext).toHaveBeenCalledWith([], false);
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to fetch products from database: ",
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });

  it("fetchAllPosts handles an empty DB response and keeps the newer DB product when relay data is stale", async () => {
    const { fetchAllPosts, cacheEventsToDatabase } = await setupFetchService();
    const editProductContext = jest.fn();
    const dbProduct = {
      id: "db-product",
      pubkey,
      created_at: 40,
      kind: 30402,
      tags: [["d", "product-1"]],
      content: "db-version",
      sig: "sig-db",
    };
    const staleRelayProduct = {
      id: "relay-product",
      pubkey,
      created_at: 20,
      kind: 30402,
      tags: [["d", "product-1"]],
      content: "stale-relay-version",
      sig: "sig-relay",
    };
    const invalidRelayEvent = {
      id: "invalid-relay-event",
      pubkey: "missing-sig",
      created_at: 25,
      kind: 30402,
      tags: [["d", "product-2"]],
      content: "invalid",
    };
    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([dbProduct])
        .mockResolvedValueOnce([staleRelayProduct, invalidRelayEvent]),
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [dbProduct],
      });

    const emptyResult = await fetchAllPosts(
      nostr as any,
      relays,
      editProductContext
    );
    const mergedResult = await fetchAllPosts(
      nostr as any,
      relays,
      editProductContext
    );

    expect(emptyResult).toEqual({
      productEvents: [dbProduct],
      profileSetFromProducts: new Set([pubkey]),
    });
    expect(mergedResult.productEvents).toEqual([dbProduct, invalidRelayEvent]);
    expect(cacheEventsToDatabase).toHaveBeenLastCalledWith([staleRelayProduct]);
    expect(editProductContext).not.toHaveBeenNthCalledWith(1, [], false);
  });

  it("fetchAllPosts rejects when the relay fetch fails", async () => {
    const { fetchAllPosts } = await setupFetchService();
    const nostr = { fetch: jest.fn().mockRejectedValue(new Error("relay down")) };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    await expect(
      fetchAllPosts(nostr as any, relays, jest.fn())
    ).rejects.toThrow("relay down");
  });

  it("fetchProfile preserves existing profiles when no pubkeys are requested", async () => {
    const { fetchProfile } = await setupFetchService();
    const existing = new Map([[
      pubkey,
      {
        pubkey,
        created_at: 100,
        content: { name: "Existing" },
        nip05Verified: false,
      },
    ]]);
    const editProfileContext = jest.fn();

    const result = await fetchProfile(
      { fetch: jest.fn() } as any,
      relays,
      [],
      editProfileContext,
      existing
    );

    expect(result.profileMap).toEqual(existing);
    expect(editProfileContext).toHaveBeenCalledWith(existing, false);
  });

  it("fetchProfile ignores malformed DB profiles, accepts valid relay profiles, and verifies NIP-05", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation();
    const verifyNip05Identifier = jest.fn().mockResolvedValue(true);
    const { fetchProfile, cacheEventsToDatabase } = await setupFetchService({
      verifyNip05Identifier,
    });
    const relayProfile = {
      id: "relay-profile",
      pubkey,
      created_at: 30,
      kind: 0,
      content: JSON.stringify({ name: "Relay", nip05: "relay@example.com" }),
      tags: [],
      sig: "sig",
    };
    const nostr = { fetch: jest.fn().mockResolvedValue([relayProfile]) };
    const editProfileContext = jest.fn();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "bad-db-profile",
          pubkey,
          created_at: 20,
          kind: 0,
          content: "{not-json",
          tags: [],
          sig: "sig",
        },
      ],
    });

    const result = await fetchProfile(
      nostr as any,
      relays,
      [pubkey],
      editProfileContext
    );

    expect(result.profileMap.get(pubkey)).toMatchObject({
      pubkey,
      created_at: 30,
      content: { name: "Relay", nip05: "relay@example.com" },
      nip05Verified: true,
    });
    expect(verifyNip05Identifier).toHaveBeenCalledWith(
      "relay@example.com",
      pubkey
    );
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([relayProfile]);
    expect(errorSpy).toHaveBeenCalledWith(
      `Failed to parse profile from DB: ${pubkey}`,
      expect.any(SyntaxError)
    );

    errorSpy.mockRestore();
  });

  it("fetchProfile falls back to relays when the DB fetch rejects", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation();
    const { fetchProfile } = await setupFetchService();
    const nostr = { fetch: jest.fn().mockResolvedValue([]) };
    const editProfileContext = jest.fn();
    (global.fetch as jest.Mock).mockRejectedValue(new Error("db unavailable"));

    const result = await fetchProfile(
      nostr as any,
      relays,
      [pubkey],
      editProfileContext
    );

    expect(result.profileMap).toEqual(new Map());
    expect(editProfileContext).toHaveBeenCalledWith(
      new Map(),
      false
    );

    errorSpy.mockRestore();
  });

  it("fetchAllRelays merges DB and relay configs, deduping read/write/default buckets", async () => {
    const { fetchAllRelays, cacheEventsToDatabase } = await setupFetchService();
    const signer = { getPubKey: jest.fn().mockResolvedValue(pubkey) };
    const dbEvent = {
      id: "db-relays",
      pubkey,
      created_at: 10,
      kind: 10002,
      content: "",
      tags: [
        ["r", "wss://relay-a"],
        ["r", "wss://read-a", "read"],
        ["r", "wss://write-a", "write"],
      ],
      sig: "sig",
    };
    const relayEvent = {
      id: "relay-relays",
      pubkey,
      created_at: 20,
      kind: 10002,
      content: "",
      tags: [
        ["r", "wss://relay-a"],
        ["r", "wss://relay-b"],
        ["r", "wss://read-a", "read"],
        ["r", "wss://read-b", "read"],
        ["r", "wss://write-b", "write"],
      ],
      sig: "sig",
    };
    const nostr = { fetch: jest.fn().mockResolvedValue([relayEvent]) };
    const editRelaysContext = jest.fn();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [dbEvent],
    });

    const result = await fetchAllRelays(
      nostr as any,
      signer as any,
      relays,
      editRelaysContext
    );

    expect(result).toEqual({
      relayList: ["wss://relay-a", "wss://relay-b"],
      readRelayList: ["wss://read-a", "wss://read-b"],
      writeRelayList: ["wss://write-a", "wss://write-b"],
    });
    expect(editRelaysContext).toHaveBeenLastCalledWith(
      ["wss://relay-a", "wss://relay-b"],
      ["wss://read-a", "wss://read-b"],
      ["wss://write-a", "wss://write-b"],
      false
    );
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([relayEvent]);
  });

  it("fetchAllRelays returns empty lists when no signer pubkey is available", async () => {
    const { fetchAllRelays } = await setupFetchService();

    await expect(
      fetchAllRelays(
        { fetch: jest.fn() } as any,
        undefined,
        relays,
        jest.fn()
      )
    ).resolves.toEqual({
      relayList: [],
      readRelayList: [],
      writeRelayList: [],
    });
  });

  it("fetchAllRelays handles invalid DB JSON and still uses relay data", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation();
    const { fetchAllRelays } = await setupFetchService();
    const signer = { getPubKey: jest.fn().mockResolvedValue(pubkey) };
    const relayEvent = {
      id: "relay-relays",
      pubkey,
      created_at: 20,
      kind: 10002,
      content: "",
      tags: [["r", "wss://relay-only"]],
      sig: "sig",
    };
    const nostr = { fetch: jest.fn().mockResolvedValue([relayEvent]) };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("invalid json");
      },
    });

    const result = await fetchAllRelays(
      nostr as any,
      signer as any,
      relays,
      jest.fn()
    );

    expect(result.relayList).toEqual(["wss://relay-only"]);
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to fetch relay config from database: ",
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });

  it("fetchAllBlossomServers merges and dedupes DB and relay blossom servers", async () => {
    const { fetchAllBlossomServers, cacheEventsToDatabase } =
      await setupFetchService();
    const signer = { getPubKey: jest.fn().mockResolvedValue(pubkey) };
    const dbEvent = {
      id: "db-blossom",
      pubkey,
      created_at: 10,
      kind: 10063,
      content: "",
      tags: [["server", "https://cdn-a.example"]],
      sig: "sig",
    };
    const relayEvent = {
      id: "relay-blossom",
      pubkey,
      created_at: 20,
      kind: 10063,
      content: "",
      tags: [
        ["server", "https://cdn-a.example"],
        ["server", "https://cdn-b.example"],
      ],
      sig: "sig",
    };
    const nostr = { fetch: jest.fn().mockResolvedValue([relayEvent]) };
    const editBlossomContext = jest.fn();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [dbEvent],
    });

    const result = await fetchAllBlossomServers(
      nostr as any,
      signer as any,
      relays,
      editBlossomContext
    );

    expect(result.blossomServers).toEqual([
      "https://cdn-a.example",
      "https://cdn-b.example",
    ]);
    expect(editBlossomContext).toHaveBeenLastCalledWith(
      ["https://cdn-a.example", "https://cdn-b.example"],
      false
    );
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([relayEvent]);
  });

  it("fetchReviews ignores failed DB responses and builds review maps from relay events", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation();
    const { fetchReviews, cacheEventsToDatabase } = await setupFetchService();
    const product = {
      id: "product-event",
      pubkey,
      kind: 30402,
      created_at: 5,
      tags: [["d", "product-1"]],
      content: "",
      sig: "sig",
    };
    const relayReview = {
      id: "relay-review",
      pubkey: "reviewer",
      kind: 31555,
      created_at: 30,
      tags: [
        ["d", `a:30402:${pubkey}:product-1`],
        ["rating", "quality", "5"],
        ["rating", "communication", "4"],
      ],
      content: "great seller",
      sig: "sig",
    };
    const nostr = { fetch: jest.fn().mockResolvedValue([relayReview]) };
    const editReviewsContext = jest.fn();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => [],
    });

    const result = await fetchReviews(
      nostr as any,
      relays,
      [product as any],
      editReviewsContext
    );

    expect(result.merchantScoresMap.get(pubkey)).toHaveLength(1);
    expect(
      result.productReviewsMap.get(pubkey)?.get("product-1")?.get("reviewer")
    ).toEqual([
      ["comment", "great seller"],
      ["rating", "quality", "5"],
      ["rating", "communication", "4"],
    ]);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([relayReview]);
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to fetch reviews from database: ",
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });

  it("fetchReviews preserves a newer DB review when an older relay review for the same reviewer arrives", async () => {
    const { fetchReviews, cacheEventsToDatabase } = await setupFetchService();
    const merchantPubkey =
      "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const product = {
      id: "product-event",
      pubkey: merchantPubkey,
      kind: 30402,
      created_at: 5,
      tags: [["d", "product-1"]],
      content: "",
      sig: "sig",
    };
    const newerDbReview = {
      id: "db-review",
      pubkey: "reviewer",
      kind: 31555,
      created_at: 50,
      tags: [
        ["d", `a:30402:${merchantPubkey}:product-1`],
        ["rating", "quality", "5"],
      ],
      content: "db review",
      sig: "sig-db",
    };
    const olderRelayReview = {
      id: "relay-review",
      pubkey: "reviewer",
      kind: 31555,
      created_at: 10,
      tags: [
        ["d", `a:30402:${merchantPubkey}:product-1`],
        ["rating", "quality", "1"],
      ],
      content: "relay review",
      sig: "sig-relay",
    };
    const missingAddressRelayReview = {
      id: "relay-without-d",
      pubkey: "reviewer-2",
      kind: 31555,
      created_at: 20,
      tags: [["rating", "quality", "4"]],
      content: "ignored",
      sig: "sig",
    };
    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValue([olderRelayReview, missingAddressRelayReview]),
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [newerDbReview],
    });

    const result = await fetchReviews(
      nostr as any,
      relays,
      [product as any],
      jest.fn()
    );

    expect(
      result.productReviewsMap.get(merchantPubkey)?.get("product-1")?.get(
        "reviewer"
      )
    ).toEqual([
      ["comment", "db review"],
      ["rating", "quality", "5"],
    ]);
    expect(result.merchantScoresMap.get(merchantPubkey)).toHaveLength(1);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([
      olderRelayReview,
      missingAddressRelayReview,
    ]);
  });

  it("fetchAllCommunities falls back from malformed DB JSON and merges newer relay data for the same community id", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation();
    const { fetchAllCommunities, cacheEventsToDatabase } =
      await setupFetchService();
    const editCommunityContext = jest.fn();
    const dbCommunity = {
      id: "community-1",
      pubkey,
      created_at: 30,
      kind: 34550,
      tags: [
        ["d", "community"],
        ["name", "DB Community"],
        ["relay", "wss://db-request"],
      ],
      content: "",
      sig: "sig-db",
    };
    const newerRelayCommunity = {
      id: "community-1",
      pubkey,
      created_at: 45,
      kind: 34550,
      tags: [
        ["d", "community"],
        ["name", "Relay Community"],
        ["relay", "wss://relay-request"],
      ],
      content: "",
      sig: "sig-relay",
    };
    const invalidRelayCommunity = {
      id: "community-2",
      pubkey,
      created_at: 50,
      kind: 1,
      tags: [["d", "not-a-community"]],
      content: "",
      sig: "sig-invalid",
    };
    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([newerRelayCommunity, invalidRelayCommunity])
        .mockResolvedValueOnce([newerRelayCommunity]),
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error("malformed JSON");
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [dbCommunity],
      });

    const malformedDbResult = await fetchAllCommunities(
      nostr as any,
      relays,
      editCommunityContext
    );
    const mergedResult = await fetchAllCommunities(
      nostr as any,
      relays,
      editCommunityContext
    );

    expect(malformedDbResult.get("community-1")).toMatchObject({
      name: "Relay Community",
      createdAt: 45,
    });
    expect(mergedResult.get("community-1")).toMatchObject({
      name: "Relay Community",
      createdAt: 45,
      relays: expect.objectContaining({
        requests: ["wss://relay-request"],
      }),
    });
    expect(cacheEventsToDatabase).toHaveBeenNthCalledWith(1, [
      newerRelayCommunity,
    ]);
    expect(cacheEventsToDatabase).toHaveBeenNthCalledWith(2, [
      newerRelayCommunity,
    ]);
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to fetch communities from database: ",
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });

  it("fetchCommunityPosts resolves empty results for missing communities, missing relays, and unapproved posts", async () => {
    const { fetchCommunityPosts } = await setupFetchService({
      localStorageData: { relays: [] },
    });
    const community = {
      kind: 34550,
      pubkey,
      d: "community",
      moderators: ["moderator"],
      relays: {
        all: [],
        approvals: [],
        requests: [],
      },
    };

    await expect(
      fetchCommunityPosts({ fetch: jest.fn() } as any, undefined as any)
    ).resolves.toEqual([]);
    await expect(
      fetchCommunityPosts({ fetch: jest.fn() } as any, community as any)
    ).resolves.toEqual([]);

    const communityWithRelay = {
      ...community,
      relays: { all: ["wss://community.example"], approvals: [], requests: [] },
    };
    const nostr = { fetch: jest.fn().mockResolvedValue([]) };
    await expect(
      fetchCommunityPosts(nostr as any, communityWithRelay as any)
    ).resolves.toEqual([]);
  });

  it("fetchCommunityPosts returns approved posts with approval metadata sorted newest first", async () => {
    const { fetchCommunityPosts } = await setupFetchService({
      localStorageData: { relays: ["wss://user.example"] },
    });
    const community = {
      kind: 34550,
      pubkey,
      d: "community",
      moderators: ["moderator"],
      relays: {
        all: ["wss://community.example"],
        approvals: ["wss://approval.example"],
        requests: ["wss://request.example"],
      },
    };
    const approvalEvents = [
      {
        id: "ignored-approval",
        pubkey: "not-a-moderator",
        created_at: 100,
        kind: 4550,
        tags: [["e", "post-ignored"]],
        content: "",
        sig: "sig",
      },
      {
        id: "approval-a",
        pubkey: "moderator",
        created_at: 200,
        kind: 4550,
        tags: [["e", "post-a"]],
        content: "",
        sig: "sig",
      },
      {
        id: "approval-b",
        pubkey: "moderator",
        created_at: 300,
        kind: 4550,
        tags: [["e", "post-b"]],
        content: "",
        sig: "sig",
      },
    ];
    const posts = [
      {
        id: "post-a",
        pubkey: "author-a",
        created_at: 10,
        kind: 1111,
        tags: [],
        content: "older",
        sig: "sig",
      },
      {
        id: "post-b",
        pubkey: "author-b",
        created_at: 20,
        kind: 1111,
        tags: [],
        content: "newer",
        sig: "sig",
      },
    ];
    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce(approvalEvents)
        .mockResolvedValueOnce(posts),
    };

    const result = await fetchCommunityPosts(
      nostr as any,
      community as any,
      10
    );

    expect(result.map((post) => post.id)).toEqual(["post-b", "post-a"]);
    expect(result[0]).toMatchObject({
      approved: true,
      approvalEventId: "approval-b",
      approvedBy: "moderator",
    });
    expect(nostr.fetch).toHaveBeenNthCalledWith(
      2,
      [{ kinds: [1111], ids: ["post-a", "post-b"] }],
      {},
      ["wss://request.example"]
    );
  });

  it("fetchPendingPosts filters approved requests out and returns pending posts newest first", async () => {
    const { fetchPendingPosts } = await setupFetchService({
      localStorageData: { relays: ["wss://user.example"] },
    });
    const community = {
      kind: 34550,
      pubkey,
      d: "community",
      moderators: ["moderator"],
      relays: {
        all: ["wss://community.example"],
        approvals: ["wss://approval.example"],
        requests: ["wss://request.example"],
      },
    };
    const approvalEvents = [
      {
        id: "approval-approved",
        pubkey: "moderator",
        created_at: 100,
        kind: 4550,
        tags: [["e", "approved-post"]],
        content: "",
        sig: "sig",
      },
    ];
    const approvedPosts = [
      {
        id: "approved-post",
        pubkey: "author-approved",
        created_at: 20,
        kind: 1111,
        tags: [],
        content: "approved",
        sig: "sig",
      },
    ];
    const postRequests = [
      {
        id: "approved-post",
        pubkey: "author-approved",
        created_at: 20,
        kind: 1111,
        tags: [["a", `34550:${pubkey}:community`]],
        content: "approved",
        sig: "sig",
      },
      {
        id: "pending-old",
        pubkey: "author-old",
        created_at: 5,
        kind: 1111,
        tags: [["a", `34550:${pubkey}:community`]],
        content: "pending old",
        sig: "sig",
      },
      {
        id: "pending-new",
        pubkey: "author-new",
        created_at: 25,
        kind: 1111,
        tags: [["a", `34550:${pubkey}:community`]],
        content: "pending new",
        sig: "sig",
      },
    ];
    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce(approvalEvents)
        .mockResolvedValueOnce(approvedPosts)
        .mockResolvedValueOnce(postRequests),
    };

    const result = await fetchPendingPosts(nostr as any, community as any, 10);

    expect(result.map((post) => post.id)).toEqual([
      "pending-new",
      "pending-old",
    ]);
    expect(nostr.fetch).toHaveBeenNthCalledWith(
      3,
      [{ kinds: [1111], "#a": [`34550:${pubkey}:community`], limit: 10 }],
      {},
      ["wss://request.example", "wss://community.example", "wss://user.example"]
    );
  });

  it("fetchAllFollows falls back to the default author and merges qualified second-degree follows", async () => {
    const validA =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const validB =
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const validC =
      "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    const validD =
      "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
    const validE =
      "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

    const { fetchAllFollows } = await setupFetchService({
      localStorageData: { wot: 2 },
    });
    const editFollowsContext = jest.fn();
    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: "first-degree",
            pubkey: "source",
            created_at: 1,
            kind: 3,
            tags: [
              ["p", validA],
              ["p", validB],
              ["p", "not-a-hex-pubkey"],
            ],
            content: "",
            sig: "sig",
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "second-degree-1",
            pubkey: validA,
            created_at: 2,
            kind: 3,
            tags: [
              ["p", validC],
              ["p", validD],
            ],
            content: "",
            sig: "sig",
          },
          {
            id: "second-degree-2",
            pubkey: validB,
            created_at: 3,
            kind: 3,
            tags: [
              ["p", validC],
              ["p", validE],
            ],
            content: "",
            sig: "sig",
          },
        ]),
    };

    const result = await fetchAllFollows(
      nostr as any,
      relays,
      editFollowsContext,
      "short-user-pubkey"
    );

    expect(result.followList).toEqual([validA, validB, validC]);
    expect(editFollowsContext).toHaveBeenCalledWith(
      [validA, validB, validC],
      2,
      false
    );
    expect(nostr.fetch).toHaveBeenNthCalledWith(
      3,
      [{ kinds: [3], authors: [expect.any(String)] }],
      {},
      relays
    );
  });
});
