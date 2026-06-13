import { NostrEvent, NostrManager } from "../nostr-manager";
import {
  buildNip50ProductSearchFilters,
  DEFAULT_NIP50_SEARCH_RELAYS,
  dedupeProductEvents,
  fetchNip50ProductSearch,
  NIP50_SEARCH_TIMEOUT_MS,
} from "../fetch-service";

jest.mock("@/utils/db/db-client", () => ({
  cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
}));

const { cacheEventsToDatabase } = jest.requireMock("@/utils/db/db-client");

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

const expectNip50RelayFetches = (
  fetchMock: jest.Mock,
  relays = DEFAULT_NIP50_SEARCH_RELAYS
) => {
  expect(fetchMock).toHaveBeenCalledTimes(relays.length);
  relays.forEach((relay, index) => {
    expect(fetchMock).toHaveBeenNthCalledWith(
      index + 1,
      expect.arrayContaining([
        expect.objectContaining({ kinds: [30402], search: "coffee" }),
      ]),
      {},
      [relay],
      NIP50_SEARCH_TIMEOUT_MS
    );
  });
};

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

  it("includes kind 1 zapsnag notes alongside kind 30402 product events and only caches products", async () => {
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
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([product]);
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

const makeProfileEvent = (overrides: Record<string, any> = {}) =>
  makeBaseEvent({
    kind: 0,
    ...overrides,
  });

const makeShopEvent = (overrides: Record<string, any> = {}) =>
  makeBaseEvent({
    kind: 30019,
    tags: [["d", "shop"]],
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

describe("verifyProfilesNip05", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("verifies profiles with nip05 values and leaves profiles without nip05 unchanged", async () => {
    const verifyNip05Identifier = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(),
      deleteEvent: jest.fn(),
      verifyNip05Identifier,
    }));

    const { verifyProfilesNip05 } = await import("../fetch-service");

    const profileWithNip05 = {
      pubkey: "pubkey-with-nip05",
      created_at: 1,
      content: { nip05: "alice@example.com" },
      nip05Verified: false,
    };
    const profileWithOtherNip05 = {
      pubkey: "pubkey-with-second-nip05",
      created_at: 2,
      content: { nip05: "bob@example.com" },
      nip05Verified: true,
    };
    const profileWithoutNip05 = {
      pubkey: "pubkey-without-nip05",
      created_at: 3,
      content: {},
      nip05Verified: true,
    };

    const profileMap = new Map([
      [profileWithNip05.pubkey, profileWithNip05],
      [profileWithOtherNip05.pubkey, profileWithOtherNip05],
      [profileWithoutNip05.pubkey, profileWithoutNip05],
    ]);

    await verifyProfilesNip05(profileMap, 8);

    expect(verifyNip05Identifier).toHaveBeenCalledTimes(2);
    expect(verifyNip05Identifier).toHaveBeenNthCalledWith(
      1,
      "alice@example.com",
      "pubkey-with-nip05"
    );
    expect(verifyNip05Identifier).toHaveBeenNthCalledWith(
      2,
      "bob@example.com",
      "pubkey-with-second-nip05"
    );
    expect(profileMap.get(profileWithNip05.pubkey)?.nip05Verified).toBe(true);
    expect(profileMap.get(profileWithOtherNip05.pubkey)?.nip05Verified).toBe(
      false
    );
    expect(profileMap.get(profileWithoutNip05.pubkey)?.nip05Verified).toBe(
      true
    );
    expect(Array.from(profileMap.keys())).toEqual([
      profileWithNip05.pubkey,
      profileWithOtherNip05.pubkey,
      profileWithoutNip05.pubkey,
    ]);
  });

  it("uses batch processing without changing the output shape", async () => {
    const verifyNip05Identifier = jest.fn().mockResolvedValue(true);

    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(),
      deleteEvent: jest.fn(),
      verifyNip05Identifier,
    }));

    const { verifyProfilesNip05 } = await import("../fetch-service");

    const profileMap = new Map(
      Array.from({ length: 5 }, (_, index) => [
        `pubkey-${index}`,
        {
          pubkey: `pubkey-${index}`,
          created_at: index,
          content: { nip05: `user-${index}@example.com` },
          nip05Verified: false,
        },
      ])
    );

    await verifyProfilesNip05(profileMap, 2);

    expect(verifyNip05Identifier).toHaveBeenCalledTimes(5);
    expect(Array.from(profileMap.entries())).toHaveLength(5);
    expect(Array.from(profileMap.values())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pubkey: "pubkey-0",
          content: { nip05: "user-0@example.com" },
          nip05Verified: true,
        }),
        expect.objectContaining({
          pubkey: "pubkey-4",
          content: { nip05: "user-4@example.com" },
          nip05Verified: true,
        }),
      ])
    );
  });

  it("marks profiles false when verifyNip05Identifier rejects", async () => {
    const verifyNip05Identifier = jest
      .fn()
      .mockRejectedValueOnce(new Error("verification failed"));
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(),
      deleteEvent: jest.fn(),
      verifyNip05Identifier,
    }));

    const { verifyProfilesNip05 } = await import("../fetch-service");

    const profileMap = new Map([
      [
        "pubkey-failed",
        {
          pubkey: "pubkey-failed",
          created_at: 1,
          content: { nip05: "fail@example.com" },
          nip05Verified: true,
        },
      ],
    ]);

    await verifyProfilesNip05(profileMap, 1);

    expect(verifyNip05Identifier).toHaveBeenCalledWith(
      "fail@example.com",
      "pubkey-failed"
    );
    expect(profileMap.get("pubkey-failed")?.nip05Verified).toBe(false);
    consoleErrorSpy.mockRestore();
  });
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

describe("fetch-service NIP-50 search helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("builds NIP-50 search filters only for marketplace listings", () => {
    expect(
      buildNip50ProductSearchFilters("  cold   brew  ", {
        authors: ["seller-1"],
        limit: 25,
      })
    ).toEqual([
      {
        kinds: [30402],
        search: "cold brew",
        limit: 25,
        authors: ["seller-1"],
      },
    ]);
  });

  it("does not build or fetch NIP-50 search filters for blank queries", async () => {
    const nostr = {
      fetch: jest.fn().mockResolvedValue([]),
    };

    expect(buildNip50ProductSearchFilters("   \n\t  ")).toEqual([]);

    const result = await fetchNip50ProductSearch(
      nostr as unknown as NostrManager,
      DEFAULT_NIP50_SEARCH_RELAYS,
      "   "
    );

    expect(result.productEvents).toEqual([]);
    expect(nostr.fetch).not.toHaveBeenCalled();
    expect(cacheEventsToDatabase).not.toHaveBeenCalled();
  });

  it("normalizes search text before sending it to each NIP-50 relay", async () => {
    const nostr = {
      fetch: jest.fn().mockResolvedValue([]),
    };

    await fetchNip50ProductSearch(
      nostr as unknown as NostrManager,
      [],
      "  cold   brew  ",
      { limit: 25 }
    );

    expect(nostr.fetch).toHaveBeenCalledTimes(
      DEFAULT_NIP50_SEARCH_RELAYS.length
    );
    DEFAULT_NIP50_SEARCH_RELAYS.forEach((relay, index) => {
      expect(nostr.fetch).toHaveBeenNthCalledWith(
        index + 1,
        expect.arrayContaining([
          expect.objectContaining({
            kinds: [30402],
            search: "cold brew",
            limit: 25,
          }),
        ]),
        {},
        [relay],
        NIP50_SEARCH_TIMEOUT_MS
      );
    });
  });

  it("deduplicates replaceable listing events by address and keeps the latest version", () => {
    const older = {
      id: "older",
      pubkey: "seller-1",
      created_at: 10,
      kind: 30402,
      tags: [
        ["d", "coffee"],
        ["title", "Coffee Beans"],
        ["price", "12", "USD"],
      ],
      content: "old coffee",
      sig: "sig-older",
    };
    const newer = {
      ...older,
      id: "newer",
      created_at: 20,
      content: "new coffee",
      sig: "sig-newer",
    };

    expect(dedupeProductEvents([older, newer] as NostrEvent[])).toEqual([
      newer,
    ]);
  });

  it("fetches NIP-50 product results, deduplicates them, and caches valid events", async () => {
    const older = {
      id: "older",
      pubkey: "seller-1",
      created_at: 10,
      kind: 30402,
      tags: [
        ["d", "coffee"],
        ["title", "Coffee Beans"],
        ["price", "12", "USD"],
      ],
      content: "old coffee",
      sig: "sig-older",
    };
    const newer = {
      ...older,
      id: "newer",
      created_at: 20,
      content: "new coffee",
      sig: "sig-newer",
    };
    const invalid = {
      id: "",
      pubkey: "seller-2",
      created_at: 30,
      kind: 30402,
      tags: [["d", "tea"]],
      content: "tea",
      sig: "sig-invalid",
    };
    const nostr = {
      fetch: jest.fn().mockResolvedValue([older, newer, invalid]),
    };

    const result = await fetchNip50ProductSearch(
      nostr as unknown as NostrManager,
      ["wss://relay.example"],
      "coffee"
    );

    expectNip50RelayFetches(nostr.fetch);
    expect(result.productEvents).toEqual([newer]);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([newer]);
  });

  it("waits for relevant kind 30402 search results to be cached before returning them", async () => {
    const product = {
      id: "coffee-product",
      pubkey: "seller-1",
      created_at: 20,
      kind: 30402,
      tags: [
        ["d", "coffee"],
        ["title", "Coffee Beans"],
        ["price", "12", "USD"],
      ],
      content: "Fresh roasted coffee",
      sig: "sig-coffee",
    };
    const nostr = {
      fetch: jest.fn().mockResolvedValue([product]),
    };
    let resolveCache!: () => void;
    (cacheEventsToDatabase as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCache = resolve;
        })
    );

    let didResolve = false;
    const searchPromise = fetchNip50ProductSearch(
      nostr as unknown as NostrManager,
      ["wss://relay.example"],
      "coffee"
    ).then((result) => {
      didResolve = true;
      return result;
    });

    for (let index = 0; index < 5 && !resolveCache; index += 1) {
      await Promise.resolve();
    }

    expect(didResolve).toBe(false);
    expect(resolveCache).toBeDefined();

    resolveCache();
    const result = await searchPromise;

    expect(result.productEvents).toEqual([product]);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([product]);
  });

  it("filters unsupported-relay noise before returning or caching search results", async () => {
    const relevant = {
      id: "coffee-product",
      pubkey: "seller-1",
      created_at: 20,
      kind: 30402,
      tags: [
        ["d", "coffee"],
        ["title", "Coffee Beans"],
        ["price", "12", "USD"],
      ],
      content: "Fresh roasted coffee",
      sig: "sig-coffee",
    };
    const unrelated = {
      id: "tea-product",
      pubkey: "seller-2",
      created_at: 30,
      kind: 30402,
      tags: [
        ["d", "tea"],
        ["title", "Tea Leaves"],
        ["price", "8", "USD"],
      ],
      content: "Green tea",
      sig: "sig-tea",
    };
    const nostr = {
      fetch: jest.fn().mockResolvedValue([unrelated, relevant]),
    };

    const result = await fetchNip50ProductSearch(
      nostr as unknown as NostrManager,
      ["wss://relay.example"],
      "coffee"
    );

    expect(result.productEvents).toEqual([relevant]);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([relevant]);
  });

  it("preserves relay relevance order for distinct NIP-50 search results", async () => {
    const firstRelayResult = {
      id: "older-but-more-relevant",
      pubkey: "seller-1",
      created_at: 10,
      kind: 30402,
      tags: [
        ["d", "coffee-1"],
        ["title", "Coffee Beans"],
        ["price", "12", "USD"],
      ],
      content: "Top-ranked coffee result",
      sig: "sig-older",
    };
    const secondRelayResult = {
      id: "newer-but-less-relevant",
      pubkey: "seller-2",
      created_at: 100,
      kind: 30402,
      tags: [
        ["d", "coffee-2"],
        ["title", "Coffee Roaster"],
        ["price", "20", "USD"],
      ],
      content: "Second-ranked coffee result",
      sig: "sig-newer",
    };
    const nostr = {
      fetch: jest.fn().mockResolvedValue([firstRelayResult, secondRelayResult]),
    };

    const result = await fetchNip50ProductSearch(
      nostr as unknown as NostrManager,
      [],
      "coffee"
    );

    expect(result.productEvents).toEqual([firstRelayResult, secondRelayResult]);
  });

  it("routes search to curated NIP-50 relays instead of general user relays", async () => {
    const searchListing = {
      id: "fallback-product",
      pubkey: "fallback-seller",
      created_at: 30,
      kind: 30402,
      tags: [
        ["d", "fallback-coffee"],
        ["title", "Fallback Coffee Beans"],
        ["price", "12", "USD"],
      ],
      content: "fallback coffee",
      sig: "sig-fallback",
    };
    const nostr = {
      fetch: jest.fn().mockResolvedValue([searchListing]),
    };

    const result = await fetchNip50ProductSearch(
      nostr as unknown as NostrManager,
      ["wss://relay.damus.io", "wss://nos.lol"],
      "coffee"
    );

    expectNip50RelayFetches(nostr.fetch);
    expect(result.productEvents).toEqual([searchListing]);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([searchListing]);
  });

  it("keeps NIP-50 results from responsive relays when another search relay times out", async () => {
    const searchListing = {
      id: "responsive-product",
      pubkey: "responsive-seller",
      created_at: 30,
      kind: 30402,
      tags: [
        ["d", "responsive-coffee"],
        ["title", "Responsive Coffee Beans"],
        ["price", "12", "USD"],
      ],
      content: "responsive coffee",
      sig: "sig-responsive",
    };
    const nostr = {
      fetch: jest.fn((_, __, relays: string[]) =>
        relays[0] === DEFAULT_NIP50_SEARCH_RELAYS[1]
          ? Promise.resolve([searchListing])
          : Promise.reject(new Error("Timeout"))
      ),
    };

    const result = await fetchNip50ProductSearch(
      nostr as unknown as NostrManager,
      [],
      "coffee"
    );

    expectNip50RelayFetches(nostr.fetch);
    expect(result.productEvents).toEqual([searchListing]);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([searchListing]);
  });

  it("returns an empty result without caching when every NIP-50 relay fails", async () => {
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const nostr = {
      fetch: jest.fn().mockRejectedValue(new Error("Timeout")),
    };

    const result = await fetchNip50ProductSearch(
      nostr as unknown as NostrManager,
      [],
      "coffee"
    );

    expectNip50RelayFetches(nostr.fetch);
    expect(result.productEvents).toEqual([]);
    expect(cacheEventsToDatabase).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledTimes(
      DEFAULT_NIP50_SEARCH_RELAYS.length
    );

    consoleWarnSpy.mockRestore();
  });

  it("returns NIP-50 search results even when caching those results fails", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const searchListing = {
      id: "cache-failed-product",
      pubkey: "cache-failed-seller",
      created_at: 30,
      kind: 30402,
      tags: [
        ["d", "cache-failed-coffee"],
        ["title", "Cache Failed Coffee Beans"],
        ["price", "12", "USD"],
      ],
      content: "cache failed coffee",
      sig: "sig-cache-failed",
    };
    const nostr = {
      fetch: jest.fn().mockResolvedValue([searchListing]),
    };
    (cacheEventsToDatabase as jest.Mock).mockRejectedValueOnce(
      new Error("cache failed")
    );

    const result = await fetchNip50ProductSearch(
      nostr as unknown as NostrManager,
      [],
      "coffee"
    );

    expect(result.productEvents).toEqual([searchListing]);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([searchListing]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to cache NIP-50 product search events:",
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it("keeps known selected NIP-50 relays while dropping unsupported selected relays", async () => {
    const selectedSearchRelay = "wss://relay.nostr.band";
    const searchRelays = [
      selectedSearchRelay,
      ...DEFAULT_NIP50_SEARCH_RELAYS.filter(
        (relay) => relay !== selectedSearchRelay
      ),
    ];
    const nostr = {
      fetch: jest.fn().mockResolvedValue([]),
    };

    await fetchNip50ProductSearch(
      nostr as unknown as NostrManager,
      ["wss://relay.damus.io", "relay.nostr.band/", "wss://nos.lol"],
      "coffee"
    );

    expectNip50RelayFetches(nostr.fetch, searchRelays);
  });

  it("deduplicates normalized selected NIP-50 relays before adding backup relays", async () => {
    const selectedSearchRelays = [
      "wss://relay.noswhere.com",
      "wss://search.nos.today",
    ];
    const searchRelays = [
      ...selectedSearchRelays,
      ...DEFAULT_NIP50_SEARCH_RELAYS.filter(
        (relay) => !selectedSearchRelays.includes(relay)
      ),
    ];
    const nostr = {
      fetch: jest.fn().mockResolvedValue([]),
    };

    await fetchNip50ProductSearch(
      nostr as unknown as NostrManager,
      [
        "relay.noswhere.com/",
        "wss://relay.noswhere.com",
        "wss://search.nos.today/",
        "wss://relay.damus.io",
      ],
      "coffee"
    );

    expectNip50RelayFetches(nostr.fetch, searchRelays);
  });

  it("uses default NIP-50 relays when no selected relays are available", async () => {
    const fallbackListing = {
      id: "default-product",
      pubkey: "fallback-seller",
      created_at: 40,
      kind: 30402,
      tags: [
        ["d", "default-coffee"],
        ["title", "Default Coffee Beans"],
        ["price", "12", "USD"],
      ],
      content: "default coffee",
      sig: "sig-default",
    };
    const nostr = {
      fetch: jest.fn().mockResolvedValue([fallbackListing]),
    };

    const result = await fetchNip50ProductSearch(
      nostr as unknown as NostrManager,
      [],
      "coffee"
    );

    expectNip50RelayFetches(nostr.fetch);
    expect(result.productEvents).toEqual([fallbackListing]);
  });

  it("ignores non-listing events returned by NIP-50 search relays", async () => {
    const zapsnagNote = {
      id: "zapsnag-coffee",
      pubkey: "seller-1",
      created_at: 20,
      kind: 1,
      tags: [["t", "shopstr-zapsnag"]],
      content:
        "Coffee beans price: 100 sats #zapsnag https://example.com/coffee.png",
      sig: "sig-zapsnag",
    };
    const nostr = {
      fetch: jest.fn().mockResolvedValue([zapsnagNote]),
    };

    const result = await fetchNip50ProductSearch(
      nostr as unknown as NostrManager,
      ["wss://relay.example"],
      "coffee"
    );

    expect(result.productEvents).toEqual([]);
    expect(cacheEventsToDatabase).not.toHaveBeenCalled();
  });

  it("deduplicates the same addressable NIP-50 listing returned by multiple relays before caching", async () => {
    const older = {
      id: "relay-one-product",
      pubkey: "seller-1",
      created_at: 10,
      kind: 30402,
      tags: [
        ["d", "cross-relay-coffee"],
        ["title", "Cross Relay Coffee"],
        ["price", "12", "USD"],
      ],
      content: "older relay coffee",
      sig: "sig-relay-one",
    };
    const newer = {
      ...older,
      id: "relay-two-product",
      created_at: 20,
      content: "newer relay coffee",
      sig: "sig-relay-two",
    };
    const nostr = {
      fetch: jest.fn((_, __, relays: string[]) =>
        relays[0] === DEFAULT_NIP50_SEARCH_RELAYS[0]
          ? Promise.resolve([older])
          : Promise.resolve([newer])
      ),
    };

    const result = await fetchNip50ProductSearch(
      nostr as unknown as NostrManager,
      [],
      "coffee"
    );

    expect(result.productEvents).toEqual([newer]);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([newer]);
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

describe("fetchReports", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("includes reports matched by listing e-tag and reports matched by seller p-tag", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReports } = await import("../fetch-service");

    const productA = makeProductEvent({
      id: "prod-a",
      pubkey: "seller-a",
      created_at: 1,
      tags: [["d", "item-a"]],
      sig: "sig-prod-a",
    });
    const productB = makeProductEvent({
      id: "prod-b",
      pubkey: "seller-b",
      created_at: 2,
      tags: [["d", "item-b"]],
      sig: "sig-prod-b",
    });
    const reportByETag = makeReportEvent({
      id: "report-e",
      pubkey: "reporter-1",
      created_at: 10,
      tags: [["e", "prod-a", "spam"]],
      sig: "sig-report-e",
    });
    const reportByPTag = makeReportEvent({
      id: "report-p",
      pubkey: "reporter-2",
      created_at: 11,
      tags: [["p", "seller-b", "impersonation"]],
      sig: "sig-report-p",
    });
    const reportIrrelevant = makeReportEvent({
      id: "report-irrelevant",
      pubkey: "reporter-3",
      created_at: 12,
      tags: [["p", "unknown-seller", "spam"]],
      sig: "sig-irrelevant",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(
        makeDbPayload([reportByETag, reportByPTag, reportIrrelevant])
      ) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) } as any;
    const editReportsContext = jest.fn();

    const { reportEvents } = await fetchReports(
      nostr,
      ["wss://relay.example"],
      [productA, productB] as any,
      editReportsContext
    );

    expect(reportEvents.map((e) => e.id)).toEqual(
      expect.arrayContaining(["report-e", "report-p"])
    );
    expect(reportEvents.map((e) => e.id)).not.toContain("report-irrelevant");
  });

  it("discards DB report rows that reference neither loaded product IDs nor seller pubkeys", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReports } = await import("../fetch-service");

    const product = makeProductEvent({
      id: "known-listing",
      pubkey: "known-seller",
      created_at: 1,
      tags: [["d", "item"]],
      sig: "sig-product",
    });
    const relevantByEventId = makeReportEvent({
      id: "relevant-e",
      pubkey: "reporter-1",
      created_at: 10,
      tags: [["e", "known-listing", "spam"]],
      sig: "sig-relevant-e",
    });
    const irrelevantWrongSeller = makeReportEvent({
      id: "irrelevant-seller",
      pubkey: "reporter-2",
      created_at: 11,
      tags: [["p", "stranger-seller", "spam"]],
      sig: "sig-irrelevant-seller",
    });
    const irrelevantWrongListing = makeReportEvent({
      id: "irrelevant-listing",
      pubkey: "reporter-3",
      created_at: 12,
      tags: [["e", "unknown-listing", "spam"]],
      sig: "sig-irrelevant-listing",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(
        makeDbPayload([
          relevantByEventId,
          irrelevantWrongSeller,
          irrelevantWrongListing,
        ])
      ) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) } as any;
    const editReportsContext = jest.fn();

    const { reportEvents } = await fetchReports(
      nostr,
      ["wss://relay.example"],
      [product] as any,
      editReportsContext
    );

    expect(reportEvents).toHaveLength(1);
    expect(reportEvents[0]?.id).toBe("relevant-e");
  });

  it("additionalProfilePubkeys expands the seller-pubkey match set for DB query and relay filter", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReports } = await import("../fetch-service");

    const product = makeProductEvent({
      id: "listing-1",
      pubkey: "seller-1",
      created_at: 1,
      tags: [["d", "item"]],
      sig: "sig-product",
    });
    const extraReviewerReport = makeReportEvent({
      id: "report-extra",
      pubkey: "reporter-x",
      created_at: 20,
      tags: [["p", "extra-reviewer", "spam"]],
      sig: "sig-extra",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(
        makeDbPayload([extraReviewerReport])
      ) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) } as any;
    const editReportsContext = jest.fn();

    const { reportEvents } = await fetchReports(
      nostr,
      ["wss://relay.example"],
      [product] as any,
      editReportsContext,
      ["extra-reviewer"]
    );

    expect(reportEvents.map((e) => e.id)).toContain("report-extra");

    const dbUrl = (global.fetch as jest.Mock).mock.calls[0]?.[0] as string;
    expect(dbUrl).toContain("p=extra-reviewer");

    expect(nostr.fetch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          kinds: [1984],
          "#p": expect.arrayContaining(["extra-reviewer"]),
        }),
      ]),
      {},
      ["wss://relay.example"]
    );
  });

  it("emits DB-cached reports to context before relay results arrive", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReports } = await import("../fetch-service");

    const product = makeProductEvent({
      id: "listing-db-first",
      pubkey: "seller-db-first",
      created_at: 1,
      tags: [["d", "item-db-first"]],
      sig: "sig-product-db-first",
    });
    const dbReport = makeReportEvent({
      id: "report-from-db",
      pubkey: "reporter-db",
      created_at: 50,
      tags: [["e", "listing-db-first", "spam"]],
      sig: "sig-db-report",
    });
    const relayReport = makeReportEvent({
      id: "report-from-relay",
      pubkey: "reporter-relay",
      created_at: 60,
      tags: [["p", "seller-db-first", "impersonation"]],
      sig: "sig-relay-report",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([dbReport])) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([relayReport]) } as any;
    const editReportsContext = jest.fn();

    await fetchReports(
      nostr,
      ["wss://relay.example"],
      [product] as any,
      editReportsContext
    );

    expect(editReportsContext).toHaveBeenCalledTimes(2);
    // First call is DB-only, before relay completes
    expect(editReportsContext.mock.calls[0]).toEqual([
      [expect.objectContaining({ id: "report-from-db" })],
      false,
    ]);
    // Final call includes both DB and relay reports
    expect(editReportsContext).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "report-from-db" }),
        expect.objectContaining({ id: "report-from-relay" }),
      ]),
      false
    );
  });

  it("passes separate p-based and e-based filter objects to relay fetch", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReports } = await import("../fetch-service");

    const productA = makeProductEvent({
      id: "prod-pfilter-a",
      pubkey: "seller-pfilter-a",
      created_at: 1,
      tags: [["d", "item-pfilter-a"]],
      sig: "sig-pfilter-a",
    });
    const productB = makeProductEvent({
      id: "prod-pfilter-b",
      pubkey: "seller-pfilter-b",
      created_at: 2,
      tags: [["d", "item-pfilter-b"]],
      sig: "sig-pfilter-b",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) } as any;
    const editReportsContext = jest.fn();

    await fetchReports(
      nostr,
      ["wss://relay.example"],
      [productA, productB] as any,
      editReportsContext
    );

    const filters = nostr.fetch.mock.calls[0][0] as any[];
    expect(filters).toHaveLength(2);
    const pFilter = filters.find((f) => "#p" in f);
    const eFilter = filters.find((f) => "#e" in f);
    expect(pFilter).toMatchObject({
      kinds: [1984],
      "#p": expect.arrayContaining(["seller-pfilter-a", "seller-pfilter-b"]),
    });
    expect(eFilter).toMatchObject({
      kinds: [1984],
      "#e": expect.arrayContaining(["prod-pfilter-a", "prod-pfilter-b"]),
    });
  });

  it("keeps the relay version of a report when the relay event has a higher created_at", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReports } = await import("../fetch-service");

    const product = makeProductEvent({
      id: "listing-merge",
      pubkey: "seller-merge",
      created_at: 1,
      tags: [["d", "item-merge"]],
      sig: "sig-product-merge",
    });
    const dbVersion = makeReportEvent({
      id: "shared-report-id",
      pubkey: "reporter-merge",
      created_at: 100,
      tags: [["e", "listing-merge", "spam"]],
      content: "db-content",
      sig: "sig-db-version",
    });
    const relayVersionNewer = makeReportEvent({
      id: "shared-report-id",
      pubkey: "reporter-merge",
      created_at: 200,
      tags: [["e", "listing-merge", "spam"]],
      content: "relay-content",
      sig: "sig-relay-version",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([dbVersion])) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayVersionNewer]),
    } as any;
    const editReportsContext = jest.fn();

    const { reportEvents } = await fetchReports(
      nostr,
      ["wss://relay.example"],
      [product] as any,
      editReportsContext
    );

    expect(reportEvents).toHaveLength(1);
    expect(reportEvents[0]).toMatchObject({
      id: "shared-report-id",
      content: "relay-content",
      created_at: 200,
    });
  });

  it("returns an empty result and skips relay fetch when products array is empty", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReports } = await import("../fetch-service");

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;
    const nostr = { fetch: jest.fn() } as any;
    const editReportsContext = jest.fn();

    const { reportEvents } = await fetchReports(
      nostr,
      ["wss://relay.example"],
      [],
      editReportsContext
    );

    expect(reportEvents).toEqual([]);
    expect(nostr.fetch).not.toHaveBeenCalled();
    expect(editReportsContext).toHaveBeenCalledWith([], false);
  });

  it("caches only relay events that are valid kind 1984 with id, sig, and pubkey", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReports } = await import("../fetch-service");

    const product = makeProductEvent({
      id: "listing-cache-valid",
      pubkey: "seller-cache-valid",
      created_at: 1,
      tags: [["d", "item-cache-valid"]],
      sig: "sig-product-cache-valid",
    });
    const validReport = makeReportEvent({
      id: "valid-report-cache",
      pubkey: "reporter-valid-cache",
      created_at: 10,
      tags: [["p", "seller-cache-valid", "spam"]],
      sig: "sig-valid-cache",
    });
    const missingId = makeReportEvent({
      id: "",
      pubkey: "reporter-noid",
      created_at: 11,
      tags: [["p", "seller-cache-valid", "spam"]],
      sig: "sig-noid",
    });
    const missingSig = makeReportEvent({
      id: "report-nosig",
      pubkey: "reporter-nosig",
      created_at: 12,
      tags: [["p", "seller-cache-valid", "spam"]],
      sig: "",
    });
    const wrongKind = makeBaseEvent({
      id: "report-wrongkind",
      pubkey: "reporter-wrongkind",
      created_at: 13,
      kind: 1,
      tags: [["p", "seller-cache-valid", "spam"]],
      sig: "sig-wrongkind",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValue([validReport, missingId, missingSig, wrongKind]),
    } as any;
    const editReportsContext = jest.fn();

    await fetchReports(
      nostr,
      ["wss://relay.example"],
      [product] as any,
      editReportsContext
    );

    expect(cacheEventsToDatabase).toHaveBeenCalledTimes(1);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([validReport]);
  });

  it("catches and logs a DB fetch throw and still queries the relay", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReports } = await import("../fetch-service");

    const product = makeProductEvent({
      id: "listing-reports-db-throw",
      pubkey: "seller-reports-db-throw",
      created_at: 1,
      tags: [["d", "item-reports-db-throw"]],
      sig: "sig-product-reports-db-throw",
    });
    const relayReport = makeReportEvent({
      id: "relay-report-db-throw",
      pubkey: "reporter-db-throw",
      created_at: 10,
      tags: [["p", "seller-reports-db-throw", "spam"]],
      sig: "sig-relay-report-db-throw",
    });

    const dbError = new Error("DB unavailable");
    global.fetch = jest.fn().mockRejectedValue(dbError) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayReport]),
    } as any;
    const editReportsContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { reportEvents } = await fetchReports(
      nostr,
      ["wss://relay.example"],
      [product] as any,
      editReportsContext
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch reports from database: ",
      dbError
    );
    expect(nostr.fetch).toHaveBeenCalledTimes(1);
    expect(reportEvents.map((e) => e.id)).toContain("relay-report-db-throw");

    consoleErrorSpy.mockRestore();
  });

  it("skips DB reports when response.ok is false and still queries the relay", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReports } = await import("../fetch-service");

    const product = makeProductEvent({
      id: "listing-reports-ok-false",
      pubkey: "seller-reports-ok-false",
      created_at: 1,
      tags: [["d", "item-reports-ok-false"]],
      sig: "sig-product-reports-ok-false",
    });
    const relayReport = makeReportEvent({
      id: "relay-report-ok-false",
      pubkey: "reporter-ok-false",
      created_at: 10,
      tags: [["p", "seller-reports-ok-false", "spam"]],
      sig: "sig-relay-report-ok-false",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false }) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayReport]),
    } as any;
    const editReportsContext = jest.fn();

    const { reportEvents } = await fetchReports(
      nostr,
      ["wss://relay.example"],
      [product] as any,
      editReportsContext
    );

    expect(nostr.fetch).toHaveBeenCalledTimes(1);
    expect(reportEvents.map((e) => e.id)).toContain("relay-report-ok-false");
    // DB-first context emit is skipped; only the post-relay call happens
    expect(editReportsContext).toHaveBeenCalledTimes(1);
  });

  it("catches and logs a cacheEventsToDatabase rejection without breaking the result", async () => {
    const cacheError = new Error("Cache write failed for reports");
    const cacheEventsToDatabase = jest.fn().mockRejectedValue(cacheError);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReports } = await import("../fetch-service");

    const product = makeProductEvent({
      id: "listing-reports-cache-reject",
      pubkey: "seller-reports-cache-reject",
      created_at: 1,
      tags: [["d", "item-reports-cache-reject"]],
      sig: "sig-product-reports-cache-reject",
    });
    const relayReport = makeReportEvent({
      id: "relay-report-cache-reject",
      pubkey: "reporter-cache-reject",
      created_at: 10,
      tags: [["p", "seller-reports-cache-reject", "spam"]],
      sig: "sig-relay-report-cache-reject",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayReport]),
    } as any;
    const editReportsContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { reportEvents } = await fetchReports(
      nostr,
      ["wss://relay.example"],
      [product] as any,
      editReportsContext
    );

    // Flush microtasks so the fire-and-forget .catch handler runs
    await Promise.resolve();

    expect(reportEvents.map((e) => e.id)).toContain(
      "relay-report-cache-reject"
    );
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([relayReport]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to cache reports to database:",
      cacheError
    );

    consoleErrorSpy.mockRestore();
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

  it("returns the preserved existing map without network access when pubkeyProfilesToFetch is empty", async () => {
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn(),
    }));

    const { fetchProfile } = await import("../fetch-service");

    global.fetch = jest.fn() as typeof global.fetch;
    const nostr = { fetch: jest.fn() } as any;
    const editProfileContext = jest.fn();

    const existingProfile = {
      pubkey,
      created_at: 100,
      content: { display_name: "Existing" },
      nip05Verified: true,
    };
    const existingProfileMap = new Map([[pubkey, existingProfile]]);

    const { profileMap } = await fetchProfile(
      nostr,
      ["wss://relay.example"],
      [],
      editProfileContext,
      existingProfileMap
    );

    expect(global.fetch).not.toHaveBeenCalled();
    expect(nostr.fetch).not.toHaveBeenCalled();
    expect(profileMap).toEqual(existingProfileMap);
    expect(editProfileContext).toHaveBeenCalledWith(
      expect.objectContaining({ size: 1 }),
      false
    );
  });

  it("prefers a newer relay profile over an older DB profile for the same pubkey", async () => {
    const verifyNip05Identifier = jest.fn().mockResolvedValue(false);
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(),
      deleteEvent: jest.fn(),
      verifyNip05Identifier,
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchProfile } = await import("../fetch-service");

    const dbProfileEvent = makeProfileEvent({
      id: "db-profile-relay-override",
      pubkey,
      created_at: 100,
      content: JSON.stringify({ display_name: "DB Name" }),
      sig: "sig-db-profile-relay-override",
    });
    const relayProfileEvent = makeProfileEvent({
      id: "relay-profile-newer",
      pubkey,
      created_at: 200,
      content: JSON.stringify({ display_name: "Relay Name" }),
      sig: "sig-relay-profile-newer",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(
        makeDbPayload([dbProfileEvent])
      ) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayProfileEvent]),
    } as any;
    const editProfileContext = jest.fn();

    const { profileMap } = await fetchProfile(
      nostr,
      ["wss://relay.example"],
      [pubkey],
      editProfileContext
    );

    expect(profileMap.get(pubkey)).toMatchObject({
      pubkey,
      created_at: 200,
      content: { display_name: "Relay Name" },
    });
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([relayProfileEvent]);
  });

  it("handles malformed profile JSON from DB and relay without throwing", async () => {
    const verifyNip05Identifier = jest.fn().mockResolvedValue(false);
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(),
      deleteEvent: jest.fn(),
      verifyNip05Identifier,
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchProfile } = await import("../fetch-service");

    const malformedDbEvent = makeProfileEvent({
      id: "db-malformed-profile",
      pubkey,
      created_at: 100,
      content: "not-valid-json{{{",
      sig: "sig-db-malformed-profile",
    });
    const malformedRelayEvent = makeProfileEvent({
      id: "relay-malformed-profile",
      pubkey,
      created_at: 200,
      content: "also-not-json",
      sig: "sig-relay-malformed-profile",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(
        makeDbPayload([malformedDbEvent])
      ) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([malformedRelayEvent]),
    } as any;
    const editProfileContext = jest.fn();

    const { profileMap } = await fetchProfile(
      nostr,
      ["wss://relay.example"],
      [pubkey],
      editProfileContext
    );

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(profileMap.get(pubkey)).toBeFalsy();

    consoleErrorSpy.mockRestore();
  });

  it("sets nip05Verified from DB verification and relay verification independently", async () => {
    const verifyNip05Identifier = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(),
      deleteEvent: jest.fn(),
      verifyNip05Identifier,
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchProfile } = await import("../fetch-service");

    const relayPubkey =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    const dbProfileEvent = makeProfileEvent({
      id: "db-nip05-success",
      pubkey,
      created_at: 100,
      content: JSON.stringify({ nip05: "alice@example.com" }),
      sig: "sig-db-nip05-success",
    });
    const relayProfileEvent = makeProfileEvent({
      id: "relay-nip05-fail",
      pubkey: relayPubkey,
      created_at: 200,
      content: JSON.stringify({ nip05: "bob@example.com" }),
      sig: "sig-relay-nip05-fail",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(
        makeDbPayload([dbProfileEvent])
      ) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayProfileEvent]),
    } as any;
    const editProfileContext = jest.fn();

    const { profileMap } = await fetchProfile(
      nostr,
      ["wss://relay.example"],
      [pubkey, relayPubkey],
      editProfileContext
    );

    expect(verifyNip05Identifier).toHaveBeenCalledTimes(2);
    expect(profileMap.get(pubkey)).toMatchObject({
      pubkey,
      nip05Verified: true,
    });
    expect(profileMap.get(relayPubkey)).toMatchObject({
      pubkey: relayPubkey,
      nip05Verified: false,
    });
  });

  it("preserves an existing profile that is newer than both the DB and relay versions", async () => {
    const verifyNip05Identifier = jest.fn().mockResolvedValue(false);
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(),
      deleteEvent: jest.fn(),
      verifyNip05Identifier,
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchProfile } = await import("../fetch-service");

    const existingProfile = {
      pubkey,
      created_at: 500,
      content: { display_name: "Existing Newest" },
      nip05Verified: true,
    };
    const olderDbEvent = makeProfileEvent({
      id: "db-older-than-existing",
      pubkey,
      created_at: 100,
      content: JSON.stringify({ display_name: "Old DB" }),
      sig: "sig-db-older-than-existing",
    });
    const olderRelayEvent = makeProfileEvent({
      id: "relay-older-than-existing",
      pubkey,
      created_at: 200,
      content: JSON.stringify({ display_name: "Old Relay" }),
      sig: "sig-relay-older-than-existing",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([olderDbEvent])) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([olderRelayEvent]),
    } as any;
    const editProfileContext = jest.fn();

    const { profileMap } = await fetchProfile(
      nostr,
      ["wss://relay.example"],
      [pubkey],
      editProfileContext,
      new Map([[pubkey, existingProfile]])
    );

    expect(profileMap.get(pubkey)).toMatchObject({
      pubkey,
      created_at: 500,
      content: { display_name: "Existing Newest" },
    });
  });

  it("caches only relay events that have id, sig, pubkey and are kind 0", async () => {
    const verifyNip05Identifier = jest.fn().mockResolvedValue(false);
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(),
      deleteEvent: jest.fn(),
      verifyNip05Identifier,
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchProfile } = await import("../fetch-service");

    const validProfile = makeProfileEvent({
      id: "relay-valid-kind0-cache",
      pubkey,
      created_at: 200,
      content: JSON.stringify({ display_name: "Valid" }),
      sig: "sig-valid-kind0-cache",
    });
    const missingId = makeProfileEvent({
      id: "",
      pubkey: "profile-cache-no-id",
      created_at: 201,
      content: JSON.stringify({ display_name: "No ID" }),
      sig: "sig-profile-cache-no-id",
    });
    const missingSig = makeProfileEvent({
      id: "profile-cache-no-sig",
      pubkey: "profile-cache-no-sig-pk",
      created_at: 202,
      content: JSON.stringify({ display_name: "No Sig" }),
      sig: "",
    });
    const wrongKind = makeBaseEvent({
      id: "profile-cache-wrong-kind",
      pubkey: "profile-cache-wrong-kind-pk",
      created_at: 203,
      kind: 1,
      content: "wrong kind",
      sig: "sig-profile-cache-wrong-kind",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValue([validProfile, missingId, missingSig, wrongKind]),
    } as any;
    const editProfileContext = jest.fn();

    await fetchProfile(
      nostr,
      ["wss://relay.example"],
      [pubkey],
      editProfileContext
    );

    expect(cacheEventsToDatabase).toHaveBeenCalledTimes(1);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([validProfile]);
  });

  it("catches and logs a DB fetch throw and still queries the relay", async () => {
    const verifyNip05Identifier = jest.fn().mockResolvedValue(false);
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(),
      deleteEvent: jest.fn(),
      verifyNip05Identifier,
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchProfile } = await import("../fetch-service");

    const relayProfileEvent = makeProfileEvent({
      id: "relay-after-db-throw",
      pubkey,
      created_at: 200,
      content: JSON.stringify({ display_name: "Relay After DB Throw" }),
      sig: "sig-relay-after-db-throw",
    });

    const dbError = new Error("DB connection failed");
    global.fetch = jest.fn().mockRejectedValue(dbError) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayProfileEvent]),
    } as any;
    const editProfileContext = jest.fn();

    const { profileMap } = await fetchProfile(
      nostr,
      ["wss://relay.example"],
      [pubkey],
      editProfileContext
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch profiles from database: ",
      dbError
    );
    expect(nostr.fetch).toHaveBeenCalledTimes(1);
    expect(profileMap.get(pubkey)).toMatchObject({
      pubkey,
      created_at: 200,
      content: { display_name: "Relay After DB Throw" },
    });

    consoleErrorSpy.mockRestore();
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
    const invalidWrongKindListing = makeBaseEvent({
      id: "relay-invalid-kind",
      pubkey: "seller-invalid-3",
      created_at: 230,
      kind: 0,
      tags: [],
      content: "",
      sig: "sig-invalid-kind",
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
          invalidWrongKindListing,
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
      expect.arrayContaining([
        invalidNoIdListing,
        invalidNoSigListing,
        invalidWrongKindListing,
      ])
    );
    expect(productEvents).toEqual([validRelayListing]);
    expect(productEvents).not.toContain(invalidNoIdListing);
    expect(productEvents).not.toContain(invalidNoSigListing);
    expect(productEvents).not.toContain(invalidWrongKindListing);
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

  it("paginates through multiple DB batches before querying relays", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchAllPosts } = await import("../fetch-service");

    const firstDbListing = makeProductEvent({
      id: "cached-batch-1",
      pubkey: "seller-a",
      created_at: 100,
      tags: [["d", "listing-a"]],
      content: "",
      sig: "sig-cached-batch-1",
    });
    const secondDbListing = makeProductEvent({
      id: "cached-batch-2",
      pubkey: "seller-b",
      created_at: 200,
      tags: [["d", "listing-b"]],
      content: "",
      sig: "sig-cached-batch-2",
    });
    const relayListing = makeProductEvent({
      id: "relay-listing",
      pubkey: "seller-c",
      created_at: 300,
      tags: [["d", "listing-c"]],
      content: "",
      sig: "sig-relay-listing",
    });

    const firstDbBatch = Array.from({ length: 500 }, (_, index) =>
      index === 0
        ? firstDbListing
        : makeProductEvent({
            id: `cached-batch-1-${index}`,
            pubkey: "seller-a",
            created_at: 100 + index,
            tags: [["d", `listing-a-${index}`]],
            content: "",
            sig: `sig-cached-batch-1-${index}`,
          })
    );
    const secondDbBatch = Array.from({ length: 500 }, (_, index) =>
      index === 0
        ? secondDbListing
        : makeProductEvent({
            id: `cached-batch-2-${index}`,
            pubkey: "seller-b",
            created_at: 200 + index,
            tags: [["d", `listing-b-${index}`]],
            content: "",
            sig: `sig-cached-batch-2-${index}`,
          })
    );

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => firstDbBatch,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => secondDbBatch,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      }) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayListing]),
    } as any;
    const editProductContext = jest.fn();

    const { productEvents, profileSetFromProducts } = await fetchAllPosts(
      nostr,
      ["wss://relay.example"],
      editProductContext
    );

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/db/fetch-products?limit=500&offset=0"
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/db/fetch-products?limit=500&offset=500"
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      "/api/db/fetch-products?limit=500&offset=1000"
    );
    expect(editProductContext).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([firstDbListing]),
      true
    );
    expect(editProductContext).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining([firstDbListing, secondDbListing]),
      true
    );
    expect(nostr.fetch).toHaveBeenCalledTimes(1);
    expect(editProductContext).toHaveBeenLastCalledWith(
      expect.arrayContaining([firstDbListing, secondDbListing, relayListing]),
      false
    );
    expect(productEvents).toEqual(
      expect.arrayContaining([firstDbListing, secondDbListing, relayListing])
    );
    expect(profileSetFromProducts).toEqual(
      new Set(["seller-a", "seller-b", "seller-c"])
    );
    expect(cacheEventsToDatabase).toHaveBeenCalledWith(
      expect.arrayContaining([relayListing])
    );
  });

  it("emits cached DB events to context before relay results arrive", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchAllPosts } = await import("../fetch-service");

    const cachedListing = makeProductEvent({
      id: "cached-listing",
      pubkey: "seller-cache",
      created_at: 100,
      tags: [["d", "listing-cache"]],
      content: "",
      sig: "sig-cached-listing",
    });
    const relayListing = makeProductEvent({
      id: "relay-listing",
      pubkey: "seller-relay",
      created_at: 200,
      tags: [["d", "listing-relay"]],
      content: "",
      sig: "sig-relay-listing",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [cachedListing],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      }) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayListing]),
    } as any;
    const editProductContext = jest.fn();

    await fetchAllPosts(nostr, ["wss://relay.example"], editProductContext);

    expect(editProductContext.mock.calls[0]).toEqual([[cachedListing], true]);
    expect(nostr.fetch).toHaveBeenCalledTimes(1);
    expect(editProductContext.mock.calls[1][1]).toBe(false);
    expect(editProductContext.mock.calls[1][0]).toEqual(
      expect.arrayContaining([cachedListing, relayListing])
    );
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
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([newerRelayListing]);
  });

  it("breaks the DB batch loop when response.ok is false and still queries the relay", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchAllPosts } = await import("../fetch-service");

    const relayListing = makeProductEvent({
      id: "relay-listing-ok-false",
      pubkey: "seller-ok-false",
      created_at: 100,
      tags: [["d", "listing-ok-false"]],
      content: "",
      sig: "sig-relay-ok-false",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false }) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayListing]),
    } as any;
    const editProductContext = jest.fn();

    const { productEvents } = await fetchAllPosts(
      nostr,
      ["wss://relay.example"],
      editProductContext
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(nostr.fetch).toHaveBeenCalledTimes(1);
    expect(productEvents).toEqual([relayListing]);
  });

  it("catches and logs a DB fetch throw and still queries the relay", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchAllPosts } = await import("../fetch-service");

    const relayListing = makeProductEvent({
      id: "relay-listing-db-throw",
      pubkey: "seller-db-throw",
      created_at: 100,
      tags: [["d", "listing-db-throw"]],
      content: "",
      sig: "sig-relay-db-throw",
    });

    const dbError = new Error("DB connection failed");
    global.fetch = jest.fn().mockRejectedValue(dbError) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayListing]),
    } as any;
    const editProductContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { productEvents } = await fetchAllPosts(
      nostr,
      ["wss://relay.example"],
      editProductContext
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch products batch from database:",
      dbError
    );
    expect(nostr.fetch).toHaveBeenCalledTimes(1);
    expect(productEvents).toEqual([relayListing]);

    consoleErrorSpy.mockRestore();
  });

  it("catches and logs a cacheEventsToDatabase rejection without breaking the result", async () => {
    const cacheError = new Error("Cache write failed");
    const cacheEventsToDatabase = jest.fn().mockRejectedValue(cacheError);

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchAllPosts } = await import("../fetch-service");

    const relayListing = makeProductEvent({
      id: "relay-listing-cache-reject",
      pubkey: "seller-cache-reject",
      created_at: 100,
      tags: [["d", "listing-cache-reject"]],
      content: "",
      sig: "sig-relay-cache-reject",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false }) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayListing]),
    } as any;
    const editProductContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { productEvents } = await fetchAllPosts(
      nostr,
      ["wss://relay.example"],
      editProductContext
    );

    // Flush microtasks so the fire-and-forget .catch handler runs
    await Promise.resolve();

    expect(productEvents).toEqual([relayListing]);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([relayListing]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to cache products to database:",
      cacheError
    );

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

  it("returns an empty chat map when userPubkey is absent", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchGiftWrappedChatsAndMessages } =
      await import("../fetch-service");

    global.fetch = jest.fn() as typeof global.fetch;
    const nostr = { fetch: jest.fn() };
    const editChatContext = jest.fn();

    const result = await fetchGiftWrappedChatsAndMessages(
      nostr as any,
      undefined,
      ["wss://relay.example"],
      editChatContext
      // no userPubkey
    );

    expect(result.profileSetFromChats).toEqual(new Set());
    expect(editChatContext).toHaveBeenCalledWith(new Map(), false);
    expect(nostr.fetch).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("signer-present path signs the cache request and calls the messages endpoint", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchGiftWrappedChatsAndMessages } =
      await import("../fetch-service");

    const userPubkey = "user-pubkey";
    const signedProof = {
      kind: 27235,
      id: "proof-id",
      sig: "proof-sig",
      pubkey: userPubkey,
      content: "",
      tags: [],
      created_at: 1000,
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) };
    const signer = {
      sign: jest.fn().mockResolvedValue(signedProof),
      decrypt: jest.fn(),
    };
    const editChatContext = jest.fn();

    await fetchGiftWrappedChatsAndMessages(
      nostr as any,
      signer as any,
      ["wss://relay.example"],
      editChatContext,
      userPubkey
    );

    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 27235 })
    );
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/db/fetch-messages?pubkey=${userPubkey}`,
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-signed-event": JSON.stringify(signedProof),
        }),
      })
    );
  });

  it("skips an event when the outer decrypt returns a falsy sealEventString", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchGiftWrappedChatsAndMessages } =
      await import("../fetch-service");

    const userPubkey = "user-pubkey";
    const wrapEvent = {
      id: "wrap-1",
      kind: 1059,
      pubkey: "eph",
      content: "enc-seal",
      created_at: 1000,
      sig: "sig",
      tags: [["p", userPubkey]],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([wrapEvent]) };
    const signer = {
      sign: jest.fn().mockResolvedValue({
        kind: 27235,
        id: "proof",
        sig: "s",
        pubkey: userPubkey,
        content: "",
        tags: [],
        created_at: 0,
      }),
      decrypt: jest.fn().mockResolvedValue(""), // falsy → continue
    };
    const editChatContext = jest.fn();

    const result = await fetchGiftWrappedChatsAndMessages(
      nostr as any,
      signer as any,
      ["wss://relay.example"],
      editChatContext,
      userPubkey
    );

    expect(result.profileSetFromChats).toEqual(new Set());
    expect(editChatContext).toHaveBeenCalledWith(new Map(), false);
  });

  it("skips an event when the inner decrypt returns a falsy messageEventString", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchGiftWrappedChatsAndMessages } =
      await import("../fetch-service");

    const userPubkey = "user-pubkey";
    const senderPubkey = "sender-pubkey";
    const sealEvent = {
      kind: 13,
      pubkey: senderPubkey,
      content: "enc-msg",
      created_at: 999,
      tags: [],
    };
    const wrapEvent = {
      id: "wrap-1",
      kind: 1059,
      pubkey: "eph",
      content: "enc-seal",
      created_at: 1000,
      sig: "sig",
      tags: [["p", userPubkey]],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([wrapEvent]) };
    const signer = {
      sign: jest.fn().mockResolvedValue({
        kind: 27235,
        id: "proof",
        sig: "s",
        pubkey: userPubkey,
        content: "",
        tags: [],
        created_at: 0,
      }),
      decrypt: jest
        .fn()
        .mockResolvedValueOnce(JSON.stringify(sealEvent)) // outer → ok
        .mockResolvedValueOnce(""), // inner → falsy → continue
    };
    const editChatContext = jest.fn();

    const result = await fetchGiftWrappedChatsAndMessages(
      nostr as any,
      signer as any,
      ["wss://relay.example"],
      editChatContext,
      userPubkey
    );

    expect(result.profileSetFromChats).toEqual(new Set());
    expect(editChatContext).toHaveBeenCalledWith(new Map(), false);
  });

  it("decrypts seal and message events and adds the message to the chat map", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchGiftWrappedChatsAndMessages } =
      await import("../fetch-service");

    const userPubkey = "user-pubkey";
    const senderPubkey = "sender-pubkey";
    const messageEvent = {
      kind: 14,
      pubkey: senderPubkey,
      content: "Hello!",
      created_at: 1000,
      tags: [
        ["p", userPubkey],
        ["subject", "listing-inquiry"],
      ],
    };
    const sealEvent = {
      kind: 13,
      pubkey: senderPubkey,
      content: "enc-msg",
      created_at: 999,
      tags: [],
    };
    const wrapEvent = {
      id: "wrap-1",
      kind: 1059,
      pubkey: "eph",
      content: "enc-seal",
      created_at: 1000,
      sig: "sig",
      tags: [["p", userPubkey]],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([wrapEvent]) };
    const signer = {
      sign: jest.fn().mockResolvedValue({
        kind: 27235,
        id: "proof",
        sig: "s",
        pubkey: userPubkey,
        content: "",
        tags: [],
        created_at: 0,
      }),
      decrypt: jest
        .fn()
        .mockResolvedValueOnce(JSON.stringify(sealEvent))
        .mockResolvedValueOnce(JSON.stringify(messageEvent)),
    };
    const editChatContext = jest.fn();

    const result = await fetchGiftWrappedChatsAndMessages(
      nostr as any,
      signer as any,
      ["wss://relay.example"],
      editChatContext,
      userPubkey
    );

    expect(result.profileSetFromChats).toContain(senderPubkey);
    const [chatMap] = editChatContext.mock.calls[0];
    expect(chatMap.has(senderPubkey)).toBe(true);
    expect(chatMap.get(senderPubkey)[0].content).toBe("Hello!");
  });

  it("filters out events whose subject is not in the allowed set", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchGiftWrappedChatsAndMessages } =
      await import("../fetch-service");

    const userPubkey = "user-pubkey";
    const senderPubkey = "sender-pubkey";

    const makeWrap = (id: string, subject: string) => {
      const msg = {
        kind: 14,
        pubkey: senderPubkey,
        content: "msg",
        created_at: 1000,
        tags: [
          ["p", userPubkey],
          ["subject", subject],
        ],
      };
      const seal = {
        kind: 13,
        pubkey: senderPubkey,
        content: "enc",
        created_at: 999,
        tags: [],
      };
      const wrap = {
        id,
        kind: 1059,
        pubkey: "eph",
        content: "enc-seal",
        created_at: 1000,
        sig: "sig",
        tags: [["p", userPubkey]],
      };
      return { wrap, seal, msg };
    };

    const allowed = makeWrap("wrap-allowed", "listing-inquiry");
    const blocked = makeWrap("wrap-blocked", "unknown-subject");

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([allowed.wrap, blocked.wrap]),
    };
    const signer = {
      sign: jest.fn().mockResolvedValue({
        kind: 27235,
        id: "proof",
        sig: "s",
        pubkey: userPubkey,
        content: "",
        tags: [],
        created_at: 0,
      }),
      decrypt: jest
        .fn()
        .mockResolvedValueOnce(JSON.stringify(allowed.seal))
        .mockResolvedValueOnce(JSON.stringify(allowed.msg))
        .mockResolvedValueOnce(JSON.stringify(blocked.seal))
        .mockResolvedValueOnce(JSON.stringify(blocked.msg)),
    };
    const editChatContext = jest.fn();

    const result = await fetchGiftWrappedChatsAndMessages(
      nostr as any,
      signer as any,
      ["wss://relay.example"],
      editChatContext,
      userPubkey
    );

    expect(result.profileSetFromChats).toEqual(new Set([senderPubkey]));
    const [chatMap] = editChatContext.mock.calls[0];
    expect(chatMap.get(senderPubkey)).toHaveLength(1);
  });

  it("keys an incoming message on senderPubkey when sender differs from userPubkey", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchGiftWrappedChatsAndMessages } =
      await import("../fetch-service");

    const userPubkey = "user-pubkey";
    const senderPubkey = "other-person-pubkey";
    const messageEvent = {
      kind: 14,
      pubkey: senderPubkey, // sender ≠ userPubkey → incoming
      content: "Hi from them",
      created_at: 1000,
      tags: [
        ["p", userPubkey],
        ["subject", "listing-inquiry"],
      ],
    };
    const sealEvent = {
      kind: 13,
      pubkey: senderPubkey,
      content: "enc-msg",
      created_at: 999,
      tags: [],
    };
    const wrapEvent = {
      id: "wrap-1",
      kind: 1059,
      pubkey: "eph",
      content: "enc-seal",
      created_at: 1000,
      sig: "sig",
      tags: [["p", userPubkey]],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([wrapEvent]) };
    const signer = {
      sign: jest.fn().mockResolvedValue({
        kind: 27235,
        id: "proof",
        sig: "s",
        pubkey: userPubkey,
        content: "",
        tags: [],
        created_at: 0,
      }),
      decrypt: jest
        .fn()
        .mockResolvedValueOnce(JSON.stringify(sealEvent))
        .mockResolvedValueOnce(JSON.stringify(messageEvent)),
    };
    const editChatContext = jest.fn();

    await fetchGiftWrappedChatsAndMessages(
      nostr as any,
      signer as any,
      ["wss://relay.example"],
      editChatContext,
      userPubkey
    );

    const [chatMap] = editChatContext.mock.calls[0];
    expect(chatMap.has(senderPubkey)).toBe(true);
    expect(chatMap.has(userPubkey)).toBe(false);
  });

  it("keys an outgoing message on recipientPubkey when sender equals userPubkey", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchGiftWrappedChatsAndMessages } =
      await import("../fetch-service");

    const userPubkey = "user-pubkey";
    const recipientPubkey = "recipient-pubkey";
    const messageEvent = {
      kind: 14,
      pubkey: userPubkey, // sender = userPubkey → outgoing
      content: "Hi from me",
      created_at: 1000,
      tags: [
        ["p", recipientPubkey],
        ["subject", "order-payment"],
      ],
    };
    const sealEvent = {
      kind: 13,
      pubkey: userPubkey,
      content: "enc-msg",
      created_at: 999,
      tags: [],
    };
    const wrapEvent = {
      id: "wrap-1",
      kind: 1059,
      pubkey: "eph",
      content: "enc-seal",
      created_at: 1000,
      sig: "sig",
      tags: [["p", userPubkey]],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([wrapEvent]) };
    const signer = {
      sign: jest.fn().mockResolvedValue({
        kind: 27235,
        id: "proof",
        sig: "s",
        pubkey: userPubkey,
        content: "",
        tags: [],
        created_at: 0,
      }),
      decrypt: jest
        .fn()
        .mockResolvedValueOnce(JSON.stringify(sealEvent))
        .mockResolvedValueOnce(JSON.stringify(messageEvent)),
    };
    const editChatContext = jest.fn();

    await fetchGiftWrappedChatsAndMessages(
      nostr as any,
      signer as any,
      ["wss://relay.example"],
      editChatContext,
      userPubkey
    );

    const [chatMap] = editChatContext.mock.calls[0];
    expect(chatMap.has(recipientPubkey)).toBe(true);
    expect(chatMap.has(userPubkey)).toBe(false);
  });

  it("uses the cached DB read status instead of defaulting to false", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchGiftWrappedChatsAndMessages } =
      await import("../fetch-service");

    const userPubkey = "user-pubkey";
    const senderPubkey = "sender-pubkey";
    const wrapId = "wrap-1";

    const dbMessage = {
      id: wrapId,
      kind: 1059,
      pubkey: "eph",
      content: "enc",
      created_at: 1000,
      sig: "sig",
      tags: [],
      is_read: true, // ← already read in DB
    };
    const wrapEvent = {
      id: wrapId,
      kind: 1059,
      pubkey: "eph",
      content: "enc-seal",
      created_at: 1000,
      sig: "sig",
      tags: [["p", userPubkey]],
    };
    const sealEvent = {
      kind: 13,
      pubkey: senderPubkey,
      content: "enc-msg",
      created_at: 999,
      tags: [],
    };
    const messageEvent = {
      kind: 14,
      pubkey: senderPubkey,
      content: "Hello!",
      created_at: 1000,
      tags: [
        ["p", userPubkey],
        ["subject", "listing-inquiry"],
      ],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [dbMessage],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([wrapEvent]) };
    const signer = {
      sign: jest.fn().mockResolvedValue({
        kind: 27235,
        id: "proof",
        sig: "s",
        pubkey: userPubkey,
        content: "",
        tags: [],
        created_at: 0,
      }),
      decrypt: jest
        .fn()
        .mockResolvedValueOnce(JSON.stringify(sealEvent))
        .mockResolvedValueOnce(JSON.stringify(messageEvent)),
    };
    const editChatContext = jest.fn();

    await fetchGiftWrappedChatsAndMessages(
      nostr as any,
      signer as any,
      ["wss://relay.example"],
      editChatContext,
      userPubkey
    );

    const [chatMap] = editChatContext.mock.calls[0];
    const messages = chatMap.get(senderPubkey);
    expect(messages[0].read).toBe(true);
    expect(messages[0].wrappedEventId).toBe(wrapId);
  });

  it("caches only 1059 events that have id, sig, and pubkey", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchGiftWrappedChatsAndMessages } =
      await import("../fetch-service");

    const userPubkey = "user-pubkey";
    const validEvent = {
      id: "wrap-valid",
      kind: 1059,
      pubkey: "eph",
      content: "enc",
      created_at: 1000,
      sig: "sig",
      tags: [["p", userPubkey]],
    };
    const invalidEvent = {
      id: "wrap-invalid",
      kind: 1059,
      pubkey: "eph",
      content: "enc",
      created_at: 1000,
      sig: "", // empty sig → invalid
      tags: [["p", userPubkey]],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([validEvent, invalidEvent]),
    };
    const signer = {
      sign: jest.fn().mockResolvedValue({
        kind: 27235,
        id: "proof",
        sig: "s",
        pubkey: userPubkey,
        content: "",
        tags: [],
        created_at: 0,
      }),
      decrypt: jest.fn().mockResolvedValue(""), // all events skipped in loop
    };
    const editChatContext = jest.fn();

    await fetchGiftWrappedChatsAndMessages(
      nostr as any,
      signer as any,
      ["wss://relay.example"],
      editChatContext,
      userPubkey
    );

    expect(cacheEventsToDatabase).toHaveBeenCalledWith([validEvent]);
  });

  it("logs console.error when the DB messages endpoint returns a non-ok response", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchGiftWrappedChatsAndMessages } =
      await import("../fetch-service");

    const userPubkey = "user-pubkey";
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) };
    const signer = {
      sign: jest.fn().mockResolvedValue({
        kind: 27235,
        id: "proof",
        sig: "s",
        pubkey: userPubkey,
        content: "",
        tags: [],
        created_at: 0,
      }),
      decrypt: jest.fn(),
    };
    const editChatContext = jest.fn();

    await fetchGiftWrappedChatsAndMessages(
      nostr as any,
      signer as any,
      ["wss://relay.example"],
      editChatContext,
      userPubkey
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to fetch messages from database")
    );
    consoleErrorSpy.mockRestore();
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

describe("fetchShopProfile", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("exits early and emits an empty map when pubkeyShopProfileToFetch is empty", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchShopProfile } = await import("../fetch-service");

    global.fetch = jest.fn() as typeof global.fetch;
    const nostr = { fetch: jest.fn() } as any;
    const editShopContext = jest.fn();

    const { shopProfileMap } = await fetchShopProfile(
      nostr,
      ["wss://relay.example"],
      [],
      editShopContext
    );

    expect(global.fetch).not.toHaveBeenCalled();
    expect(nostr.fetch).not.toHaveBeenCalled();
    expect(shopProfileMap).toEqual(new Map());
    expect(editShopContext).toHaveBeenCalledWith(new Map(), false);
  });

  it("hydrates shop profiles from DB before querying relays", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchShopProfile } = await import("../fetch-service");

    const pubkey = "seller-shop-db";
    const shopEvent = makeShopEvent({
      id: "shop-event-db",
      pubkey,
      created_at: 100,
      content: JSON.stringify({ name: "DB Shop" }),
      sig: "sig-shop-db",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([shopEvent])) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) } as any;
    const editShopContext = jest.fn();

    const { shopProfileMap } = await fetchShopProfile(
      nostr,
      ["wss://relay.example"],
      [pubkey],
      editShopContext
    );

    expect(global.fetch).toHaveBeenCalledWith("/api/db/fetch-profiles");
    expect(shopProfileMap.get(pubkey)).toMatchObject({
      pubkey,
      created_at: 100,
      content: { name: "DB Shop" },
    });
    expect(cacheEventsToDatabase).not.toHaveBeenCalled();
  });

  it("relay results overwrite DB results for the same pubkey", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchShopProfile } = await import("../fetch-service");

    const pubkey = "seller-shop-merge";
    const dbShopEvent = makeShopEvent({
      id: "shop-db-old",
      pubkey,
      created_at: 100,
      content: JSON.stringify({ name: "Old DB Shop" }),
      sig: "sig-shop-db-old",
    });
    const relayShopEvent = makeShopEvent({
      id: "shop-relay-new",
      pubkey,
      created_at: 200,
      content: JSON.stringify({ name: "New Relay Shop" }),
      sig: "sig-shop-relay-new",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([dbShopEvent])) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayShopEvent]),
    } as any;
    const editShopContext = jest.fn();

    const { shopProfileMap } = await fetchShopProfile(
      nostr,
      ["wss://relay.example"],
      [pubkey],
      editShopContext
    );

    expect(shopProfileMap.get(pubkey)).toMatchObject({
      pubkey,
      created_at: 200,
      content: { name: "New Relay Shop" },
    });
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([relayShopEvent]);
  });

  it("ignores malformed JSON in DB and relay shop profiles without throwing", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchShopProfile } = await import("../fetch-service");

    const pubkey1 = "seller-shop-bad-db";
    const pubkey2 = "seller-shop-bad-relay";

    const malformedDbEvent = makeShopEvent({
      id: "shop-bad-db",
      pubkey: pubkey1,
      created_at: 100,
      content: "not-valid-json{{{",
      sig: "sig-shop-bad-db",
    });
    const malformedRelayEvent = makeShopEvent({
      id: "shop-bad-relay",
      pubkey: pubkey2,
      created_at: 200,
      content: "also-not-json",
      sig: "sig-shop-bad-relay",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(
        makeDbPayload([malformedDbEvent])
      ) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([malformedRelayEvent]),
    } as any;
    const editShopContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { shopProfileMap } = await fetchShopProfile(
      nostr,
      ["wss://relay.example"],
      [pubkey1, pubkey2],
      editShopContext
    );

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(shopProfileMap.get(pubkey1)).toBeFalsy();
    expect(shopProfileMap.get(pubkey2)).toBeFalsy();

    consoleErrorSpy.mockRestore();
  });

  it("maps multiple pubkeys independently without cross-contamination", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchShopProfile } = await import("../fetch-service");

    const pubkeyA = "seller-shop-multi-a";
    const pubkeyB = "seller-shop-multi-b";
    const shopEventA = makeShopEvent({
      id: "shop-multi-a",
      pubkey: pubkeyA,
      created_at: 100,
      content: JSON.stringify({ name: "Shop A" }),
      sig: "sig-shop-multi-a",
    });
    const shopEventB = makeShopEvent({
      id: "shop-multi-b",
      pubkey: pubkeyB,
      created_at: 200,
      content: JSON.stringify({ name: "Shop B" }),
      sig: "sig-shop-multi-b",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([shopEventA, shopEventB]),
    } as any;
    const editShopContext = jest.fn();

    const { shopProfileMap } = await fetchShopProfile(
      nostr,
      ["wss://relay.example"],
      [pubkeyA, pubkeyB],
      editShopContext
    );

    expect(shopProfileMap.get(pubkeyA)).toMatchObject({
      pubkey: pubkeyA,
      content: { name: "Shop A" },
    });
    expect(shopProfileMap.get(pubkeyB)).toMatchObject({
      pubkey: pubkeyB,
      content: { name: "Shop B" },
    });
  });

  it("calls editShopContext with DB-only data when relay returns no events", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchShopProfile } = await import("../fetch-service");

    const pubkey = "seller-shop-db-only";
    const shopEvent = makeShopEvent({
      id: "shop-db-only",
      pubkey,
      created_at: 100,
      content: JSON.stringify({ name: "DB-Only Shop" }),
      sig: "sig-shop-db-only",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([shopEvent])) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) } as any;
    const editShopContext = jest.fn();

    await fetchShopProfile(
      nostr,
      ["wss://relay.example"],
      [pubkey],
      editShopContext
    );

    // First call after DB load, second call after relay returns empty
    expect(editShopContext).toHaveBeenCalledTimes(2);
    const firstCallArg = editShopContext.mock.calls[0][0] as Map<string, any>;
    expect(firstCallArg.get(pubkey)).toMatchObject({
      pubkey,
      content: { name: "DB-Only Shop" },
    });
    expect(cacheEventsToDatabase).not.toHaveBeenCalled();
  });

  it("caches only relay events with id, sig, pubkey, and kind 30019", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchShopProfile } = await import("../fetch-service");

    const pubkey = "seller-shop-cache-valid";
    const validShopEvent = makeShopEvent({
      id: "shop-valid-cache",
      pubkey,
      created_at: 200,
      content: JSON.stringify({ name: "Valid Shop" }),
      sig: "sig-shop-valid-cache",
    });
    const missingId = makeShopEvent({
      id: "",
      pubkey: "shop-cache-no-id",
      created_at: 201,
      content: JSON.stringify({ name: "No ID" }),
      sig: "sig-shop-no-id",
    });
    const missingSig = makeShopEvent({
      id: "shop-cache-no-sig",
      pubkey: "shop-cache-no-sig-pk",
      created_at: 202,
      content: JSON.stringify({ name: "No Sig" }),
      sig: "",
    });
    const wrongKind = makeBaseEvent({
      id: "shop-cache-wrong-kind",
      pubkey: "shop-cache-wrong-kind-pk",
      created_at: 203,
      kind: 0,
      content: "wrong kind",
      sig: "sig-shop-wrong-kind",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValue([validShopEvent, missingId, missingSig, wrongKind]),
    } as any;
    const editShopContext = jest.fn();

    await fetchShopProfile(
      nostr,
      ["wss://relay.example"],
      [pubkey],
      editShopContext
    );

    expect(cacheEventsToDatabase).toHaveBeenCalledTimes(1);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([validShopEvent]);
  });
});

describe("fetchCart", () => {
  const userPubkey =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("resolves with an empty cartList immediately when no signer is provided", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn(),
    }));

    const { fetchCart } = await import("../fetch-service");

    const nostr = { fetch: jest.fn() } as any;
    const editCartContext = jest.fn();

    const { cartList } = await fetchCart(
      nostr,
      undefined,
      ["wss://relay.example"],
      editCartContext,
      []
    );

    expect(cartList).toEqual([]);
    expect(nostr.fetch).not.toHaveBeenCalled();
    expect(editCartContext).not.toHaveBeenCalled();
  });

  it("decrypts relay cart events and parses matching products into cartList", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn(),
    }));

    const { fetchCart } = await import("../fetch-service");

    const product = makeProductEvent({
      id: "prod-cart-1",
      pubkey: "seller-cart-1",
      created_at: 100,
      tags: [
        ["d", "item-cart-1"],
        ["title", "Coffee Beans"],
      ],
      content: "",
      sig: "sig-prod-cart-1",
    });

    const cartContent = JSON.stringify([
      [null, ["30402", "wss://relay.example", "item-cart-1"]],
    ]);

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn().mockResolvedValue(cartContent),
    } as any;

    const cartEvent = makeBaseEvent({
      id: "cart-event-1",
      pubkey: userPubkey,
      created_at: 200,
      kind: 30405,
      tags: [],
      content: "encrypted-cart",
      sig: "sig-cart-event-1",
    });

    const nostr = { fetch: jest.fn().mockResolvedValue([cartEvent]) } as any;
    const editCartContext = jest.fn();

    const { cartList } = await fetchCart(
      nostr,
      signer,
      ["wss://relay.example"],
      editCartContext,
      [product]
    );

    expect(nostr.fetch).toHaveBeenCalledWith(
      [{ kinds: [30405], authors: [userPubkey] }],
      {},
      ["wss://relay.example"]
    );
    expect(signer.decrypt).toHaveBeenCalledWith(userPubkey, "encrypted-cart");
    expect(cartList).toHaveLength(1);
    expect(cartList[0]).toMatchObject({
      id: "prod-cart-1",
      selectedQuantity: 1,
    });
  });

  it("aggregates selectedQuantity for duplicate products in the cart", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn(),
    }));

    const { fetchCart } = await import("../fetch-service");

    const product = makeProductEvent({
      id: "prod-dup-1",
      pubkey: "seller-dup-1",
      created_at: 100,
      tags: [["d", "item-dup-1"]],
      content: "",
      sig: "sig-prod-dup-1",
    });

    const cartContent = JSON.stringify([
      [null, ["30402", "wss://relay.example", "item-dup-1"]],
      [null, ["30402", "wss://relay.example", "item-dup-1"]],
      [null, ["30402", "wss://relay.example", "item-dup-1"]],
    ]);

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn().mockResolvedValue(cartContent),
    } as any;

    const cartEvent = makeBaseEvent({
      id: "cart-event-dup",
      pubkey: userPubkey,
      created_at: 200,
      kind: 30405,
      tags: [],
      content: "encrypted-dup-cart",
      sig: "sig-cart-event-dup",
    });

    const nostr = { fetch: jest.fn().mockResolvedValue([cartEvent]) } as any;
    const editCartContext = jest.fn();

    const { cartList } = await fetchCart(
      nostr,
      signer,
      ["wss://relay.example"],
      editCartContext,
      [product]
    );

    expect(cartList).toHaveLength(1);
    expect(cartList[0]).toMatchObject({
      id: "prod-dup-1",
      selectedQuantity: 3,
    });
  });

  it("skips malformed cart payloads and logs an error without throwing", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn(),
    }));

    const { fetchCart } = await import("../fetch-service");

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn().mockResolvedValue("not-valid-json{{{"),
    } as any;

    const cartEvent = makeBaseEvent({
      id: "cart-event-bad",
      pubkey: userPubkey,
      created_at: 200,
      kind: 30405,
      tags: [],
      content: "encrypted-bad-cart",
      sig: "sig-cart-event-bad",
    });

    const nostr = { fetch: jest.fn().mockResolvedValue([cartEvent]) } as any;
    const editCartContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { cartList } = await fetchCart(
      nostr,
      signer,
      ["wss://relay.example"],
      editCartContext,
      []
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to parse cart: ",
      expect.any(Error)
    );
    expect(cartList).toEqual([]);

    consoleErrorSpy.mockRestore();
  });

  it("skips address entries whose kind is not 30402", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn(),
    }));

    const { fetchCart } = await import("../fetch-service");

    const product = makeProductEvent({
      id: "prod-wrong-kind",
      pubkey: "seller-wrong-kind",
      created_at: 100,
      tags: [["d", "item-wrong-kind"]],
      content: "",
      sig: "sig-prod-wrong-kind",
    });

    const cartContent = JSON.stringify([
      [null, ["30401", "wss://relay.example", "item-wrong-kind"]],
    ]);

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn().mockResolvedValue(cartContent),
    } as any;

    const cartEvent = makeBaseEvent({
      id: "cart-event-wrong-kind",
      pubkey: userPubkey,
      created_at: 200,
      kind: 30405,
      tags: [],
      content: "encrypted-wrong-kind-cart",
      sig: "sig-cart-event-wrong-kind",
    });

    const nostr = { fetch: jest.fn().mockResolvedValue([cartEvent]) } as any;
    const editCartContext = jest.fn();

    const { cartList } = await fetchCart(
      nostr,
      signer,
      ["wss://relay.example"],
      editCartContext,
      [product]
    );

    expect(cartList).toEqual([]);
  });

  it("skips address entries whose d-tag does not match any loaded product", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn(),
    }));

    const { fetchCart } = await import("../fetch-service");

    const product = makeProductEvent({
      id: "prod-no-match",
      pubkey: "seller-no-match",
      created_at: 100,
      tags: [["d", "item-known"]],
      content: "",
      sig: "sig-prod-no-match",
    });

    const cartContent = JSON.stringify([
      [null, ["30402", "wss://relay.example", "item-unknown"]],
    ]);

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn().mockResolvedValue(cartContent),
    } as any;

    const cartEvent = makeBaseEvent({
      id: "cart-event-no-match",
      pubkey: userPubkey,
      created_at: 200,
      kind: 30405,
      tags: [],
      content: "encrypted-no-match-cart",
      sig: "sig-cart-event-no-match",
    });

    const nostr = { fetch: jest.fn().mockResolvedValue([cartEvent]) } as any;
    const editCartContext = jest.fn();

    const { cartList } = await fetchCart(
      nostr,
      signer,
      ["wss://relay.example"],
      editCartContext,
      [product]
    );

    expect(cartList).toEqual([]);
  });

  it("calls editCartContext with the parsed address array and isLoading false", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn(),
    }));

    const { fetchCart } = await import("../fetch-service");

    const product = makeProductEvent({
      id: "prod-ctx",
      pubkey: "seller-ctx",
      created_at: 100,
      tags: [["d", "item-ctx"]],
      content: "",
      sig: "sig-prod-ctx",
    });

    const addressArray = [[null, ["30402", "wss://relay.example", "item-ctx"]]];
    const cartContent = JSON.stringify(addressArray);

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn().mockResolvedValue(cartContent),
    } as any;

    const cartEvent = makeBaseEvent({
      id: "cart-event-ctx",
      pubkey: userPubkey,
      created_at: 200,
      kind: 30405,
      tags: [],
      content: "encrypted-ctx-cart",
      sig: "sig-cart-event-ctx",
    });

    const nostr = { fetch: jest.fn().mockResolvedValue([cartEvent]) } as any;
    const editCartContext = jest.fn();

    await fetchCart(nostr, signer, ["wss://relay.example"], editCartContext, [
      product,
    ]);

    expect(editCartContext).toHaveBeenCalledTimes(1);
    expect(editCartContext).toHaveBeenCalledWith(addressArray, false);
  });
});

describe("fetchPendingPosts", () => {
  const makeCommunity = (overrides: Record<string, any> = {}): any => ({
    id: "community-event-id",
    kind: 34550,
    pubkey: "community-pubkey",
    createdAt: 1,
    d: "test-community",
    name: "Test Community",
    description: "",
    image: "",
    moderators: ["moderator-1"],
    relays: {
      approvals: [],
      requests: ["wss://relay.example"],
      metadata: [],
      all: ["wss://relay.example"],
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("resolves with an empty array when no request relays are available", async () => {
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ relays: [] })),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn(),
    }));

    const { fetchPendingPosts } = await import("../fetch-service");

    const emptyRelaysCommunity = makeCommunity({
      relays: { approvals: [], requests: [], metadata: [], all: [] },
    });

    const nostr = { fetch: jest.fn() } as any;

    const result = await fetchPendingPosts(nostr, emptyRelaysCommunity);

    expect(result).toEqual([]);
    expect(nostr.fetch).not.toHaveBeenCalled();
  });

  it("excludes posts that already appear in approved community posts", async () => {
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ relays: [] })),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn(),
    }));

    const { fetchPendingPosts } = await import("../fetch-service");

    const communityAddress = "34550:community-pubkey:test-community";
    const community = makeCommunity();

    const postApproved = makeBaseEvent({
      id: "post-approved-id",
      pubkey: "author-1",
      created_at: 100,
      kind: 1111,
      tags: [["a", communityAddress]],
      content: "approved post",
      sig: "sig-approved",
    });
    const postPending = makeBaseEvent({
      id: "post-pending-id",
      pubkey: "author-2",
      created_at: 200,
      kind: 1111,
      tags: [["a", communityAddress]],
      content: "pending post",
      sig: "sig-pending",
    });
    const approvalEvent = makeBaseEvent({
      id: "approval-event-id",
      pubkey: "moderator-1",
      created_at: 150,
      kind: 4550,
      tags: [
        ["a", communityAddress],
        ["e", "post-approved-id"],
      ],
      content: "",
      sig: "sig-approval",
    });

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([approvalEvent]) // fetchCommunityPosts: approval fetch
        .mockResolvedValueOnce([postApproved]) // fetchCommunityPosts: post fetch by ids
        .mockResolvedValueOnce([postApproved, postPending]), // fetchPendingPosts: request fetch
    } as any;

    const result = await fetchPendingPosts(nostr, community);

    expect(result.map((e) => e.id)).toContain("post-pending-id");
    expect(result.map((e) => e.id)).not.toContain("post-approved-id");
  });

  it("returns pending posts sorted newest-first by created_at", async () => {
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ relays: [] })),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn(),
    }));

    const { fetchPendingPosts } = await import("../fetch-service");

    const communityAddress = "34550:community-pubkey:test-community";
    const community = makeCommunity();

    const postOld = makeBaseEvent({
      id: "post-old",
      pubkey: "author-1",
      created_at: 100,
      kind: 1111,
      tags: [["a", communityAddress]],
      content: "",
      sig: "sig-old",
    });
    const postMid = makeBaseEvent({
      id: "post-mid",
      pubkey: "author-2",
      created_at: 200,
      kind: 1111,
      tags: [["a", communityAddress]],
      content: "",
      sig: "sig-mid",
    });
    const postNew = makeBaseEvent({
      id: "post-new",
      pubkey: "author-3",
      created_at: 300,
      kind: 1111,
      tags: [["a", communityAddress]],
      content: "",
      sig: "sig-new",
    });

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([]) // fetchCommunityPosts: no approvals → exits early
        .mockResolvedValueOnce([postOld, postNew, postMid]), // fetchPendingPosts: request fetch
    } as any;

    const result = await fetchPendingPosts(nostr, community);

    expect(result.map((e) => e.id)).toEqual([
      "post-new",
      "post-mid",
      "post-old",
    ]);
  });
});
