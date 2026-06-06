// @cashu/cashu-ts and nostr-tools (via @noble/@scure) ship ESM-only and, under
// this repo's pnpm node_modules layout, are not picked up by jest's
// transformIgnorePatterns (the resolved .pnpm symlink path contains a nested
// node_modules segment, so the negative-lookahead allowlist never matches).
// fetch-service imports both at module load (directly and transitively through
// nostr-manager / request-auth / nostr-helper-functions), but none of the code
// paths exercised by these tests use their runtime, so we stub them out to allow
// the module graph to load.
jest.mock("@cashu/cashu-ts", () => ({
  Mint: class {},
  Wallet: class {},
  hashToCurve: jest.fn(),
}));

jest.mock("uuid", () => ({
  v4: jest.fn(() => "00000000-0000-0000-0000-000000000000"),
}));

jest.mock("nostr-tools", () => ({
  SimplePool: class {},
  verifyEvent: jest.fn(() => true),
  finalizeEvent: jest.fn(),
  generateSecretKey: jest.fn(),
  getPublicKey: jest.fn(),
  getEventHash: jest.fn(),
  nip19: {
    decode: jest.fn(),
    npubEncode: jest.fn(),
    nsecEncode: jest.fn(),
    noteEncode: jest.fn(),
    neventEncode: jest.fn(),
    naddrEncode: jest.fn(),
  },
  nip44: {
    v2: {
      utils: { getConversationKey: jest.fn() },
      encrypt: jest.fn(),
      decrypt: jest.fn(),
    },
  },
}));

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

const makeProductEvent = (overrides: Record<string, any> = {}) =>
  makeBaseEvent({
    kind: 30402,
    tags: [["d", "listing-1"]],
    ...overrides,
  });

const makeDbPayload = <T>(items: T[]) => ({
  ok: true,
  json: async () => items,
});

describe("fetchAllPosts - NIP-99 and relay merge behavior", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("getEventKey uses d tag for kind 30402 merging", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchAllPosts } = await import("../fetch-service");

    const cachedA = makeProductEvent({
      id: "cached-a",
      pubkey: "seller",
      created_at: 100,
      tags: [["d", "tag-1"]],
      content: "cached-a",
      sig: "sig-cached-a",
    });
    const cachedB = makeProductEvent({
      id: "cached-b",
      pubkey: "seller",
      created_at: 110,
      tags: [["d", "tag-2"]],
      content: "cached-b",
      sig: "sig-cached-b",
    });
    const relayNewForA = makeProductEvent({
      id: "relay-a",
      pubkey: "seller",
      created_at: 200,
      tags: [["d", "tag-1"]],
      content: "relay-a",
      sig: "sig-relay-a",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(makeDbPayload([cachedA, cachedB]))
      .mockResolvedValueOnce(makeDbPayload([])) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([relayNewForA]) } as any;
    const editProductContext = jest.fn();

    const { productEvents, profileSetFromProducts } = await fetchAllPosts(
      nostr,
      ["wss://relay.example"],
      editProductContext
    );

    // relay should replace cachedA (same pubkey+d) but not affect cachedB (different d)
    expect(productEvents).toEqual(
      expect.arrayContaining([relayNewForA, cachedB])
    );
    expect(productEvents).not.toContain(cachedA);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([relayNewForA]);
    expect(profileSetFromProducts).toEqual(new Set(["seller"]));
  });

  it("includes kind 1 zapsnag notes alongside kind 30402 product events and caches both", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchAllPosts } = await import("../fetch-service");

    const product = makeProductEvent({
      id: "prod-1",
      pubkey: "seller-p",
      created_at: 150,
      tags: [["d", "prod-1"]],
      content: "product",
      sig: "sig-prod-1",
    });
    const zapsnagNote = makeBaseEvent({
      id: "zapsnag-1",
      pubkey: "seller-p",
      created_at: 160,
      kind: 1,
      tags: [["t", "shopstr-zapsnag"]],
      content: "zapsnag note",
      sig: "sig-zapsnag-1",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(makeDbPayload([]))
      .mockResolvedValueOnce(makeDbPayload([])) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([product, zapsnagNote]),
    } as any;
    const editProductContext = jest.fn();

    const { productEvents, profileSetFromProducts } = await fetchAllPosts(
      nostr,
      ["wss://relay.example"],
      editProductContext
    );

    expect(productEvents).toEqual(
      expect.arrayContaining([product, zapsnagNote])
    );
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([product, zapsnagNote]);
    expect(profileSetFromProducts).toEqual(new Set(["seller-p"]));
  });

  it("prefers newer relay events over older DB events for the same NIP-99 product key", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchAllPosts } = await import("../fetch-service");

    const dbOld = makeProductEvent({
      id: "db-old",
      pubkey: "seller-x",
      created_at: 100,
      tags: [["d", "same-key"]],
      content: "db-old",
      sig: "sig-db-old",
    });
    const relayNew = makeProductEvent({
      id: "relay-newer",
      pubkey: "seller-x",
      created_at: 300,
      tags: [["d", "same-key"]],
      content: "relay-new",
      sig: "sig-relay-new",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(makeDbPayload([dbOld]))
      .mockResolvedValueOnce(makeDbPayload([])) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([relayNew]) } as any;
    const editProductContext = jest.fn();

    const { productEvents } = await fetchAllPosts(
      nostr,
      ["wss://relay.example"],
      editProductContext
    );

    expect(productEvents).toEqual(expect.arrayContaining([relayNew]));
    expect(productEvents).not.toContain(dbOld);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([relayNew]);
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

    const oldCachedListing = {
      id: "cached-old",
      pubkey: "seller",
      created_at: 100,
      kind: 30402,
      tags: [["d", "listing-1"]],
      content: "",
      sig: "sig-cached-old",
    };
    const newerRelayListing = {
      id: "relay-new",
      pubkey: "seller",
      created_at: 200,
      kind: 30402,
      tags: [["d", "listing-1"]],
      content: "",
      sig: "sig-relay-new",
    };
    const relayNoteListing = {
      id: "relay-zapsnag",
      pubkey: "zapsnag-seller",
      created_at: 150,
      kind: 1,
      tags: [["t", "shopstr-zapsnag"]],
      content: "zapsnag listing",
      sig: "sig-zapsnag",
    };
    const invalidRelayListing = {
      id: "",
      pubkey: "seller",
      created_at: 300,
      kind: 30402,
      tags: [["d", "invalid"]],
      content: "",
      sig: "sig-invalid",
    };

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

  it("ignores invalid relay events and never caches them", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchAllPosts } = await import("../fetch-service");

    const validRelayListing = makeProductEvent({
      id: "relay-valid",
      pubkey: "seller-valid",
      created_at: 200,
      tags: [["d", "listing-valid"]],
      content: "",
      sig: "sig-relay-valid",
    });
    const invalidNoIdListing = makeProductEvent({
      id: "",
      pubkey: "seller-invalid-1",
      created_at: 210,
      tags: [["d", "listing-invalid-1"]],
      content: "",
      sig: "sig-invalid-1",
    });
    const invalidNoSigListing = makeProductEvent({
      id: "relay-invalid-nosig",
      pubkey: "seller-invalid-2",
      created_at: 220,
      tags: [["d", "listing-invalid-2"]],
      content: "",
      sig: "",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      }) as typeof global.fetch;

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValue([
          validRelayListing,
          invalidNoIdListing,
          invalidNoSigListing,
        ]),
    } as any;
    const editProductContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { productEvents, profileSetFromProducts } = await fetchAllPosts(
      nostr,
      ["wss://relay.example"],
      editProductContext
    );

    expect(cacheEventsToDatabase).toHaveBeenCalledWith([validRelayListing]);
    expect(cacheEventsToDatabase).not.toHaveBeenCalledWith(
      expect.arrayContaining([invalidNoIdListing, invalidNoSigListing])
    );
    // Downstream's merge loop uses isValidProductRelayEvent (requires id + sig +
    // pubkey), so the no-sig listing is dropped from productEvents and its pubkey
    // is excluded from profileSetFromProducts. (Upstream's merge only checks id,
    // so its expectations differ; adapted to downstream behavior.)
    expect(productEvents).toEqual([validRelayListing]);
    expect(productEvents).not.toContain(invalidNoIdListing);
    expect(productEvents).not.toContain(invalidNoSigListing);
    expect(profileSetFromProducts).toEqual(new Set(["seller-valid"]));

    consoleErrorSpy.mockRestore();
  });

  it("handles empty DB responses and empty relay responses", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchAllPosts } = await import("../fetch-service");

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      }) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([]),
    } as any;
    const editProductContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { productEvents, profileSetFromProducts } = await fetchAllPosts(
      nostr,
      ["wss://relay.example"],
      editProductContext
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(nostr.fetch).toHaveBeenCalledTimes(1);
    expect(editProductContext).toHaveBeenLastCalledWith([], false);
    expect(productEvents).toEqual([]);
    expect(profileSetFromProducts).toEqual(new Set());
    expect(cacheEventsToDatabase).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
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
