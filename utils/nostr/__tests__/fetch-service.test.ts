const makeBaseEvent = (overrides: Record<string, any> = {}) => ({
  id: "event-id",
  pubkey: "pubkey",
  created_at: 1,
  kind: 1,
  tags: [],
  content: "",
  sig: "sig",
  ...overrides,
});

const makeProfileEvent = (overrides: Record<string, any> = {}) =>
  makeBaseEvent({
    kind: 0,
    ...overrides,
  });

const makeProductEvent = (overrides: Record<string, any> = {}) =>
  makeBaseEvent({
    kind: 30402,
    tags: [["d", "listing-1"]],
    ...overrides,
  });

const makeReportEvent = (overrides: Record<string, any> = {}) =>
  makeBaseEvent({
    kind: 1984,
    tags: [["e", "listing-1", "spam"]],
    ...overrides,
  });

const makeReviewEvent = (overrides: Record<string, any> = {}) =>
  makeBaseEvent({
    kind: 31555,
    tags: [["d", "review-address"]],
    ...overrides,
  });

const makeWalletProof = (overrides: Record<string, any> = {}) => ({
  id: "proof-id",
  secret: "proof-secret",
  amount: 1,
  C: "C",
  ...overrides,
});

const makeWalletEvent = (overrides: Record<string, any> = {}) =>
  makeBaseEvent({
    kind: 7375,
    ...overrides,
  });

const fixtureFactories = {
  makeReviewEvent,
  makeWalletProof,
  makeWalletEvent,
};

void fixtureFactories;

const makeDbPayload = <T>(items: T[]) => ({
  ok: true,
  json: async () => items,
});

describe("getReportTargetIdentifiers", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("extracts both p and e tags from a report event", async () => {
    const { getReportTargetIdentifiers } = await import("../fetch-service");

    const identifiers = getReportTargetIdentifiers(
      makeReportEvent({
        tags: [
          ["p", "seller-1"],
          ["e", "listing-1", "spam"],
          ["p", "seller-2"],
          ["e", "listing-2", "impersonation"],
          ["t", "ignored"],
        ],
      }) as any
    );

    expect(identifiers).toEqual({
      referencedPubkeys: ["seller-1", "seller-2"],
      referencedEventIds: ["listing-1", "listing-2"],
    });
  });

  it("returns empty arrays when the report has no p or e tags", async () => {
    const { getReportTargetIdentifiers } = await import("../fetch-service");

    const identifiers = getReportTargetIdentifiers(
      makeReportEvent({
        tags: [
          ["t", "ignored"],
          ["subject", "noise"],
        ],
      }) as any
    );

    expect(identifiers).toEqual({
      referencedPubkeys: [],
      referencedEventIds: [],
    });
  });
});

describe("isHexString", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("returns true for a valid 64-character hex string", async () => {
    const { isHexString } = await import("../fetch-service");

    expect(
      isHexString(
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      )
    ).toBe(true);
  });

  it("returns false for short strings", async () => {
    const { isHexString } = await import("../fetch-service");

    expect(isHexString("abc123")).toBe(false);
  });

  it("returns false for non-hex strings", async () => {
    const { isHexString } = await import("../fetch-service");

    expect(
      isHexString(
        "z23456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      )
    ).toBe(false);
  });
});

describe("getUniqueProofs", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("deduplicates proofs by secret while preserving the first proof for each secret", async () => {
    const { getUniqueProofs } = await import("../fetch-service");

    const firstProof = makeWalletProof({
      id: "proof-1",
      secret: "shared-secret",
    }) as any;
    const duplicateProof = makeWalletProof({
      id: "proof-2",
      secret: "shared-secret",
      amount: 99,
    }) as any;
    const uniqueProof = makeWalletProof({
      id: "proof-3",
      secret: "unique-secret",
    }) as any;

    const dedupedProofs = getUniqueProofs([
      firstProof,
      duplicateProof,
      uniqueProof,
    ]);

    expect(dedupedProofs).toEqual([firstProof, uniqueProof]);
    expect(dedupedProofs).not.toContain(duplicateProof);
    expect(dedupedProofs).toHaveLength(2);
  });
});

describe("fetch-service report helpers", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    global.fetch = jest.fn();

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));
  });

  it("filters report fetches to loaded listings and related profiles", async () => {
    const { fetchReports } = await import("../fetch-service");
    const { cacheEventsToDatabase } = jest.requireMock("@/utils/db/db-client");

    (global.fetch as jest.Mock).mockResolvedValue({
      ...makeDbPayload([
        makeReportEvent({
          id: "db-relevant",
          pubkey: "reporter-1",
          created_at: 10,
          tags: [
            ["e", "listing-1", "spam"],
            ["p", "seller-1"],
          ],
          content: "spam listing",
          sig: "sig-1",
        }),
        makeReportEvent({
          id: "db-irrelevant",
          pubkey: "reporter-2",
          created_at: 11,
          tags: [["p", "seller-999", "spam"]],
          content: "other seller",
          sig: "sig-2",
        }),
        makeReportEvent({
          id: "db-reviewer-report",
          pubkey: "reporter-5",
          created_at: 14,
          tags: [["p", "reviewer-1", "spam"]],
          content: "bad reviewer",
          sig: "sig-5",
        }),
      ]),
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
      makeProductEvent({
        id: "listing-1",
        pubkey: "seller-1",
        created_at: 1,
        tags: [["d", "coffee-beans"]],
        content: "coffee",
        sig: "sig-product",
      }),
    ];

    const result = await fetchReports(
      nostr as any,
      ["wss://relay.example"],
      products as any,
      editReportsContext,
      ["reviewer-1"]
    );

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/db/fetch-reports?")
    );
    const requestUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(requestUrl).toContain("p=seller-1");
    expect(requestUrl).toContain("p=reviewer-1");
    expect(requestUrl).toContain("e=listing-1");
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

    global.fetch = jest.fn().mockResolvedValue(
      makeDbPayload([
        makeProfileEvent({
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
        }),
        makeBaseEvent({
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
        }),
        makeProfileEvent({
          id: "older-user-profile",
          pubkey,
          created_at: 200,
          tags: [],
          content: JSON.stringify({
            display_name: "Older User",
            name: "older-user",
          }),
          sig: "sig-older-user-profile",
        }),
      ])
    ) as typeof global.fetch;

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

describe("fetchAllPosts", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("merges cached and relay listings by NIP-99 address and caches only valid relay events", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchAllPosts } = await import("../fetch-service");

    const oldCachedListing = makeProductEvent({
      id: "cached-old",
      pubkey: "seller",
      created_at: 100,
      tags: [["d", "listing-1"]],
      content: "",
      sig: "sig-cached-old",
    });
    const newerRelayListing = makeProductEvent({
      id: "relay-new",
      pubkey: "seller",
      created_at: 200,
      tags: [["d", "listing-1"]],
      content: "",
      sig: "sig-relay-new",
    });
    const relayNoteListing = makeBaseEvent({
      id: "relay-zapsnag",
      pubkey: "zapsnag-seller",
      created_at: 150,
      kind: 1,
      tags: [["t", "shopstr-zapsnag"]],
      content: "zapsnag listing",
      sig: "sig-zapsnag",
    });
    const invalidRelayListing = makeProductEvent({
      id: "",
      pubkey: "seller",
      created_at: 300,
      tags: [["d", "invalid"]],
      content: "",
      sig: "sig-invalid",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [oldCachedListing],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      }) as typeof global.fetch;

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValue([
          newerRelayListing,
          relayNoteListing,
          invalidRelayListing,
        ]),
    } as any;
    const editProductContext = jest.fn();

    const { productEvents, profileSetFromProducts } = await fetchAllPosts(
      nostr,
      ["wss://relay.example"],
      editProductContext
    );

    expect(productEvents).toEqual(
      expect.arrayContaining([newerRelayListing, relayNoteListing])
    );
    expect(productEvents).not.toContain(oldCachedListing);
    expect(productEvents).not.toContain(invalidRelayListing);
    expect(profileSetFromProducts).toEqual(
      new Set(["seller", "zapsnag-seller"])
    );
    expect(editProductContext).toHaveBeenLastCalledWith(productEvents, false);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([
      newerRelayListing,
      relayNoteListing,
    ]);
  });
});

describe("fetchGiftWrappedChatsAndMessages", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("does not call the cached message endpoint without a signer proof", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchGiftWrappedChatsAndMessages } =
      await import("../fetch-service");

    global.fetch = jest.fn() as typeof global.fetch;
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const nostr = {
      fetch: jest.fn().mockResolvedValue([]),
    } as any;
    const editChatContext = jest.fn();

    const { profileSetFromChats } = await fetchGiftWrappedChatsAndMessages(
      nostr,
      undefined,
      ["wss://relay.example"],
      editChatContext,
      "user-pubkey"
    );

    expect(global.fetch).not.toHaveBeenCalled();
    expect(nostr.fetch).toHaveBeenCalledWith(
      [{ kinds: [1059], "#p": ["user-pubkey"] }],
      {},
      ["wss://relay.example"]
    );
    expect(editChatContext).toHaveBeenCalledWith(new Map(), false);
    expect(profileSetFromChats).toEqual(new Set());
    expect(cacheEventsToDatabase).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

describe("fetchCashuWallet", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("returns empty wallet state without touching relays or cache when no signer pubkey is available", async () => {
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({
        tokens: [{ id: "local-proof", secret: "local-secret" }],
      })),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn(),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    global.fetch = jest.fn() as typeof global.fetch;
    const nostr = {
      fetch: jest.fn(),
    } as any;
    const editCashuWalletContext = jest.fn();

    await expect(
      fetchCashuWallet(
        nostr,
        undefined,
        ["wss://relay.example"],
        editCashuWalletContext
      )
    ).resolves.toEqual({
      proofEvents: [],
      cashuMints: [],
      cashuProofs: [],
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(nostr.fetch).not.toHaveBeenCalled();
    expect(editCashuWalletContext).toHaveBeenCalledWith([], [], [], false);
  });
});
