import { NostrEvent, NostrManager } from "../nostr-manager";
import {
  buildNip50ProductSearchFilters,
  DEFAULT_NIP50_SEARCH_RELAYS,
  dedupeProductEvents,
  fetchNip50ProductSearch,
  getProductEventKey,
  isHexString,
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

describe("getProductEventKey", () => {
  it("builds the correct key for every input shape", () => {
    expect(
      getProductEventKey(
        makeBaseEvent({
          kind: 30402,
          id: "e1",
          pubkey: "pk1",
          tags: [["d", "listing-slug"]],
        }) as any
      )
    ).toBe("30402:pk1:listing-slug");
    expect(
      getProductEventKey(
        makeBaseEvent({ kind: 30402, id: "e2", pubkey: "pk2", tags: [] }) as any
      )
    ).toBe("30402:e2");
    expect(
      getProductEventKey(
        makeBaseEvent({ kind: 1, id: "e3", pubkey: "pk3", tags: [] }) as any
      )
    ).toBe("1:e3");
  });
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
  it("returns true for a valid 64-char hex pubkey and false for short or non-hex strings", () => {
    expect(
      isHexString(
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      )
    ).toBe(true);
    expect(isHexString("abc123")).toBe(false);
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
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});
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
    expect(consoleWarnSpy).toHaveBeenCalledTimes(
      DEFAULT_NIP50_SEARCH_RELAYS.length - 1
    );
    consoleWarnSpy.mockRestore();
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

  it("rejects when nostr.fetch throws during the relay report fetch (line 501)", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchReports } = await import("../fetch-service");

    const fetchError = new Error("reports relay down");
    const aProduct = makeProductEvent({
      id: "prod-501",
      pubkey: "seller-501",
      created_at: 1,
      tags: [["d", "item-501"]],
      sig: "sig-501",
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockRejectedValue(fetchError) } as any;

    await expect(
      fetchReports(nostr, ["wss://relay.example"], [aProduct] as any, jest.fn())
    ).rejects.toThrow("reports relay down");
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
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
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

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      `Skipping invalid profile JSON from DB: ${pubkey}`
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      `Skipping invalid profile JSON for pubkey: ${pubkey}`
    );
    expect(profileMap.get(pubkey)).toBeFalsy();

    consoleWarnSpy.mockRestore();
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

  it("skips a relay profile event whose content is a non-string (line 253 parseJsonSafely)", async () => {
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn().mockResolvedValue(false),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchProfile } = await import("../fetch-service");

    const nullContentEvent = makeProfileEvent({
      id: "null-content-profile",
      pubkey,
      created_at: 100,
      kind: 0,
      tags: [],
      content: null as any,
      sig: "sig-null-content",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;
    const nostr = {
      fetch: jest.fn().mockResolvedValue([nullContentEvent]),
    } as any;
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    const { profileMap } = await fetchProfile(
      nostr,
      ["wss://relay.example"],
      [pubkey],
      jest.fn(),
      new Map()
    );

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping invalid profile JSON")
    );
    expect(profileMap.get(pubkey)).toBeFalsy();
    consoleWarnSpy.mockRestore();
  });

  it("skips a relay profile event whose content is an empty string (line 258 parseJsonSafely)", async () => {
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn().mockResolvedValue(false),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchProfile } = await import("../fetch-service");

    const emptyContentEvent = makeProfileEvent({
      id: "empty-content-profile",
      pubkey,
      created_at: 100,
      kind: 0,
      tags: [],
      content: "   ",
      sig: "sig-empty-content",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;
    const nostr = {
      fetch: jest.fn().mockResolvedValue([emptyContentEvent]),
    } as any;
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    const { profileMap } = await fetchProfile(
      nostr,
      ["wss://relay.example"],
      [pubkey],
      jest.fn(),
      new Map()
    );

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping invalid profile JSON")
    );
    expect(profileMap.get(pubkey)).toBeFalsy();
    consoleWarnSpy.mockRestore();
  });

  it("logs cache rejection for valid relay profile events (line 881)", async () => {
    const cacheError = new Error("profile cache failed");
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn().mockResolvedValue(false),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockRejectedValue(cacheError),
    }));

    const { fetchProfile } = await import("../fetch-service");

    const relayProfile = makeProfileEvent({
      id: "relay-profile-cache-fail",
      pubkey,
      created_at: 100,
      kind: 0,
      tags: [],
      content: JSON.stringify({ display_name: "Cache Fail" }),
      sig: "sig-cache-fail",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;
    const nostr = { fetch: jest.fn().mockResolvedValue([relayProfile]) } as any;
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { profileMap } = await fetchProfile(
      nostr,
      ["wss://relay.example"],
      [pubkey],
      jest.fn(),
      new Map()
    );

    await Promise.resolve();

    // Cache failure must not suppress the profile that was fetched from the relay
    expect(profileMap.get(pubkey)).toMatchObject({
      content: { display_name: "Cache Fail" },
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to cache profiles to database:",
      cacheError
    );
    consoleErrorSpy.mockRestore();
  });

  it("rejects when nostr.fetch throws during the relay profile fetch (line 889)", async () => {
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn().mockResolvedValue(false),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchProfile } = await import("../fetch-service");

    const fetchError = new Error("profile relay down");
    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;
    const nostr = { fetch: jest.fn().mockRejectedValue(fetchError) } as any;

    await expect(
      fetchProfile(
        nostr,
        ["wss://relay.example"],
        [pubkey],
        jest.fn(),
        new Map()
      )
    ).rejects.toThrow("profile relay down");
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

  it("fetches second-degree follows using the direct follow pubkeys as authors", async () => {
    // wot = 1 so a single endorsement is enough
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ wot: 1 })),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));

    const { fetchAllFollows } = await import("../fetch-service");

    const directFollow =
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const secondDegreeFollow =
      "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: "contact-list",
            pubkey: userPubkey,
            created_at: 100,
            kind: 3,
            tags: [["p", directFollow]],
            content: "",
            sig: "sig",
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "second-degree-contact-list",
            pubkey: directFollow,
            created_at: 100,
            kind: 3,
            tags: [["p", secondDegreeFollow]],
            content: "",
            sig: "sig",
          },
        ]),
    } as any;
    const editFollowsContext = jest.fn();

    const result = await fetchAllFollows(
      nostr,
      ["wss://relay.example"],
      editFollowsContext,
      userPubkey
    );

    // Second fetch uses the direct follow pubkeys as authors
    expect(nostr.fetch).toHaveBeenNthCalledWith(
      2,
      [{ kinds: [3], authors: [directFollow] }],
      {},
      ["wss://relay.example"]
    );
    expect(result.followList).toContain(secondDegreeFollow);
  });

  it("excludes second-degree follows whose endorsement count is below the WOT threshold", async () => {
    // wot = 2: a 2nd-degree follow must be endorsed by at least 2 direct follows
    const { fetchAllFollows } = await import("../fetch-service");

    const directFollowA =
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const directFollowB =
      "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    const sharedFollow =
      "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
    const exclusiveFollow =
      "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: "contact-list",
            pubkey: userPubkey,
            created_at: 100,
            kind: 3,
            tags: [
              ["p", directFollowA],
              ["p", directFollowB],
            ],
            content: "",
            sig: "sig",
          },
        ])
        .mockResolvedValueOnce([
          // directFollowA follows both sharedFollow and exclusiveFollow
          {
            id: "cl-a",
            pubkey: directFollowA,
            created_at: 100,
            kind: 3,
            tags: [
              ["p", sharedFollow],
              ["p", exclusiveFollow],
            ],
            content: "",
            sig: "sig-a",
          },
          // directFollowB only follows sharedFollow
          {
            id: "cl-b",
            pubkey: directFollowB,
            created_at: 100,
            kind: 3,
            tags: [["p", sharedFollow]],
            content: "",
            sig: "sig-b",
          },
        ]),
    } as any;
    const editFollowsContext = jest.fn();

    const result = await fetchAllFollows(
      nostr,
      ["wss://relay.example"],
      editFollowsContext,
      userPubkey
    );

    // sharedFollow endorsed by 2 direct follows → meets threshold (wot=2)
    expect(result.followList).toContain(sharedFollow);
    // exclusiveFollow endorsed only by directFollowA → below threshold
    expect(result.followList).not.toContain(exclusiveFollow);
  });

  it("deduplicates pubkeys that appear in both direct and second-degree lists", async () => {
    // wot = 1 so C qualifies even with one endorsement; but two direct follows both endorse C
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ wot: 1 })),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));

    const { fetchAllFollows } = await import("../fetch-service");

    const directFollowA =
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const directFollowB =
      "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    const sharedSecondDegree =
      "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: "contact-list",
            pubkey: userPubkey,
            created_at: 100,
            kind: 3,
            tags: [
              ["p", directFollowA],
              ["p", directFollowB],
            ],
            content: "",
            sig: "sig",
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "cl-a",
            pubkey: directFollowA,
            created_at: 100,
            kind: 3,
            tags: [["p", sharedSecondDegree]],
            content: "",
            sig: "sig-a",
          },
          {
            id: "cl-b",
            pubkey: directFollowB,
            created_at: 100,
            kind: 3,
            tags: [["p", sharedSecondDegree]],
            content: "",
            sig: "sig-b",
          },
        ]),
    } as any;
    const editFollowsContext = jest.fn();

    const result = await fetchAllFollows(
      nostr,
      ["wss://relay.example"],
      editFollowsContext,
      userPubkey
    );

    // sharedSecondDegree appears in both A's and B's lists but must only appear once
    const occurrences = result.followList.filter(
      (pk) => pk === sharedSecondDegree
    );
    expect(occurrences).toHaveLength(1);
    expect(result.followList).toEqual([
      directFollowA,
      directFollowB,
      sharedSecondDegree,
    ]);
  });

  it("skips contact list tags whose second element fails isHexString validation", async () => {
    const { fetchAllFollows } = await import("../fetch-service");

    const validPubkey =
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: "contact-list",
            pubkey: userPubkey,
            created_at: 100,
            kind: 3,
            tags: [
              ["p", "not-a-valid-hex-pubkey"],
              ["t", "shopstr"],
              ["p", validPubkey],
            ],
            content: "",
            sig: "sig",
          },
        ])
        .mockResolvedValueOnce([]),
    } as any;
    const editFollowsContext = jest.fn();

    const result = await fetchAllFollows(
      nostr,
      ["wss://relay.example"],
      editFollowsContext,
      userPubkey
    );

    expect(result.followList).toEqual([validPubkey]);
    expect(result.followList).not.toContain("not-a-valid-hex-pubkey");
    expect(result.followList).not.toContain("shopstr");
  });

  it("returns empty follows and skips the second-degree fetch when all contact tags fail isHexString", async () => {
    const { fetchAllFollows } = await import("../fetch-service");

    const nostr = {
      fetch: jest.fn().mockResolvedValueOnce([
        {
          id: "contact-list",
          pubkey: userPubkey,
          created_at: 100,
          kind: 3,
          tags: [
            ["t", "shopstr"],
            ["x", "bad"],
          ],
          content: "",
          sig: "sig",
        },
      ]),
    } as any;
    const editFollowsContext = jest.fn();

    const result = await fetchAllFollows(
      nostr,
      ["wss://relay.example"],
      editFollowsContext,
      userPubkey
    );

    // Only one relay call (no second-degree fetch)
    expect(nostr.fetch).toHaveBeenCalledTimes(1);
    expect(result.followList).toEqual([]);
    expect(editFollowsContext).toHaveBeenCalledWith([], 0, false);
  });

  it("returns existing latestEvent when a subsequent kind 3 event has an older timestamp (line 1330)", async () => {
    const { fetchAllFollows } = await import("../fetch-service");
    const editFollowsContext = jest.fn();

    // newerFirst processed first: !null → line 1328 (returns it)
    // olderSecond processed second: 100 > 200 is false → line 1330 (returns existing latestEvent)
    const newerFirst = {
      id: "newer-cl",
      pubkey: userPubkey,
      created_at: 200,
      kind: 3,
      tags: [["p", latestFollowPubkey]],
      content: "",
      sig: "sig-newer",
    };
    const olderSecond = {
      id: "older-cl",
      pubkey: userPubkey,
      created_at: 100,
      kind: 3,
      tags: [["p", olderFollowPubkey]],
      content: "",
      sig: "sig-older",
    };

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([newerFirst, olderSecond])
        .mockResolvedValueOnce([]),
    } as any;

    const result = await fetchAllFollows(
      nostr,
      ["wss://relay.example"],
      editFollowsContext,
      userPubkey
    );

    // latestContactListEvent = newerFirst (olderSecond lost in the reduce)
    expect(result.followList).toContain(latestFollowPubkey);
    expect(result.followList).not.toContain(olderFollowPubkey);
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

  it("rejects when nostr.fetch throws during the relay product fetch (line 375)", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllPosts } = await import("../fetch-service");

    const fetchError = new Error("relay down");

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockRejectedValue(fetchError) } as any;

    await expect(
      fetchAllPosts(nostr, ["wss://relay.example"], jest.fn())
    ).rejects.toThrow("relay down");
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
      decrypt: jest.fn().mockResolvedValue(""),
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
        .mockResolvedValueOnce(JSON.stringify(sealEvent))
        .mockResolvedValueOnce(""),
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
      pubkey: senderPubkey,
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
      pubkey: userPubkey,
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
      is_read: true,
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
      sig: "",
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
      decrypt: jest.fn().mockResolvedValue(""),
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

  it("logs when the DB messages fetch throws inside the signer try-block (line 953)", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchGiftWrappedChatsAndMessages } =
      await import("../fetch-service");

    const dbError = new Error("sign throws");
    const signer = {
      sign: jest.fn().mockRejectedValue(dbError),
      decrypt: jest.fn(),
    };
    const nostr = { fetch: jest.fn().mockResolvedValue([]) } as any;
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    global.fetch = jest.fn() as typeof global.fetch;

    const result = await fetchGiftWrappedChatsAndMessages(
      nostr,
      signer as any,
      ["wss://relay.example"],
      jest.fn(),
      "user-pk-953"
    );

    // DB error must not prevent the relay path from running and returning its result
    expect(result.profileSetFromChats).toEqual(new Set());
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch messages from database: ",
      dbError
    );
    consoleErrorSpy.mockRestore();
  });

  it("pushes a second message to the same chat entry (line 968)", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchGiftWrappedChatsAndMessages } =
      await import("../fetch-service");

    const userPubkey = "user-pk-968";
    const senderPubkey = "sender-pk-968";

    const makeWrap = (id: string, ts: number) => ({
      id,
      kind: 1059,
      pubkey: "eph",
      content: "enc-seal",
      created_at: ts,
      sig: "sig",
      tags: [["p", userPubkey]],
    });
    const makeMsg = (ts: number) => ({
      kind: 14,
      pubkey: senderPubkey,
      content: "hi",
      created_at: ts,
      tags: [
        ["p", userPubkey],
        ["subject", "listing-inquiry"],
      ],
    });
    const makeSeal = () => ({
      kind: 13,
      pubkey: senderPubkey,
      content: "enc",
      created_at: 0,
      tags: [],
    });

    const wrap1 = makeWrap("w1", 100);
    const wrap2 = makeWrap("w2", 200);
    const msg1 = makeMsg(100);
    const msg2 = makeMsg(200);
    const seal = makeSeal();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([wrap1, wrap2]) };
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
        .mockResolvedValueOnce(JSON.stringify(seal))
        .mockResolvedValueOnce(JSON.stringify(msg1))
        .mockResolvedValueOnce(JSON.stringify(seal))
        .mockResolvedValueOnce(JSON.stringify(msg2)),
    };

    const result = await fetchGiftWrappedChatsAndMessages(
      nostr as any,
      signer as any,
      ["wss://relay.example"],
      jest.fn(),
      userPubkey
    );

    expect(result.profileSetFromChats).toContain(senderPubkey);
  });

  it("logs error and alert when a message event has no p-tag (lines 1030-1038)", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchGiftWrappedChatsAndMessages } =
      await import("../fetch-service");

    const userPubkey = "user-pk-1030";
    const msgEvent = {
      kind: 14,
      pubkey: userPubkey,
      content: "outgoing",
      created_at: 100,
      tags: [["subject", "listing-inquiry"]],
    };
    const sealEvent = {
      kind: 13,
      pubkey: userPubkey,
      content: "enc",
      created_at: 0,
      tags: [],
    };
    const wrapEvent = {
      id: "wrap-1030",
      kind: 1059,
      pubkey: "eph",
      content: "enc-seal",
      created_at: 100,
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
        .mockResolvedValueOnce(JSON.stringify(msgEvent)),
    };

    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const alertMock = jest.spyOn(window, "alert").mockImplementation(() => {});

    fetchGiftWrappedChatsAndMessages(
      nostr as any,
      signer as any,
      ["wss://relay.example"],
      jest.fn(),
      userPubkey
    );

    // Wait for all nested awaits inside the function to complete
    await new Promise((r) => setTimeout(r, 0));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("fetchAllOutgoingChats")
    );
    expect(alertMock).toHaveBeenCalledWith(
      expect.stringContaining("fetchAllOutgoingChats")
    );
    consoleErrorSpy.mockRestore();
    alertMock.mockRestore();
  });

  it("sort comparator runs when a chat has two messages (line 1067)", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchGiftWrappedChatsAndMessages } =
      await import("../fetch-service");

    const userPubkey = "user-pk-1067";
    const senderPubkey = "sender-pk-1067";

    const makeWrap = (id: string, ts: number) => ({
      id,
      kind: 1059,
      pubkey: "eph",
      content: "enc-seal",
      created_at: ts,
      sig: "sig",
      tags: [["p", userPubkey]],
    });
    const makeSeal = () => ({
      kind: 13,
      pubkey: senderPubkey,
      content: "enc",
      created_at: 0,
      tags: [],
    });
    const makeMsg = (ts: number) => ({
      kind: 14,
      pubkey: senderPubkey,
      content: "msg",
      created_at: ts,
      tags: [
        ["p", userPubkey],
        ["subject", "order-info"],
      ],
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValue([makeWrap("w1", 200), makeWrap("w2", 100)]),
    };
    const signer = {
      sign: jest.fn().mockResolvedValue({
        kind: 27235,
        id: "p",
        sig: "s",
        pubkey: userPubkey,
        content: "",
        tags: [],
        created_at: 0,
      }),
      decrypt: jest
        .fn()
        .mockResolvedValueOnce(JSON.stringify(makeSeal()))
        .mockResolvedValueOnce(JSON.stringify(makeMsg(200)))
        .mockResolvedValueOnce(JSON.stringify(makeSeal()))
        .mockResolvedValueOnce(JSON.stringify(makeMsg(100))),
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
    const msgs = chatMap.get(senderPubkey);
    expect(msgs[0].created_at).toBeLessThanOrEqual(msgs[1].created_at);
  });

  it("logs cache rejection for valid relay message events (line 1078)", async () => {
    const cacheError = new Error("message cache failed");
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockRejectedValue(cacheError),
    }));

    const { fetchGiftWrappedChatsAndMessages } =
      await import("../fetch-service");

    const userPubkey = "user-pk-1078";
    const senderPubkey = "sender-pk-1078";
    const wrapEvent = {
      id: "wrap-1078",
      kind: 1059,
      pubkey: "eph",
      content: "enc-seal",
      created_at: 100,
      sig: "sig-1078",
      tags: [["p", userPubkey]],
    };
    const sealEvent = {
      kind: 13,
      pubkey: senderPubkey,
      content: "enc",
      created_at: 0,
      tags: [],
    };
    const msgEvent = {
      kind: 14,
      pubkey: senderPubkey,
      content: "hi",
      created_at: 100,
      tags: [
        ["p", userPubkey],
        ["subject", "order-payment"],
      ],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;
    const nostr = { fetch: jest.fn().mockResolvedValue([wrapEvent]) };
    const signer = {
      sign: jest.fn().mockResolvedValue({
        kind: 27235,
        id: "p",
        sig: "s",
        pubkey: userPubkey,
        content: "",
        tags: [],
        created_at: 0,
      }),
      decrypt: jest
        .fn()
        .mockResolvedValueOnce(JSON.stringify(sealEvent))
        .mockResolvedValueOnce(JSON.stringify(msgEvent)),
    };
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await fetchGiftWrappedChatsAndMessages(
      nostr as any,
      signer as any,
      ["wss://relay.example"],
      jest.fn(),
      userPubkey
    );
    await Promise.resolve();

    // Cache failure must not suppress the chat that was built from relay messages
    expect(result.profileSetFromChats).toContain(senderPubkey);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to cache messages to database:",
      cacheError
    );
    consoleErrorSpy.mockRestore();
  });

  it("rejects when nostr.fetch throws during the relay message fetch (line 1084)", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchGiftWrappedChatsAndMessages } =
      await import("../fetch-service");

    const fetchError = new Error("messages relay down");
    const signer = {
      sign: jest.fn().mockResolvedValue({
        kind: 27235,
        id: "p",
        sig: "s",
        pubkey: "user-pk-1084",
        content: "",
        tags: [],
        created_at: 0,
      }),
      decrypt: jest.fn(),
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;
    const nostr = { fetch: jest.fn().mockRejectedValue(fetchError) } as any;

    await expect(
      fetchGiftWrappedChatsAndMessages(
        nostr,
        signer as any,
        ["wss://relay.example"],
        jest.fn(),
        "user-pk-1084"
      )
    ).rejects.toThrow("messages relay down");
  });
});

describe("fetchEscrowRecords", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  async function importFetchEscrowRecords(
    restoreEncryptedEscrowRecordLocally = jest.fn()
  ) {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));
    jest.doMock("@/utils/cashu/p2pk-escrow-records", () => {
      const actual = jest.requireActual("@/utils/cashu/p2pk-escrow-records");
      return {
        ...actual,
        restoreEncryptedEscrowRecordLocally,
      };
    });

    const { fetchEscrowRecords } = await import("../fetch-service");
    return {
      fetchEscrowRecords,
      cacheEventsToDatabase,
      restoreEncryptedEscrowRecordLocally,
    };
  }

  const userPubkey =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const buyerEscrowRecord = {
    orderId: "order-db",
    mint: "https://mint.example",
    token: "cashuAdb",
    amount: 21,
    sellerPubkey: "seller-pubkey",
    locktime: 123456,
    refundKeys: ["refund-key"],
    createdAt: 100,
  };
  const relayEscrowRecord = {
    ...buyerEscrowRecord,
    orderId: "order-relay",
    token: "cashuArelay",
    createdAt: 200,
  };

  it("returns without DB, relay, or local writes when signer pubkey is unavailable", async () => {
    const { fetchEscrowRecords, restoreEncryptedEscrowRecordLocally } =
      await importFetchEscrowRecords();
    const nostr = { fetch: jest.fn() } as any;
    const signer = { getPubKey: jest.fn().mockResolvedValue(undefined) };
    global.fetch = jest.fn() as typeof global.fetch;

    await fetchEscrowRecords(nostr, signer as any, ["wss://relay.example"]);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(nostr.fetch).not.toHaveBeenCalled();
    expect(restoreEncryptedEscrowRecordLocally).not.toHaveBeenCalled();
  });

  it("restores encrypted buyer escrow records from DB and relay without plaintext local writes", async () => {
    const { fetchEscrowRecords, restoreEncryptedEscrowRecordLocally } =
      await importFetchEscrowRecords();
    const dbEvent = makeBaseEvent({
      id: "db-escrow",
      kind: 30406,
      pubkey: userPubkey,
      content: "enc-db",
      created_at: 100,
      sig: "sig-db",
    });
    const relayEvent = makeBaseEvent({
      id: "relay-escrow",
      kind: 30406,
      pubkey: userPubkey,
      content: "enc-relay",
      created_at: 200,
      sig: "sig-relay",
    });
    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn(async (_pubkey: string, content: string) =>
        content === "enc-db"
          ? JSON.stringify(buyerEscrowRecord)
          : JSON.stringify(relayEscrowRecord)
      ),
    };

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([dbEvent])) as typeof global.fetch;
    const nostr = { fetch: jest.fn().mockResolvedValue([relayEvent]) } as any;

    await fetchEscrowRecords(nostr, signer as any, ["wss://relay.example"]);

    expect(restoreEncryptedEscrowRecordLocally).toHaveBeenCalledWith({
      orderId: buyerEscrowRecord.orderId,
      createdAt: buyerEscrowRecord.createdAt,
      content: "enc-db",
    });
    expect(restoreEncryptedEscrowRecordLocally).toHaveBeenCalledWith({
      orderId: relayEscrowRecord.orderId,
      createdAt: relayEscrowRecord.createdAt,
      content: "enc-relay",
    });
    expect(restoreEncryptedEscrowRecordLocally).not.toHaveBeenCalledWith(
      expect.objectContaining({ token: expect.any(String) })
    );
  });

  it("caches valid relay escrow events after restoring DB records", async () => {
    const {
      fetchEscrowRecords,
      cacheEventsToDatabase,
      restoreEncryptedEscrowRecordLocally,
    } = await importFetchEscrowRecords();
    const relayEvent = makeBaseEvent({
      id: "relay-cacheable",
      kind: 30406,
      pubkey: userPubkey,
      content: "enc-relay",
      created_at: 200,
      sig: "sig-relay",
    });
    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn().mockResolvedValue(JSON.stringify(relayEscrowRecord)),
    };

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;
    const nostr = { fetch: jest.fn().mockResolvedValue([relayEvent]) } as any;

    await fetchEscrowRecords(nostr, signer as any, ["wss://relay.example"]);

    expect(restoreEncryptedEscrowRecordLocally).toHaveBeenCalledTimes(1);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([relayEvent]);
  });

  it("skips malformed escrow payloads instead of restoring unusable records", async () => {
    const { fetchEscrowRecords, restoreEncryptedEscrowRecordLocally } =
      await importFetchEscrowRecords();
    const relayEvent = makeBaseEvent({
      id: "relay-malformed",
      kind: 30406,
      pubkey: userPubkey,
      content: "enc-malformed",
      created_at: 200,
      sig: "sig-relay",
    });
    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn().mockResolvedValue(JSON.stringify({ orderId: "" })),
    };

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;
    const nostr = { fetch: jest.fn().mockResolvedValue([relayEvent]) } as any;

    await fetchEscrowRecords(nostr, signer as any, ["wss://relay.example"]);

    expect(restoreEncryptedEscrowRecordLocally).not.toHaveBeenCalled();
  });

  it("continues to relay recovery when the DB escrow fetch fails", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { fetchEscrowRecords, restoreEncryptedEscrowRecordLocally } =
      await importFetchEscrowRecords();
    const relayEvent = makeBaseEvent({
      id: "relay-after-db-failure",
      kind: 30406,
      pubkey: userPubkey,
      content: "enc-relay",
      created_at: 200,
      sig: "sig-relay",
    });
    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn().mockResolvedValue(JSON.stringify(relayEscrowRecord)),
    };

    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("db unavailable")) as typeof global.fetch;
    const nostr = { fetch: jest.fn().mockResolvedValue([relayEvent]) } as any;

    await fetchEscrowRecords(nostr, signer as any, ["wss://relay.example"]);

    expect(restoreEncryptedEscrowRecordLocally).toHaveBeenCalledWith({
      orderId: relayEscrowRecord.orderId,
      createdAt: relayEscrowRecord.createdAt,
      content: "enc-relay",
    });
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
      getCachedCashuProofs: jest.fn(() => [
        { id: "local-proof", secret: "local-secret" },
      ]),
      getLocalStorageData: jest.fn(() => ({
        tokens: [],
      })),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
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

  it("recovers a persisted Cashu wallet identity from encrypted wallet config events", async () => {
    const cashuPrivkey = "11".repeat(32);
    const mintUrl = "https://identity-mint.example";
    const publishWalletEvent = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({
        loadMint: jest.fn().mockResolvedValue(undefined),
        checkProofsStates: jest.fn().mockResolvedValue([]),
      })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getCachedCashuProofs: jest.fn(() => []),
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent,
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");
    const userPubkey =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn().mockResolvedValue(
        JSON.stringify([
          ["mint", mintUrl],
          ["privkey", cashuPrivkey],
        ])
      ),
    };
    global.fetch = jest.fn().mockResolvedValue(
      makeDbPayload([
        makeBaseEvent({
          id: "db-wallet-config",
          kind: 17375,
          pubkey: userPubkey,
          content: "enc-wallet-config",
          created_at: 100,
        }),
      ])
    ) as typeof global.fetch;
    const nostr = {
      fetch: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
    } as any;
    const editCashuWalletContext = jest.fn();

    const result = await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    expect(publishWalletEvent).not.toHaveBeenCalled();
    expect(result.cashuMints).toEqual([mintUrl]);
    expect(result.cashuPrivkey).toBe(cashuPrivkey);
    expect(result.cashuPubkey).toMatch(/^[0-9a-f]{64}$/);
    expect(editCashuWalletContext).toHaveBeenLastCalledWith(
      [],
      [mintUrl],
      [],
      false,
      expect.objectContaining({
        cashuPrivkey,
        cashuPubkey: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
    );
  });

  it("generates and publishes a Cashu wallet identity only after relay config fetch succeeds", async () => {
    const generatedKeys = {
      cashuPubkey:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      cashuPrivkey:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };
    const publishWalletEvent = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({
        loadMint: jest.fn().mockResolvedValue(undefined),
        checkProofsStates: jest.fn().mockResolvedValue([]),
      })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getCachedCashuProofs: jest.fn(() => []),
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent,
    }));
    jest.doMock("@/utils/cashu/wallet-config", () => {
      const actual = jest.requireActual("@/utils/cashu/wallet-config");
      return {
        ...actual,
        generateCashuWalletKeypair: jest.fn(() => generatedKeys),
      };
    });
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");
    const userPubkey =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn().mockResolvedValue(null),
    };
    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;
    const nostr = {
      fetch: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
    } as any;
    const editCashuWalletContext = jest.fn();

    const result = await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    expect(publishWalletEvent).toHaveBeenCalledWith(
      nostr,
      signer,
      generatedKeys,
      { mints: [] }
    );
    expect(result).toMatchObject(generatedKeys);
    expect(editCashuWalletContext).toHaveBeenLastCalledWith(
      [],
      [],
      [],
      false,
      expect.objectContaining(generatedKeys)
    );
  });

  it("does not generate a wallet identity when relay config fetch fails", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const publishWalletEvent = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({
        loadMint: jest.fn().mockResolvedValue(undefined),
        checkProofsStates: jest.fn().mockResolvedValue([]),
      })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getCachedCashuProofs: jest.fn(() => []),
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent,
    }));
    jest.doMock("@/utils/cashu/wallet-config", () => {
      const actual = jest.requireActual("@/utils/cashu/wallet-config");
      return {
        ...actual,
        generateCashuWalletKeypair: jest.fn(() => ({
          cashuPubkey:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          cashuPrivkey:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        })),
      };
    });
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");
    const userPubkey =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn().mockResolvedValue(null),
    };
    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;
    const nostr = {
      fetch: jest
        .fn()
        .mockRejectedValueOnce(new Error("relay down"))
        .mockResolvedValueOnce([]),
    } as any;
    const editCashuWalletContext = jest.fn();

    const result = await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    expect(publishWalletEvent).not.toHaveBeenCalled();
    expect(result.cashuPubkey).toBeUndefined();
    expect(result.cashuPrivkey).toBeUndefined();
    expect(editCashuWalletContext).toHaveBeenLastCalledWith(
      [],
      [],
      [],
      false,
      expect.objectContaining({ walletIdentityUnavailable: true })
    );
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("DB-first hydration: extracts kind-17375 mints, tracks kind-37375 mostRecentWalletEvent, adds kind-7375 proof events, and accumulates kind-7376 spending history", async () => {
    const loadMint = jest.fn().mockResolvedValue(undefined);
    const checkProofsStates = jest.fn().mockResolvedValue([
      { state: "UNSPENT", Y: "Y-s1" },
      { state: "UNSPENT", Y: "Y-s-destroyed-db" },
      { state: "UNSPENT", Y: "Y-s-created-db" },
    ]);

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({ loadMint, checkProofsStates })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getCachedCashuProofs: jest.fn(() => []),
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const userPubkey =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const mintUrl = "https://mint-db.example";
    const proof = { id: "p1", secret: "s1", C: "C1", amount: 1 };
    const destroyedProof = {
      id: "p-destroyed-db",
      secret: "s-destroyed-db",
      C: "C-destroyed-db",
      amount: 4,
    };
    const createdProof = {
      id: "p-created-db",
      secret: "s-created-db",
      C: "C-created-db",
      amount: 3,
    };

    const decryptMap: Record<string, string> = {
      "enc-17375": JSON.stringify([["mint", mintUrl]]),
      "enc-7375": JSON.stringify({ mint: mintUrl, proofs: [proof] }),
      "enc-destroyed-7375": JSON.stringify({
        mint: mintUrl,
        proofs: [destroyedProof],
      }),
      "enc-created-7375": JSON.stringify({
        mint: mintUrl,
        proofs: [createdProof],
      }),
      "enc-7376": JSON.stringify([
        ["direction", "out"],
        ["e", "db-destroyed-7375", "", "destroyed"],
        ["e", "db-created-7375", "", "created"],
      ]),
    };
    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest
        .fn()
        .mockImplementation(
          async (_pk: string, content: string) => decryptMap[content] ?? null
        ),
    };

    global.fetch = jest.fn().mockResolvedValue(
      makeDbPayload([
        makeBaseEvent({
          id: "db-17375",
          kind: 17375,
          pubkey: userPubkey,
          content: "enc-17375",
          created_at: 100,
        }),
        makeBaseEvent({
          id: "db-37375",
          kind: 37375,
          pubkey: userPubkey,
          tags: [],
          content: "",
          created_at: 200,
        }),
        makeBaseEvent({
          id: "db-7375",
          kind: 7375,
          pubkey: userPubkey,
          content: "enc-7375",
          created_at: 100,
        }),
        makeBaseEvent({
          id: "db-destroyed-7375",
          kind: 7375,
          pubkey: userPubkey,
          content: "enc-destroyed-7375",
          created_at: 101,
        }),
        makeBaseEvent({
          id: "db-created-7375",
          kind: 7375,
          pubkey: userPubkey,
          content: "enc-created-7375",
          created_at: 102,
        }),
        makeBaseEvent({
          id: "db-7376",
          kind: 7376,
          pubkey: userPubkey,
          content: "enc-7376",
          created_at: 100,
        }),
      ])
    ) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) } as any;
    const editCashuWalletContext = jest.fn();

    const result = await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    expect(result.cashuMints).toContain(mintUrl);
    expect(result.proofEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "db-7375", mint: mintUrl }),
      ])
    );
    expect(result.cashuProofs).toEqual(
      expect.arrayContaining([expect.objectContaining({ secret: "s1" })])
    );
    expect(result.cashuProofs).not.toContainEqual(
      expect.objectContaining({ secret: "s-destroyed-db" })
    );
    expect(result.cashuProofs).toContainEqual(
      expect.objectContaining({ secret: "s-created-db" })
    );
  });

  it("extracts relay and mint tags from mostRecentWalletEvent after the DB loop and uses the cashu relay for the proof fetch", async () => {
    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({
        loadMint: jest.fn().mockResolvedValue(undefined),
        checkProofsStates: jest.fn().mockResolvedValue([]),
      })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getCachedCashuProofs: jest.fn(() => []),
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const userPubkey =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const cashuRelay = "wss://cashu-relay.example";
    const walletMint = "https://wallet-mint.example";

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn().mockResolvedValue(null),
    };

    // DB returns a 37375 event with relay and mint tags
    global.fetch = jest.fn().mockResolvedValue(
      makeDbPayload([
        makeBaseEvent({
          id: "db-37375-with-tags",
          kind: 37375,
          pubkey: userPubkey,
          tags: [
            ["relay", cashuRelay],
            ["mint", walletMint],
          ],
          content: "",
          created_at: 200,
        }),
      ])
    ) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) } as any;
    const editCashuWalletContext = jest.fn();

    await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    expect(nostr.fetch).toHaveBeenCalledTimes(2);
    expect(nostr.fetch).toHaveBeenNthCalledWith(2, expect.anything(), {}, [
      cashuRelay,
    ]);
  });

  it("processes relay wallet config events: kind-17375 mints and kind-37375 wallet state", async () => {
    const loadMint = jest.fn().mockResolvedValue(undefined);
    const checkProofsStates = jest.fn().mockResolvedValue([]);

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({ loadMint, checkProofsStates })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getCachedCashuProofs: jest.fn(() => []),
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const userPubkey =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const relayMint = "https://relay-mint.example";

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest
        .fn()
        // relay 17375 decrypt
        .mockResolvedValueOnce(JSON.stringify([["mint", relayMint]]))
        // relay 37375 and proof fetches: no content to decrypt
        .mockResolvedValue(null),
    };

    // DB empty
    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const relay17375 = makeBaseEvent({
      id: "relay-17375",
      kind: 17375,
      pubkey: userPubkey,
      content: "enc-relay-17375",
      sig: "sig-relay-17375",
      created_at: 100,
    });
    const relay37375 = makeBaseEvent({
      id: "relay-37375",
      kind: 37375,
      pubkey: userPubkey,
      tags: [["relay", "wss://cashu-from-relay.example"]],
      content: "",
      sig: "sig-relay-37375",
      created_at: 200,
    });

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([relay17375, relay37375])
        .mockResolvedValueOnce([]),
    } as any;
    const editCashuWalletContext = jest.fn();

    const result = await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    expect(result.cashuMints).toContain(relayMint);
    // Second nostr.fetch should use the cashu relay from the 37375 relay tag
    expect(nostr.fetch).toHaveBeenNthCalledWith(2, expect.anything(), {}, [
      "wss://cashu-from-relay.example",
    ]);
  });

  it("processes relay proof events (7375) and spending history events (7376)", async () => {
    const loadMint = jest.fn().mockResolvedValue(undefined);
    const checkProofsStates = jest
      .fn()
      .mockResolvedValue([{ state: "UNSPENT", Y: "Y-s-relay" }]);

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({ loadMint, checkProofsStates })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getCachedCashuProofs: jest.fn(() => []),
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const userPubkey =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const mintUrl = "https://relay-proof-mint.example";
    const relayProof = { id: "rp1", secret: "s-relay", C: "C-rp1", amount: 2 };

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest
        .fn()
        // 7375 relay proof decrypt
        .mockResolvedValueOnce(
          JSON.stringify({ mint: mintUrl, proofs: [relayProof] })
        )
        // 7376 relay spending history decrypt
        .mockResolvedValueOnce(
          JSON.stringify([
            ["direction", "in"],
            ["e", "some-created-id", "", "created"],
          ])
        ),
    };

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const relay7375 = makeBaseEvent({
      id: "relay-7375",
      kind: 7375,
      pubkey: userPubkey,
      content: "enc-relay-7375",
      sig: "sig-relay-7375",
      created_at: 100,
    });
    const relay7376 = makeBaseEvent({
      id: "relay-7376",
      kind: 7376,
      pubkey: userPubkey,
      content: "enc-relay-7376",
      sig: "sig-relay-7376",
      created_at: 100,
    });

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([relay7375, relay7376]),
    } as any;
    const editCashuWalletContext = jest.fn();

    const result = await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    expect(result.proofEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "relay-7375", mint: mintUrl }),
      ])
    );
    expect(result.cashuProofs).toEqual(
      expect.arrayContaining([expect.objectContaining({ secret: "s-relay" })])
    );
  });

  it("calls CashuWallet.loadMint for each discovered mint", async () => {
    const loadMint = jest.fn().mockResolvedValue(undefined);
    const checkProofsStates = jest
      .fn()
      .mockResolvedValue([{ state: "UNSPENT", Y: "Y-s-load" }]);
    const MockMint = jest.fn();
    const MockWallet = jest.fn(() => ({ loadMint, checkProofsStates }));

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: MockMint,
      Wallet: MockWallet,
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getCachedCashuProofs: jest.fn(() => []),
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const userPubkey =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const mintUrl = "https://loadmint.example";
    const proof = { id: "pl1", secret: "s-load", C: "C-pl1", amount: 1 };

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest
        .fn()
        .mockResolvedValueOnce(
          JSON.stringify({ mint: mintUrl, proofs: [proof] })
        )
        .mockResolvedValue(null),
    };

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          makeBaseEvent({
            id: "proof-event-loadmint",
            kind: 7375,
            pubkey: userPubkey,
            content: "enc-proof-loadmint",
            sig: "sig-proof-loadmint",
            created_at: 100,
          }),
        ]),
    } as any;

    await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      jest.fn()
    );

    expect(MockMint).toHaveBeenCalledWith(mintUrl);
    expect(MockWallet).toHaveBeenCalledTimes(1);
    expect(loadMint).toHaveBeenCalledTimes(1);
  });

  it("deduplicates proofs by secret when two relay proof events contain the same secret", async () => {
    const loadMint = jest.fn().mockResolvedValue(undefined);
    const checkProofsStates = jest
      .fn()
      .mockResolvedValue([{ state: "UNSPENT", Y: "Y-shared-secret" }]);

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({ loadMint, checkProofsStates })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getCachedCashuProofs: jest.fn(() => []),
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const userPubkey =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const mintUrl = "https://dedup-mint.example";
    const duplicateProofA = {
      id: "dup-a",
      secret: "shared-secret",
      C: "C-dup-a",
      amount: 1,
    };
    const duplicateProofB = {
      id: "dup-b",
      secret: "shared-secret",
      C: "C-dup-b",
      amount: 1,
    };

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest
        .fn()
        .mockResolvedValueOnce(
          JSON.stringify({ mint: mintUrl, proofs: [duplicateProofA] })
        )
        .mockResolvedValueOnce(
          JSON.stringify({ mint: mintUrl, proofs: [duplicateProofB] })
        )
        .mockResolvedValue(null),
    };

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          makeBaseEvent({
            id: "relay-dedup-7375-a",
            kind: 7375,
            pubkey: userPubkey,
            content: "enc-dedup-a",
            sig: "sig-dedup-a",
            created_at: 100,
          }),
          makeBaseEvent({
            id: "relay-dedup-7375-b",
            kind: 7375,
            pubkey: userPubkey,
            content: "enc-dedup-b",
            sig: "sig-dedup-b",
            created_at: 100,
          }),
        ]),
    } as any;

    const result = await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      jest.fn()
    );

    const secretCount = result.cashuProofs.filter(
      (p: { secret: string }) => p.secret === "shared-secret"
    ).length;
    expect(secretCount).toBe(1);
  });

  it("prunes spent proofs using checkProofsStates", async () => {
    const loadMint = jest.fn().mockResolvedValue(undefined);
    const checkProofsStates = jest
      .fn()
      .mockResolvedValue([{ state: "SPENT", Y: "Y-s-spent" }]);

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({ loadMint, checkProofsStates })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getCachedCashuProofs: jest.fn(() => []),
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const userPubkey =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const mintUrl = "https://spent-mint.example";
    const spentProof = { id: "sp1", secret: "s-spent", C: "C-sp1", amount: 5 };

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest
        .fn()
        .mockResolvedValueOnce(
          JSON.stringify({ mint: mintUrl, proofs: [spentProof] })
        )
        .mockResolvedValue(null),
    };

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          makeBaseEvent({
            id: "spent-proof-event",
            kind: 7375,
            pubkey: userPubkey,
            content: "enc-spent",
            sig: "sig-spent",
            created_at: 100,
          }),
        ]),
    } as any;

    const result = await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      jest.fn()
    );

    expect(result.cashuProofs).not.toContainEqual(
      expect.objectContaining({ secret: "s-spent" })
    );
  });

  it("spending-history reconciliation removes out-direction destroyed proofs and adds back unspent created proofs", async () => {
    const loadMint = jest.fn().mockResolvedValue(undefined);
    const checkProofsStates = jest.fn().mockResolvedValue([
      { state: "UNSPENT", Y: "Y-s-out" },
      { state: "UNSPENT", Y: "Y-s-change" },
    ]);

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({ loadMint, checkProofsStates })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getCachedCashuProofs: jest.fn(() => []),
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const userPubkey =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const mintUrl = "https://history-mint.example";
    const outProof = { id: "p-out", secret: "s-out", C: "C-out", amount: 10 };
    const changeProof = {
      id: "p-change",
      secret: "s-change",
      C: "C-change",
      amount: 3,
    };

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest
        .fn()
        // out-proof-event decrypt
        .mockResolvedValueOnce(
          JSON.stringify({ mint: mintUrl, proofs: [outProof] })
        )
        // change-proof-event decrypt
        .mockResolvedValueOnce(
          JSON.stringify({ mint: mintUrl, proofs: [changeProof] })
        )
        // spending-history event decrypt
        .mockResolvedValueOnce(
          JSON.stringify([
            ["direction", "out"],
            ["e", "out-proof-event-id", "", "destroyed"],
            ["e", "change-proof-event-id", "", "created"],
          ])
        ),
    };

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          makeBaseEvent({
            id: "out-proof-event-id",
            kind: 7375,
            pubkey: userPubkey,
            content: "enc-out",
            sig: "sig-out",
            created_at: 100,
          }),
          makeBaseEvent({
            id: "change-proof-event-id",
            kind: 7375,
            pubkey: userPubkey,
            content: "enc-change",
            sig: "sig-change",
            created_at: 100,
          }),
          makeBaseEvent({
            id: "history-event-id",
            kind: 7376,
            pubkey: userPubkey,
            content: "enc-history",
            sig: "sig-history",
            created_at: 100,
          }),
        ]),
    } as any;

    const result = await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      jest.fn()
    );

    expect(result.cashuProofs).not.toContainEqual(
      expect.objectContaining({ secret: "s-out" })
    );
    expect(result.cashuProofs).toContainEqual(
      expect.objectContaining({ secret: "s-change" })
    );
  });

  it("calls deleteEvent with IDs of fully-spent proof events", async () => {
    const loadMint = jest.fn().mockResolvedValue(undefined);
    const checkProofsStates = jest
      .fn()
      .mockResolvedValue([{ state: "SPENT", Y: "Y-s-delete" }]);

    const deleteEvent = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({ loadMint, checkProofsStates })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getCachedCashuProofs: jest.fn(() => []),
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent,
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const userPubkey =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const mintUrl = "https://delete-mint.example";
    const deletedProof = {
      id: "pd1",
      secret: "s-delete",
      C: "C-pd1",
      amount: 1,
    };

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest
        .fn()
        .mockResolvedValueOnce(
          JSON.stringify({ mint: mintUrl, proofs: [deletedProof] })
        )
        .mockResolvedValue(null),
    };

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          makeBaseEvent({
            id: "spent-delete-event-id",
            kind: 7375,
            pubkey: userPubkey,
            content: "enc-delete",
            sig: "sig-delete",
            created_at: 100,
          }),
        ]),
    } as any;

    await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      jest.fn()
    );

    expect(deleteEvent).toHaveBeenCalledWith(
      nostr,
      signer,
      expect.arrayContaining(["spent-delete-event-id"])
    );
  });

  it("does not break when signer.decrypt throws or returns malformed JSON", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getCachedCashuProofs: jest.fn(() => []),
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const userPubkey =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest
        .fn()
        // DB 17375: decrypt throws
        .mockRejectedValueOnce(new Error("decrypt error"))
        // DB 7375: returns malformed JSON
        .mockResolvedValueOnce("not-valid-json{{{"),
    };

    global.fetch = jest.fn().mockResolvedValue(
      makeDbPayload([
        makeBaseEvent({
          id: "err-17375",
          kind: 17375,
          pubkey: userPubkey,
          content: "enc-err-17375",
          created_at: 100,
        }),
        makeBaseEvent({
          id: "err-7375",
          kind: 7375,
          pubkey: userPubkey,
          content: "enc-err-7375",
          created_at: 100,
        }),
      ])
    ) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) } as any;

    await expect(
      fetchCashuWallet(nostr, signer as any, ["wss://relay.example"], jest.fn())
    ).resolves.toMatchObject({
      proofEvents: [],
      cashuMints: [],
      cashuProofs: [],
    });

    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("final context payload matches the reconciled wallet state", async () => {
    const loadMint = jest.fn().mockResolvedValue(undefined);
    const checkProofsStates = jest
      .fn()
      .mockResolvedValue([{ state: "UNSPENT", Y: "Y-s-final" }]);

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({ loadMint, checkProofsStates })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getCachedCashuProofs: jest.fn(() => []),
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const userPubkey =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const mintUrl = "https://final-mint.example";
    const finalProof = {
      id: "pf1",
      secret: "s-final",
      C: "C-pf1",
      amount: 21,
    };

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest
        .fn()
        .mockResolvedValueOnce(
          JSON.stringify({ mint: mintUrl, proofs: [finalProof] })
        )
        .mockResolvedValue(null),
    };

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          makeBaseEvent({
            id: "final-proof-event-id",
            kind: 7375,
            pubkey: userPubkey,
            content: "enc-final",
            sig: "sig-final",
            created_at: 100,
          }),
        ]),
    } as any;
    const editCashuWalletContext = jest.fn();

    const result = await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    const expectedProofEvents = [
      expect.objectContaining({ id: "final-proof-event-id", mint: mintUrl }),
    ];
    const expectedMints = [mintUrl];
    const expectedProofs = [expect.objectContaining({ secret: "s-final" })];

    expect(editCashuWalletContext).toHaveBeenLastCalledWith(
      expect.arrayContaining(expectedProofEvents),
      expectedMints,
      expect.arrayContaining(expectedProofs),
      false,
      expect.objectContaining({
        walletIdentityUnavailable: undefined,
      })
    );
    expect(result.proofEvents).toEqual(
      expect.arrayContaining(expectedProofEvents)
    );
    expect(result.cashuMints).toEqual(expectedMints);
    expect(result.cashuProofs).toEqual(expect.arrayContaining(expectedProofs));
  });

  it("adds a new mint from a DB kind-7375 proof event when it is not yet in cashuMintSet", async () => {
    const userPubkey = "a".repeat(64);
    const mintUrl = "https://db-7375-new-mint.example";
    const proof = { id: "p-new", secret: "s-new", C: "C-new", amount: 2 };

    const loadMint = jest.fn().mockResolvedValue(undefined);
    const checkProofsStates = jest
      .fn()
      .mockResolvedValue([{ state: "UNSPENT", Y: `Y-s-new` }]);

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({ loadMint, checkProofsStates })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const db7375Event = makeBaseEvent({
      id: "db-7375-event",
      kind: 7375,
      pubkey: userPubkey,
      content: "encrypted-db-7375",
      sig: "sig-db-7375",
      created_at: 100,
    });

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest
        .fn()
        .mockResolvedValue(JSON.stringify({ mint: mintUrl, proofs: [proof] })),
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [db7375Event],
    }) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([]),
    } as any;
    const editCashuWalletContext = jest.fn();

    const result = await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    expect(result.cashuMints).toContain(mintUrl);
  });

  it("logs and continues when the wallet DB fetch throws", async () => {
    const userPubkey = "b".repeat(64);
    const dbError = new Error("DB connection refused");

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({
        loadMint: jest.fn().mockResolvedValue(undefined),
        checkProofsStates: jest.fn().mockResolvedValue([]),
      })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    global.fetch = jest.fn().mockRejectedValue(dbError) as typeof global.fetch;

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn(),
    };
    const nostr = { fetch: jest.fn().mockResolvedValue([]) } as any;
    const editCashuWalletContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch wallet events from database: ",
      dbError
    );
    expect(result.cashuMints).toEqual([]);
    expect(result.cashuProofs).toEqual([]);
    consoleErrorSpy.mockRestore();
  });

  it("logs cache rejection for relay wallet config events and adds mints from 37375 relay tags", async () => {
    const userPubkey = "c".repeat(64);
    const mintFromRelayTag = "https://relay-37375-tag-mint.example";
    const cacheError = new Error("wallet config cache failed");

    const loadMint = jest.fn().mockResolvedValue(undefined);
    const checkProofsStates = jest.fn().mockResolvedValue([]);

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({ loadMint, checkProofsStates })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    const cacheEventsToDatabase = jest.fn().mockRejectedValue(cacheError);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchCashuWallet } = await import("../fetch-service");

    // 37375 relay event with a mint tag that's not in the set yet
    const relay37375Event = makeBaseEvent({
      id: "relay-37375-with-mint-tag",
      kind: 37375,
      pubkey: userPubkey,
      tags: [["mint", mintFromRelayTag]],
      content: "",
      sig: "sig-relay-37375",
      created_at: 200,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn().mockResolvedValue("[]"),
    };
    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([relay37375Event])
        .mockResolvedValueOnce([]),
    } as any;
    const editCashuWalletContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    await Promise.resolve(); // flush fire-and-forget .catch

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to cache wallet config events to database:",
      cacheError
    );
    expect(result.cashuMints).toContain(mintFromRelayTag);
    consoleErrorSpy.mockRestore();
  });

  it("logs decrypt error for a relay kind-17375 event and continues", async () => {
    const userPubkey = "d".repeat(64);
    const decryptError = new Error("decrypt failed");

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({
        loadMint: jest.fn().mockResolvedValue(undefined),
        checkProofsStates: jest.fn().mockResolvedValue([]),
      })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const relay17375Event = makeBaseEvent({
      id: "relay-17375-bad-decrypt",
      kind: 17375,
      pubkey: userPubkey,
      content: "bad-content",
      sig: "sig-17375",
      created_at: 100,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn().mockRejectedValue(decryptError),
    };
    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([relay17375Event])
        .mockResolvedValueOnce([]),
    } as any;
    const editCashuWalletContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `Failed to decrypt wallet config event relay-17375-bad-decrypt:`,
      decryptError
    );
    consoleErrorSpy.mockRestore();
  });

  it("logs outer catch when a 37375 event throws on created_at access during relay processing", async () => {
    const userPubkey = "e".repeat(64);

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({
        loadMint: jest.fn().mockResolvedValue(undefined),
        checkProofsStates: jest.fn().mockResolvedValue([]),
      })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const normalEvent = makeBaseEvent({
      id: "normal-37375",
      kind: 37375,
      pubkey: userPubkey,
      tags: [],
      sig: "sig-normal-37375",
      created_at: 100,
    });
    const weirdEvent = {
      id: "weird-37375",
      sig: "sig-weird",
      pubkey: userPubkey,
      kind: 37375,
      content: "",
      tags: [],
    };
    Object.defineProperty(weirdEvent, "created_at", {
      get() {
        throw new Error("bad event data");
      },
      configurable: true,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn().mockResolvedValue("[]"),
    };
    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([normalEvent, weirdEvent as any])
        .mockResolvedValueOnce([]),
    } as any;
    const editCashuWalletContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `Failed to process wallet config event weird-37375:`,
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });

  it("logs catch when mostRecentWalletEvent has null tags during relay mint extraction", async () => {
    const userPubkey = "f".repeat(64);

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({
        loadMint: jest.fn().mockResolvedValue(undefined),
        checkProofsStates: jest.fn().mockResolvedValue([]),
      })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    // 37375 event with null tags so tags.filter() throws
    const nullTagsEvent = {
      id: "null-tags-37375",
      sig: "sig-null-tags",
      pubkey: userPubkey,
      kind: 37375,
      content: "",
      tags: null as any,
      created_at: 100,
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn().mockResolvedValue("[]"),
    };
    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([nullTagsEvent as any])
        .mockResolvedValueOnce([]),
    } as any;
    const editCashuWalletContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to process most recent wallet event:",
      expect.any(TypeError)
    );
    consoleErrorSpy.mockRestore();
  });

  it("logs cache rejection for relay wallet proof events", async () => {
    const userPubkey = "a".repeat(64);
    const proofCacheError = new Error("proof cache failed");

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({
        loadMint: jest.fn().mockResolvedValue(undefined),
        checkProofsStates: jest.fn().mockResolvedValue([]),
      })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    const cacheEventsToDatabase = jest.fn().mockRejectedValue(proofCacheError);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const relay7375Event = makeBaseEvent({
      id: "relay-7375-for-cache",
      kind: 7375,
      pubkey: userPubkey,
      content: "encrypted-relay-proof",
      sig: "sig-relay-7375-cache",
      created_at: 100,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      // Return content without .mint so proof processing is a no-op
      decrypt: jest.fn().mockResolvedValue(JSON.stringify({ notMint: true })),
    };
    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([]) // hEvents
        .mockResolvedValueOnce([relay7375Event]), // proofEvents_raw
    } as any;
    const editCashuWalletContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to cache wallet proof events to database:",
      proofCacheError
    );
    consoleErrorSpy.mockRestore();
  });

  it("warns and skips relay proof event when decrypt returns null", async () => {
    const userPubkey = "b".repeat(64);

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({
        loadMint: jest.fn().mockResolvedValue(undefined),
        checkProofsStates: jest.fn().mockResolvedValue([]),
      })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const relay7375NullDecrypt = makeBaseEvent({
      id: "relay-7375-null-decrypt",
      kind: 7375,
      pubkey: userPubkey,
      content: "content-that-decrypts-to-null",
      sig: "sig-null-decrypt",
      created_at: 100,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn().mockResolvedValue(null),
    };
    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([relay7375NullDecrypt]),
    } as any;
    const editCashuWalletContext = jest.fn();
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      `Failed to decrypt event content for relay-7375-null-decrypt`
    );
    consoleWarnSpy.mockRestore();
  });

  it("logs and continues when decrypt throws for a relay proof event", async () => {
    const userPubkey = "c".repeat(64);
    const proofDecryptError = new Error("proof decrypt error");

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({
        loadMint: jest.fn().mockResolvedValue(undefined),
        checkProofsStates: jest.fn().mockResolvedValue([]),
      })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const relay7375ThrowsDecrypt = makeBaseEvent({
      id: "relay-7375-throws-decrypt",
      kind: 7375,
      pubkey: userPubkey,
      content: "throws-on-decrypt",
      sig: "sig-throws",
      created_at: 100,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn().mockRejectedValue(proofDecryptError),
    };
    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([relay7375ThrowsDecrypt]),
    } as any;
    const editCashuWalletContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `Failed to process wallet event relay-7375-throws-decrypt:`,
      proofDecryptError
    );
    consoleErrorSpy.mockRestore();
  });

  it("passes through proofs from other mints unchanged when filtering spent proofs for a specific mint", async () => {
    const userPubkey = "d".repeat(64);
    const mintA = "https://mint-a.example";
    const mintB = "https://mint-b.example";
    const proofA = { id: "pa", secret: "sa", C: "Ca", amount: 1 };
    const proofB = { id: "pb", secret: "sb", C: "Cb", amount: 1 };

    const loadMint = jest.fn().mockResolvedValue(undefined);
    const checkProofsStates = jest.fn().mockResolvedValue([
      { state: "UNSPENT", Y: "Y-sa" },
      { state: "UNSPENT", Y: "Y-sb" },
    ]);

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({ loadMint, checkProofsStates })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const relay7375A = makeBaseEvent({
      id: "relay-pe-a",
      kind: 7375,
      pubkey: userPubkey,
      content: "content-a",
      sig: "sig-a",
      created_at: 100,
    });
    const relay7375B = makeBaseEvent({
      id: "relay-pe-b",
      kind: 7375,
      pubkey: userPubkey,
      content: "content-b",
      sig: "sig-b",
      created_at: 100,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const decryptMap: Record<string, string> = {
      "content-a": JSON.stringify({ mint: mintA, proofs: [proofA] }),
      "content-b": JSON.stringify({ mint: mintB, proofs: [proofB] }),
    };
    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest
        .fn()
        .mockImplementation(
          async (_pk: string, c: string) => decryptMap[c] ?? null
        ),
    };
    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([]) // hEvents
        .mockResolvedValueOnce([relay7375A, relay7375B]), // proofEvents_raw
    } as any;
    const editCashuWalletContext = jest.fn();

    const result = await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    // Both proofs survived because both are UNSPENT
    expect(result.cashuProofs).toHaveLength(2);
    expect(result.cashuMints).toEqual(expect.arrayContaining([mintA, mintB]));
  });

  it("logs and continues when checkProofsStates throws for a mint", async () => {
    const userPubkey = "e".repeat(64);
    const mintUrl = "https://check-throws.example";
    const proof = { id: "px", secret: "sx", C: "Cx", amount: 1 };
    const checkError = new Error("mint unreachable");

    const loadMint = jest.fn().mockResolvedValue(undefined);
    const checkProofsStates = jest.fn().mockRejectedValue(checkError);

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({ loadMint, checkProofsStates })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const relay7375 = makeBaseEvent({
      id: "relay-7375-check-throws",
      kind: 7375,
      pubkey: userPubkey,
      content: "content-check-throws",
      sig: "sig-check-throws",
      created_at: 100,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest
        .fn()
        .mockResolvedValue(JSON.stringify({ mint: mintUrl, proofs: [proof] })),
    };
    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([relay7375]),
    } as any;
    const editCashuWalletContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `Failed to check proofs for mint ${mintUrl}:`,
      checkError
    );
    consoleErrorSpy.mockRestore();
  });

  it("logs catch when spending history contains non-array data", async () => {
    const userPubkey = "f".repeat(64);

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({
        loadMint: jest.fn().mockResolvedValue(undefined),
        checkProofsStates: jest.fn().mockResolvedValue([]),
      })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const relay7376Bad = makeBaseEvent({
      id: "relay-7376-bad-history",
      kind: 7376,
      pubkey: userPubkey,
      content: "content-bad-history",
      sig: "sig-bad-history",
      created_at: 100,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest
        .fn()
        // Returns an object instead of an array, causing eventTags.some() to throw
        .mockResolvedValue(JSON.stringify({ notAnArray: true })),
    };
    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([relay7376Bad]),
    } as any;
    const editCashuWalletContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to process spending history:",
      expect.any(TypeError)
    );
    consoleErrorSpy.mockRestore();
  });

  it("logs catch when deleteEvent throws for spent proof events", async () => {
    const userPubkey = "a".repeat(64);
    const deleteError = new Error("delete event failed");

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({
        loadMint: jest.fn().mockResolvedValue(undefined),
        checkProofsStates: jest.fn().mockResolvedValue([]),
      })),
      hashToCurve: jest.fn((bytes: Uint8Array) => ({
        toHex: () => `Y-${Buffer.from(bytes).toString("utf8")}`,
      })),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn().mockRejectedValue(deleteError),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    const spendingHistory = [
      ["direction", "out"],
      ["e", "proof-event-to-delete", "", "destroyed"],
    ];
    const relay7376 = makeBaseEvent({
      id: "relay-7376-delete",
      kind: 7376,
      pubkey: userPubkey,
      content: "content-delete",
      sig: "sig-7376-delete",
      created_at: 100,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn().mockResolvedValue(JSON.stringify(spendingHistory)),
    };
    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([relay7376]),
    } as any;
    const editCashuWalletContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await fetchCashuWallet(
      nostr,
      signer as any,
      ["wss://relay.example"],
      editCashuWalletContext
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to delete spent events:",
      deleteError
    );
    consoleErrorSpy.mockRestore();
  });

  it("calls editCashuWalletContext with empty arrays and rejects when nostr.fetch throws", async () => {
    const userPubkey = "b".repeat(64);
    const fatalError = new Error("relay connection refused");

    jest.doMock("@cashu/cashu-ts", () => ({
      Mint: jest.fn(),
      Wallet: jest.fn(() => ({
        loadMint: jest.fn(),
        checkProofsStates: jest.fn(),
      })),
      hashToCurve: jest.fn(),
    }));
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ tokens: [] })),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
      publishWalletEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCashuWallet } = await import("../fetch-service");

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const signer = { getPubKey: jest.fn().mockResolvedValue(userPubkey) };
    const nostr = {
      fetch: jest.fn().mockRejectedValue(fatalError),
    } as any;
    const editCashuWalletContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    await expect(
      fetchCashuWallet(
        nostr,
        signer as any,
        ["wss://relay.example"],
        editCashuWalletContext
      )
    ).rejects.toThrow("relay connection refused");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Fatal error in fetchCashuWallet:",
      fatalError
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Wallet identity unavailable: relay fetch failed. Skipping identity generation to avoid overwriting an existing identity."
    );
    expect(editCashuWalletContext).toHaveBeenCalledWith([], [], [], false);
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
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
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await fetchShopProfile(
      nostr,
      ["wss://relay.example"],
      [pubkey],
      editShopContext
    );

    expect(cacheEventsToDatabase).toHaveBeenCalledTimes(1);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([validShopEvent]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to parse shop profile for pubkey: shop-cache-wrong-kind-pk",
      expect.any(SyntaxError)
    );
    consoleErrorSpy.mockRestore();
  });

  it("sort comparator runs when DB returns multiple events for the same pubkey (line 627)", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchShopProfile } = await import("../fetch-service");

    const pubkey = "multi-db-shop-pk";
    const olderDbEvent = makeShopEvent({
      id: "shop-db-older",
      pubkey,
      created_at: 50,
      content: JSON.stringify({ name: "Old Shop" }),
      sig: "sig-shop-db-older",
    });
    const newerDbEvent = makeShopEvent({
      id: "shop-db-newer",
      pubkey,
      created_at: 200,
      content: JSON.stringify({ name: "New Shop" }),
      sig: "sig-shop-db-newer",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(
        makeDbPayload([olderDbEvent, newerDbEvent])
      ) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) } as any;
    const editShopContext = jest.fn();

    const { shopProfileMap } = await fetchShopProfile(
      nostr,
      ["wss://relay.example"],
      [pubkey],
      editShopContext
    );

    expect(shopProfileMap.get(pubkey)?.created_at).toBe(200);
  });

  it("logs and continues when the shop profiles DB fetch throws (line 659)", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchShopProfile } = await import("../fetch-service");

    const dbError = new Error("shop DB down");
    global.fetch = jest.fn().mockRejectedValue(dbError) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) } as any;
    const editShopContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await fetchShopProfile(
      nostr,
      ["wss://relay.example"],
      ["some-shop-pk"],
      editShopContext
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch shop profiles from database: ",
      dbError
    );
    consoleErrorSpy.mockRestore();
  });

  it("logs cache rejection for valid relay shop events (line 704)", async () => {
    const cacheError = new Error("shop cache failed");
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockRejectedValue(cacheError),
    }));

    const { fetchShopProfile } = await import("../fetch-service");

    const pubkey = "shop-cache-reject-pk";
    const relayShopEvent = makeShopEvent({
      id: "relay-shop-cache-reject",
      pubkey,
      created_at: 100,
      content: JSON.stringify({ name: "Cache Reject Shop" }),
      sig: "sig-shop-cache-reject",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;
    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayShopEvent]),
    } as any;
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { shopProfileMap } = await fetchShopProfile(
      nostr,
      ["wss://relay.example"],
      [pubkey],
      jest.fn()
    );

    await Promise.resolve();

    // Cache failure must not suppress the shop profile fetched from the relay
    expect(shopProfileMap.get(pubkey)).toMatchObject({
      content: { name: "Cache Reject Shop" },
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to cache shop profiles to database:",
      cacheError
    );
    consoleErrorSpy.mockRestore();
  });

  it("rejects when nostr.fetch throws during the relay shop profile fetch (line 714)", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchShopProfile } = await import("../fetch-service");

    const fetchError = new Error("shop relay down");
    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;
    const nostr = { fetch: jest.fn().mockRejectedValue(fetchError) } as any;

    await expect(
      fetchShopProfile(nostr, ["wss://relay.example"], ["some-pk"], jest.fn())
    ).rejects.toThrow("shop relay down");
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

  it("rejects when nostr.fetch throws during the relay cart fetch (line 585)", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCart } = await import("../fetch-service");

    const fetchError = new Error("cart relay down");
    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      decrypt: jest.fn(),
    };
    const nostr = { fetch: jest.fn().mockRejectedValue(fetchError) } as any;

    await expect(
      fetchCart(nostr, signer as any, ["wss://relay.example"], jest.fn(), [])
    ).rejects.toThrow("cart relay down");
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

  it("rejects and logs when nostr.fetch throws during the pending post fetch (lines 2354-2355)", async () => {
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(() => ({ relays: [] })),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn(),
    }));

    const { fetchPendingPosts } = await import("../fetch-service");

    const fetchError = new Error("relay fetch error for pending");
    // nostr.fetch always throws — fetchCommunityPosts (called inside) returns []
    // then nostr.fetch for pending post requests also throws
    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([]) // fetchCommunityPosts: approval fetch → empty
        // second call: fetchPendingPosts' own nostr.fetch throws
        .mockRejectedValueOnce(fetchError),
    } as any;

    const community = makeCommunity();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(fetchPendingPosts(nostr, community)).rejects.toThrow(
      "relay fetch error for pending"
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch pending posts:",
      fetchError
    );
    consoleErrorSpy.mockRestore();
  });
});

describe("fetchReviews", () => {
  const product = {
    id: "product-1",
    kind: 30402,
    pubkey: "seller-a",
    created_at: 100,
    tags: [["d", "listing-1"]],
    content: "",
    sig: "sig-product",
  };
  const productAddress = "a:30402:seller-a:listing-1";

  function makeReviewEvent(overrides: Record<string, unknown> = {}) {
    return {
      id: "review-1",
      kind: 31555,
      pubkey: "reviewer-1",
      created_at: 200,
      tags: [
        ["d", productAddress],
        ["rating", "5", "overall"],
      ],
      content: "Great product!",
      sig: "sig-review",
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("hydrates review maps from the DB and emits context before querying the relay", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReviews } = await import("../fetch-service");

    const dbReview = makeReviewEvent({ id: "db-review-1" });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [dbReview],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) };
    const editReviewsContext = jest.fn();

    const result = await fetchReviews(
      nostr as any,
      ["wss://relay.example"],
      [product as any],
      editReviewsContext
    );

    // Called twice: once from DB block, once final
    expect(editReviewsContext).toHaveBeenCalledTimes(2);
    // DB review surfaces in the final result
    expect(result.productReviewsMap.has("seller-a")).toBe(true);
  });

  it("ignores DB review rows whose address tag is not in the product address set", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReviews } = await import("../fetch-service");

    const irrelevantReview = makeReviewEvent({
      id: "irrelevant",
      tags: [
        ["d", "a:30402:other-seller:other-listing"],
        ["rating", "5", "overall"],
      ],
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [irrelevantReview],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) };
    const editReviewsContext = jest.fn();

    const result = await fetchReviews(
      nostr as any,
      ["wss://relay.example"],
      [product as any],
      editReviewsContext
    );

    expect(result.productReviewsMap.size).toBe(0);
    expect(result.merchantScoresMap.size).toBe(0);
  });

  it("merges relay reviews into the maps alongside DB reviews", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReviews } = await import("../fetch-service");

    const dbReview = makeReviewEvent({
      id: "db-review",
      pubkey: "reviewer-1",
      created_at: 100,
    });
    const relayReview = makeReviewEvent({
      id: "relay-review",
      pubkey: "reviewer-2",
      created_at: 200,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [dbReview],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([relayReview]) };
    const editReviewsContext = jest.fn();

    const result = await fetchReviews(
      nostr as any,
      ["wss://relay.example"],
      [product as any],
      editReviewsContext
    );

    const productReviews = result.productReviewsMap
      .get("seller-a")
      ?.get("listing-1");
    expect(productReviews?.has("reviewer-1")).toBe(true);
    expect(productReviews?.has("reviewer-2")).toBe(true);
  });

  it("uses the newer review's score when the same reviewer submits two reviews", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReviews } = await import("../fetch-service");

    // DB has older review with low rating
    const olderDbReview = makeReviewEvent({
      id: "older-review",
      pubkey: "reviewer-1",
      created_at: 100,
      tags: [
        ["d", productAddress],
        ["rating", "1", "overall"],
      ],
    });
    // Relay has newer review with higher rating
    const newerRelayReview = makeReviewEvent({
      id: "newer-review",
      pubkey: "reviewer-1",
      created_at: 200,
      tags: [
        ["d", productAddress],
        ["rating", "5", "overall"],
      ],
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [olderDbReview],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([newerRelayReview]) };
    const editReviewsContext = jest.fn();

    const result = await fetchReviews(
      nostr as any,
      ["wss://relay.example"],
      [product as any],
      editReviewsContext
    );

    // Score must reflect the newer review (rating 5 → 2.5), not the older (rating 1 → 0.5)
    expect(result.merchantScoresMap.get("seller-a")).toEqual([2.5]);
  });

  it("aggregates merchant scores using calculateWeightedScore of the review tags", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReviews } = await import("../fetch-service");

    const review = makeReviewEvent({
      id: "score-review",
      tags: [
        ["d", productAddress],
        ["rating", "4", "overall"],
      ],
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([review]) };
    const editReviewsContext = jest.fn();

    const result = await fetchReviews(
      nostr as any,
      ["wss://relay.example"],
      [product as any],
      editReviewsContext
    );

    expect(result.merchantScoresMap.get("seller-a")).toEqual([2]);
  });

  it("strips internal created_at entries from review payloads before resolving", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReviews } = await import("../fetch-service");

    const review = makeReviewEvent({ id: "cleanup-review" });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([review]) };
    const editReviewsContext = jest.fn();

    const result = await fetchReviews(
      nostr as any,
      ["wss://relay.example"],
      [product as any],
      editReviewsContext
    );

    const reviewerTags = result.productReviewsMap
      .get("seller-a")
      ?.get("listing-1")
      ?.get("reviewer-1");
    expect(reviewerTags).toBeDefined();
    expect(reviewerTags!.some((item) => item[0] === "created_at")).toBe(false);
  });

  it("returns empty maps when the products list is empty", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReviews } = await import("../fetch-service");

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) };
    const editReviewsContext = jest.fn();

    const result = await fetchReviews(
      nostr as any,
      ["wss://relay.example"],
      [],
      editReviewsContext
    );

    expect(result.merchantScoresMap.size).toBe(0);
    expect(result.productReviewsMap.size).toBe(0);
    expect(editReviewsContext).toHaveBeenCalledWith(
      expect.any(Map),
      expect.any(Map),
      false
    );
  });

  it("caches only relay events that are valid kind 31555 with id, sig, and pubkey", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReviews } = await import("../fetch-service");

    const validReview = makeReviewEvent({
      id: "valid-id",
      sig: "valid-sig",
      pubkey: "reviewer-1",
    });
    const noSigReview = makeReviewEvent({
      id: "no-sig",
      sig: "",
      pubkey: "reviewer-2",
    });
    const noIdReview = makeReviewEvent({
      id: "",
      sig: "sig-noid",
      pubkey: "reviewer-3",
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValue([validReview, noSigReview, noIdReview]),
    };
    const editReviewsContext = jest.fn();

    await fetchReviews(
      nostr as any,
      ["wss://relay.example"],
      [product as any],
      editReviewsContext
    );

    expect(cacheEventsToDatabase).toHaveBeenCalledWith([validReview]);
  });

  it("logs console.error and still runs the relay fetch when the DB endpoint throws", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReviews } = await import("../fetch-service");

    const dbError = new Error("DB connection failed");
    global.fetch = jest.fn().mockRejectedValue(dbError) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) };
    const editReviewsContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await fetchReviews(
      nostr as any,
      ["wss://relay.example"],
      [product as any],
      editReviewsContext
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch reviews from database: ",
      dbError
    );
    expect(nostr.fetch).toHaveBeenCalledTimes(1);
    expect(result.merchantScoresMap).toBeInstanceOf(Map);
    expect(result.productReviewsMap).toBeInstanceOf(Map);

    consoleErrorSpy.mockRestore();
  });

  it("updates existing review's created_at via map() when a newer relay review supersedes it (lines 1175-1178)", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReviews } = await import("../fetch-service");

    const firstRelayReview = makeReviewEvent({
      id: "first-relay-review",
      pubkey: "reviewer-1",
      created_at: 200,
      tags: [
        ["d", productAddress],
        ["rating", "3", "overall"],
      ],
      sig: "sig-first-relay",
    });
    const secondRelayReview = makeReviewEvent({
      id: "second-relay-review",
      pubkey: "reviewer-1",
      created_at: 300,
      tags: [
        ["d", productAddress],
        ["rating", "5", "overall"],
      ],
      sig: "sig-second-relay",
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([firstRelayReview, secondRelayReview]),
    };
    const editReviewsContext = jest.fn();

    const result = await fetchReviews(
      nostr as any,
      ["wss://relay.example"],
      [product as any],
      editReviewsContext
    );

    expect(result.merchantScoresMap.get("seller-a")).toEqual([2.5]);
  });

  it("logs cache rejection for valid relay reviews and still resolves (line 1276)", async () => {
    const cacheError = new Error("review cache failed");
    const cacheEventsToDatabase = jest.fn().mockRejectedValue(cacheError);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReviews } = await import("../fetch-service");

    const relayReview = makeReviewEvent({ id: "cache-fail-review" });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([relayReview]) };
    const editReviewsContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await fetchReviews(
      nostr as any,
      ["wss://relay.example"],
      [product as any],
      editReviewsContext
    );

    await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to cache reviews to database:",
      cacheError
    );
    expect(result.merchantScoresMap).toBeInstanceOf(Map);
    consoleErrorSpy.mockRestore();
  });

  it("rejects when nostr.fetch throws in the relay review fetch (line 1282)", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchReviews } = await import("../fetch-service");

    const fetchError = new Error("relay fetch failed for reviews");

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockRejectedValue(fetchError) };
    const editReviewsContext = jest.fn();

    await expect(
      fetchReviews(
        nostr as any,
        ["wss://relay.example"],
        [product as any],
        editReviewsContext
      )
    ).rejects.toThrow("relay fetch failed for reviews");
  });
});

describe("fetchAllRelays", () => {
  const userPubkey =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  const makeRelayEvent = (overrides: Record<string, any> = {}) =>
    makeBaseEvent({
      kind: 10002,
      pubkey: userPubkey,
      tags: [],
      ...overrides,
    });

  const makeSigner = (pubkey: string | undefined) => ({
    getPubKey: jest.fn().mockResolvedValue(pubkey),
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("returns empty lists without fetching when signer is undefined", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllRelays } = await import("../fetch-service");

    global.fetch = jest.fn() as typeof global.fetch;
    const nostr = { fetch: jest.fn() } as any;
    const editRelaysContext = jest.fn();

    const result = await fetchAllRelays(
      nostr,
      undefined,
      ["wss://relay.example"],
      editRelaysContext
    );

    expect(result).toEqual({
      relayList: [],
      readRelayList: [],
      writeRelayList: [],
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(nostr.fetch).not.toHaveBeenCalled();
    expect(editRelaysContext).not.toHaveBeenCalled();
  });

  it("returns empty lists without fetching when getPubKey returns undefined", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllRelays } = await import("../fetch-service");

    global.fetch = jest.fn() as typeof global.fetch;
    const nostr = { fetch: jest.fn() } as any;
    const editRelaysContext = jest.fn();

    const result = await fetchAllRelays(
      nostr,
      makeSigner(undefined) as any,
      ["wss://relay.example"],
      editRelaysContext
    );

    expect(result).toEqual({
      relayList: [],
      readRelayList: [],
      writeRelayList: [],
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(nostr.fetch).not.toHaveBeenCalled();
  });

  it("hydrates relay lists from the DB before querying the relay", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllRelays } = await import("../fetch-service");

    const dbRelayEvent = makeRelayEvent({
      id: "db-relay-event",
      sig: "sig-db-relay",
      tags: [
        ["r", "wss://db-default.example"],
        ["r", "wss://db-read.example", "read"],
        ["r", "wss://db-write.example", "write"],
      ],
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([dbRelayEvent])) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) } as any;
    const editRelaysContext = jest.fn();

    const result = await fetchAllRelays(
      nostr,
      makeSigner(userPubkey) as any,
      ["wss://relay.example"],
      editRelaysContext
    );

    expect(result.relayList).toContain("wss://db-default.example");
    expect(result.readRelayList).toContain("wss://db-read.example");
    expect(result.writeRelayList).toContain("wss://db-write.example");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/db/fetch-relays?pubkey=${userPubkey}`)
    );
    const dbContextCallOrder = editRelaysContext.mock.invocationCallOrder[0]!;
    const relayFetchCallOrder = nostr.fetch.mock.invocationCallOrder[0]!;
    expect(dbContextCallOrder).toBeLessThan(relayFetchCallOrder);
    // DB results trigger an early context call
    expect(editRelaysContext).toHaveBeenCalledWith(
      expect.arrayContaining(["wss://db-default.example"]),
      expect.arrayContaining(["wss://db-read.example"]),
      expect.arrayContaining(["wss://db-write.example"]),
      false
    );
  });

  it("partitions relay tags into default, read, and write buckets", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllRelays } = await import("../fetch-service");

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const relayEvent = makeRelayEvent({
      id: "relay-partition-event",
      sig: "sig-relay-partition",
      tags: [
        ["r", "wss://default.example"],
        ["r", "wss://read-only.example", "read"],
        ["r", "wss://write-only.example", "write"],
        ["t", "ignored-tag"],
      ],
    });

    const nostr = { fetch: jest.fn().mockResolvedValue([relayEvent]) } as any;
    const editRelaysContext = jest.fn();

    const result = await fetchAllRelays(
      nostr,
      makeSigner(userPubkey) as any,
      ["wss://relay.example"],
      editRelaysContext
    );

    expect(result.relayList).toEqual(["wss://default.example"]);
    expect(result.readRelayList).toEqual(["wss://read-only.example"]);
    expect(result.writeRelayList).toEqual(["wss://write-only.example"]);
  });

  it("deduplicates relays that appear in both DB and relay results", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllRelays } = await import("../fetch-service");

    const dbRelayEvent = makeRelayEvent({
      id: "db-dedup-event",
      sig: "sig-db-dedup",
      tags: [
        ["r", "wss://shared-default.example"],
        ["r", "wss://shared-read.example", "read"],
        ["r", "wss://shared-write.example", "write"],
      ],
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([dbRelayEvent])) as typeof global.fetch;

    const relayEvent = makeRelayEvent({
      id: "relay-dedup-event",
      sig: "sig-relay-dedup",
      tags: [
        ["r", "wss://shared-default.example"],
        ["r", "wss://shared-read.example", "read"],
        ["r", "wss://shared-write.example", "write"],
        ["r", "wss://relay-only.example"],
      ],
    });

    const nostr = { fetch: jest.fn().mockResolvedValue([relayEvent]) } as any;
    const editRelaysContext = jest.fn();

    const result = await fetchAllRelays(
      nostr,
      makeSigner(userPubkey) as any,
      ["wss://relay.example"],
      editRelaysContext
    );

    expect(
      result.relayList.filter((r) => r === "wss://shared-default.example")
    ).toHaveLength(1);
    expect(
      result.readRelayList.filter((r) => r === "wss://shared-read.example")
    ).toHaveLength(1);
    expect(
      result.writeRelayList.filter((r) => r === "wss://shared-write.example")
    ).toHaveLength(1);
    expect(result.relayList).toContain("wss://relay-only.example");
  });

  it("caches only relay events that are valid kind 10002 with id, sig, and pubkey", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchAllRelays } = await import("../fetch-service");

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const validEvent = makeRelayEvent({
      id: "valid-relay-cache",
      sig: "sig-valid-relay-cache",
      tags: [["r", "wss://valid.example"]],
    });
    const missingId = makeRelayEvent({
      id: "",
      sig: "sig-missing-id",
      tags: [["r", "wss://missing-id.example"]],
    });
    const missingSig = makeRelayEvent({
      id: "missing-sig-relay",
      sig: "",
      tags: [["r", "wss://missing-sig.example"]],
    });
    const wrongKind = makeBaseEvent({
      id: "wrong-kind-relay",
      sig: "sig-wrong-kind",
      pubkey: userPubkey,
      kind: 1,
      tags: [["r", "wss://wrong-kind.example"]],
    });

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValue([validEvent, missingId, missingSig, wrongKind]),
    } as any;
    const editRelaysContext = jest.fn();

    await fetchAllRelays(
      nostr,
      makeSigner(userPubkey) as any,
      ["wss://relay.example"],
      editRelaysContext
    );

    expect(cacheEventsToDatabase).toHaveBeenCalledTimes(1);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([validEvent]);
  });

  it("calls editRelaysContext with merged relay state after relay fetch completes", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllRelays } = await import("../fetch-service");

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const relayEvent = makeRelayEvent({
      id: "ctx-relay-event",
      sig: "sig-ctx-relay",
      tags: [
        ["r", "wss://ctx-default.example"],
        ["r", "wss://ctx-read.example", "read"],
        ["r", "wss://ctx-write.example", "write"],
      ],
    });

    const nostr = { fetch: jest.fn().mockResolvedValue([relayEvent]) } as any;
    const editRelaysContext = jest.fn();

    await fetchAllRelays(
      nostr,
      makeSigner(userPubkey) as any,
      ["wss://relay.example"],
      editRelaysContext
    );

    expect(editRelaysContext).toHaveBeenLastCalledWith(
      expect.arrayContaining(["wss://ctx-default.example"]),
      expect.arrayContaining(["wss://ctx-read.example"]),
      expect.arrayContaining(["wss://ctx-write.example"]),
      false
    );
  });

  it("catches and logs a DB fetch throw and still queries the relay", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllRelays } = await import("../fetch-service");

    const dbError = new Error("DB connection failed");
    global.fetch = jest.fn().mockRejectedValue(dbError) as typeof global.fetch;

    const relayEvent = makeRelayEvent({
      id: "relay-after-db-throw",
      sig: "sig-relay-after-db-throw",
      tags: [["r", "wss://relay-after-db-throw.example"]],
    });

    const nostr = { fetch: jest.fn().mockResolvedValue([relayEvent]) } as any;
    const editRelaysContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await fetchAllRelays(
      nostr,
      makeSigner(userPubkey) as any,
      ["wss://relay.example"],
      editRelaysContext
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch relay config from database: ",
      dbError
    );
    expect(nostr.fetch).toHaveBeenCalledTimes(1);
    expect(result.relayList).toContain("wss://relay-after-db-throw.example");

    consoleErrorSpy.mockRestore();
  });

  it("logs cache rejection for relay config events and still resolves (line 1511)", async () => {
    const cacheError = new Error("relay config cache failed");
    const cacheEventsToDatabase = jest.fn().mockRejectedValue(cacheError);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchAllRelays } = await import("../fetch-service");

    const relayEvent = makeRelayEvent({
      id: "relay-event-cache-fail",
      sig: "sig-cache-fail",
      tags: [["r", "wss://cache-fail.example"]],
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([relayEvent]) } as any;
    const editRelaysContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await fetchAllRelays(
      nostr,
      makeSigner(userPubkey) as any,
      ["wss://relay.example"],
      editRelaysContext
    );

    await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to cache relay config events to database:",
      cacheError
    );
    expect(result.relayList).toContain("wss://cache-fail.example");
    consoleErrorSpy.mockRestore();
  });

  it("rejects when nostr.fetch throws in the relay config fetch (line 1559)", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllRelays } = await import("../fetch-service");

    const fetchError = new Error("relay fetch threw for relays");

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockRejectedValue(fetchError) } as any;
    const editRelaysContext = jest.fn();

    await expect(
      fetchAllRelays(
        nostr,
        makeSigner(userPubkey) as any,
        ["wss://relay.example"],
        editRelaysContext
      )
    ).rejects.toThrow("relay fetch threw for relays");
  });
});

describe("fetchAllBlossomServers", () => {
  const userPubkey =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  const makeBlossomEvent = (overrides: Record<string, any> = {}) =>
    makeBaseEvent({
      kind: 10063,
      pubkey: userPubkey,
      tags: [],
      ...overrides,
    });

  const makeSigner = (pubkey: string | undefined) => ({
    getPubKey: jest.fn().mockResolvedValue(pubkey),
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("returns empty list without fetching when signer is undefined", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllBlossomServers } = await import("../fetch-service");

    global.fetch = jest.fn() as typeof global.fetch;
    const nostr = { fetch: jest.fn() } as any;
    const editBlossomContext = jest.fn();

    const result = await fetchAllBlossomServers(
      nostr,
      undefined,
      ["wss://relay.example"],
      editBlossomContext
    );

    expect(result).toEqual({ blossomServers: [] });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(nostr.fetch).not.toHaveBeenCalled();
    expect(editBlossomContext).not.toHaveBeenCalled();
  });

  it("returns empty list without fetching when getPubKey returns undefined", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllBlossomServers } = await import("../fetch-service");

    global.fetch = jest.fn() as typeof global.fetch;
    const nostr = { fetch: jest.fn() } as any;
    const editBlossomContext = jest.fn();

    const result = await fetchAllBlossomServers(
      nostr,
      makeSigner(undefined) as any,
      ["wss://relay.example"],
      editBlossomContext
    );

    expect(result).toEqual({ blossomServers: [] });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(nostr.fetch).not.toHaveBeenCalled();
  });

  it("hydrates blossom servers from DB before querying the relay", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllBlossomServers } = await import("../fetch-service");

    const dbBlossomEvent = makeBlossomEvent({
      id: "db-blossom-event",
      sig: "sig-db-blossom",
      tags: [
        ["server", "https://db-server-1.example"],
        ["server", "https://db-server-2.example"],
        ["t", "ignored"],
      ],
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(
        makeDbPayload([dbBlossomEvent])
      ) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) } as any;
    const editBlossomContext = jest.fn();

    const result = await fetchAllBlossomServers(
      nostr,
      makeSigner(userPubkey) as any,
      ["wss://relay.example"],
      editBlossomContext
    );

    expect(result.blossomServers).toContain("https://db-server-1.example");
    expect(result.blossomServers).toContain("https://db-server-2.example");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/db/fetch-blossom?pubkey=${userPubkey}`)
    );
    const dbContextCallOrder = editBlossomContext.mock.invocationCallOrder[0]!;
    const relayFetchCallOrder = nostr.fetch.mock.invocationCallOrder[0]!;
    expect(dbContextCallOrder).toBeLessThan(relayFetchCallOrder);
    // DB results trigger an early context call before relay completes
    expect(editBlossomContext).toHaveBeenCalledWith(
      expect.arrayContaining([
        "https://db-server-1.example",
        "https://db-server-2.example",
      ]),
      false
    );
  });

  it("adds relay servers that are not already in the DB list without duplicates", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllBlossomServers } = await import("../fetch-service");

    const dbBlossomEvent = makeBlossomEvent({
      id: "db-dedup-blossom",
      sig: "sig-db-dedup-blossom",
      tags: [["server", "https://shared-server.example"]],
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(
        makeDbPayload([dbBlossomEvent])
      ) as typeof global.fetch;

    const relayBlossomEvent = makeBlossomEvent({
      id: "relay-dedup-blossom",
      sig: "sig-relay-dedup-blossom",
      tags: [
        ["server", "https://shared-server.example"],
        ["server", "https://relay-only-server.example"],
      ],
    });

    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayBlossomEvent]),
    } as any;
    const editBlossomContext = jest.fn();

    const result = await fetchAllBlossomServers(
      nostr,
      makeSigner(userPubkey) as any,
      ["wss://relay.example"],
      editBlossomContext
    );

    expect(
      result.blossomServers.filter((s) => s === "https://shared-server.example")
    ).toHaveLength(1);
    expect(result.blossomServers).toContain(
      "https://relay-only-server.example"
    );
  });

  it("caches only relay events that are valid kind 10063 with id, sig, and pubkey", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchAllBlossomServers } = await import("../fetch-service");

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const validEvent = makeBlossomEvent({
      id: "valid-blossom-cache",
      sig: "sig-valid-blossom-cache",
      tags: [["server", "https://valid-cache.example"]],
    });
    const missingId = makeBlossomEvent({
      id: "",
      sig: "sig-blossom-no-id",
      tags: [["server", "https://no-id.example"]],
    });
    const missingSig = makeBlossomEvent({
      id: "blossom-no-sig",
      sig: "",
      tags: [["server", "https://no-sig.example"]],
    });
    const wrongKind = makeBaseEvent({
      id: "blossom-wrong-kind",
      sig: "sig-wrong-kind-blossom",
      pubkey: userPubkey,
      kind: 1,
      tags: [["server", "https://wrong-kind.example"]],
    });

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValue([validEvent, missingId, missingSig, wrongKind]),
    } as any;
    const editBlossomContext = jest.fn();

    await fetchAllBlossomServers(
      nostr,
      makeSigner(userPubkey) as any,
      ["wss://relay.example"],
      editBlossomContext
    );

    expect(cacheEventsToDatabase).toHaveBeenCalledTimes(1);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([validEvent]);
  });

  it("calls editBlossomContext with the final merged server list after relay fetch completes", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllBlossomServers } = await import("../fetch-service");

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const relayBlossomEvent = makeBlossomEvent({
      id: "ctx-blossom-event",
      sig: "sig-ctx-blossom",
      tags: [
        ["server", "https://ctx-server-1.example"],
        ["server", "https://ctx-server-2.example"],
      ],
    });

    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayBlossomEvent]),
    } as any;
    const editBlossomContext = jest.fn();

    await fetchAllBlossomServers(
      nostr,
      makeSigner(userPubkey) as any,
      ["wss://relay.example"],
      editBlossomContext
    );

    expect(editBlossomContext).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        "https://ctx-server-1.example",
        "https://ctx-server-2.example",
      ]),
      false
    );
  });

  it("catches and logs a DB fetch throw and still queries the relay", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllBlossomServers } = await import("../fetch-service");

    const dbError = new Error("DB connection failed");
    global.fetch = jest.fn().mockRejectedValue(dbError) as typeof global.fetch;

    const relayBlossomEvent = makeBlossomEvent({
      id: "relay-after-blossom-db-throw",
      sig: "sig-relay-after-blossom-db-throw",
      tags: [["server", "https://relay-after-db-throw.example"]],
    });

    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayBlossomEvent]),
    } as any;
    const editBlossomContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await fetchAllBlossomServers(
      nostr,
      makeSigner(userPubkey) as any,
      ["wss://relay.example"],
      editBlossomContext
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch blossom config from database: ",
      dbError
    );
    expect(nostr.fetch).toHaveBeenCalledTimes(1);
    expect(result.blossomServers).toContain(
      "https://relay-after-db-throw.example"
    );

    consoleErrorSpy.mockRestore();
  });

  it("logs cache rejection for relay blossom config events and still resolves (line 1631)", async () => {
    const cacheError = new Error("blossom cache failed");
    const cacheEventsToDatabase = jest.fn().mockRejectedValue(cacheError);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchAllBlossomServers } = await import("../fetch-service");

    const blossomEvent = makeBlossomEvent({
      id: "blossom-cache-fail",
      sig: "sig-blossom-cache-fail",
      tags: [["server", "https://blossom-cache-fail.example"]],
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([blossomEvent]) } as any;
    const editBlossomContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await fetchAllBlossomServers(
      nostr,
      makeSigner(userPubkey) as any,
      ["wss://relay.example"],
      editBlossomContext
    );

    await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to cache blossom config events to database:",
      cacheError
    );
    expect(result.blossomServers).toContain(
      "https://blossom-cache-fail.example"
    );
    consoleErrorSpy.mockRestore();
  });

  it("rejects when nostr.fetch throws in the blossom server fetch (line 1655)", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllBlossomServers } = await import("../fetch-service");

    const fetchError = new Error("blossom relay fetch failed");

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockRejectedValue(fetchError) } as any;
    const editBlossomContext = jest.fn();

    await expect(
      fetchAllBlossomServers(
        nostr,
        makeSigner(userPubkey) as any,
        ["wss://relay.example"],
        editBlossomContext
      )
    ).rejects.toThrow("blossom relay fetch failed");
  });
});

describe("fetchAllCommunities", () => {
  const makeCommunityEvent = (overrides: Record<string, any> = {}) =>
    makeBaseEvent({
      kind: 34550,
      tags: [["d", "test-community"]],
      ...overrides,
    });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("hydrates communities from DB before querying the relay", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllCommunities } = await import("../fetch-service");

    const dbEvent = makeCommunityEvent({
      id: "db-community-1",
      pubkey: "pubkey-1",
      sig: "sig-db-1",
      created_at: 100,
      tags: [["d", "community-db"]],
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([dbEvent])) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) } as any;
    const editCommunityContext = jest.fn();

    const result = await fetchAllCommunities(
      nostr,
      ["wss://relay.example"],
      editCommunityContext
    );

    // DB emit happens before relay, then final emit after relay
    expect(editCommunityContext).toHaveBeenCalledTimes(2);
    const firstCall = editCommunityContext.mock.calls[0][0] as Map<
      string,
      unknown
    >;
    expect(firstCall.has("db-community-1")).toBe(true);
    expect(result.has("db-community-1")).toBe(true);
  });

  it("skips events for which parseCommunityEvent returns null (missing d tag)", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllCommunities } = await import("../fetch-service");

    const validDbEvent = makeCommunityEvent({
      id: "db-valid",
      sig: "sig-db-valid",
      created_at: 100,
      tags: [["d", "valid-community"]],
    });
    // 34550 without d-tag → parseCommunityEvent returns null
    const invalidDbEvent = makeCommunityEvent({
      id: "db-invalid-no-d",
      sig: "sig-db-invalid",
      created_at: 100,
      tags: [],
    });
    const invalidRelayEvent = makeCommunityEvent({
      id: "relay-invalid-no-d",
      sig: "sig-relay-invalid",
      created_at: 200,
      tags: [],
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(
        makeDbPayload([validDbEvent, invalidDbEvent])
      ) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([invalidRelayEvent]),
    } as any;
    const editCommunityContext = jest.fn();

    const result = await fetchAllCommunities(
      nostr,
      ["wss://relay.example"],
      editCommunityContext
    );

    expect(result.has("db-valid")).toBe(true);
    expect(result.has("db-invalid-no-d")).toBe(false);
    expect(result.has("relay-invalid-no-d")).toBe(false);
    expect(result.size).toBe(1);
  });

  it("relay event with higher createdAt replaces the DB version of the same community", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllCommunities } = await import("../fetch-service");

    const sharedId = "shared-community-id";
    const dbEvent = makeCommunityEvent({
      id: sharedId,
      sig: "sig-db",
      created_at: 100,
      tags: [
        ["d", "shared-community"],
        ["name", "DB Name"],
      ],
    });
    const relayNewer = makeCommunityEvent({
      id: sharedId,
      sig: "sig-relay-newer",
      created_at: 200,
      tags: [
        ["d", "shared-community"],
        ["name", "Relay Name"],
      ],
    });
    const relayOlder = makeCommunityEvent({
      id: "other-community-id",
      sig: "sig-relay-older",
      created_at: 50,
      tags: [["d", "other-community"]],
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([dbEvent])) as typeof global.fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayNewer, relayOlder]),
    } as any;
    const editCommunityContext = jest.fn();

    const result = await fetchAllCommunities(
      nostr,
      ["wss://relay.example"],
      editCommunityContext
    );

    expect(result.get(sharedId)).toMatchObject({ createdAt: 200 });
    expect(result.has("other-community-id")).toBe(true);
  });

  it("caches only valid kind-34550 relay events that have id, sig, and pubkey", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchAllCommunities } = await import("../fetch-service");

    const validEvent = makeCommunityEvent({
      id: "valid-cache",
      sig: "sig-valid",
      pubkey: "pubkey-valid",
      created_at: 100,
      tags: [["d", "valid"]],
    });
    const missingId = makeCommunityEvent({
      id: "",
      sig: "sig-no-id",
      pubkey: "pubkey-no-id",
      created_at: 101,
      tags: [["d", "no-id"]],
    });
    const missingSig = makeCommunityEvent({
      id: "no-sig-id",
      sig: "",
      pubkey: "pubkey-no-sig",
      created_at: 102,
      tags: [["d", "no-sig"]],
    });
    const wrongKind = makeBaseEvent({
      id: "wrong-kind-id",
      kind: 1,
      sig: "sig-wrong-kind",
      pubkey: "pubkey-wrong-kind",
      created_at: 103,
      tags: [],
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValue([validEvent, missingId, missingSig, wrongKind]),
    } as any;

    await fetchAllCommunities(nostr, ["wss://relay.example"], jest.fn());

    expect(cacheEventsToDatabase).toHaveBeenCalledTimes(1);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([validEvent]);
  });

  it("returns an empty map and calls editCommunityContext once when both DB and relay are empty", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllCommunities } = await import("../fetch-service");

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([])) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([]) } as any;
    const editCommunityContext = jest.fn();

    const result = await fetchAllCommunities(
      nostr,
      ["wss://relay.example"],
      editCommunityContext
    );

    expect(result.size).toBe(0);
    // Only the post-relay call — no early DB emit since DB was empty
    expect(editCommunityContext).toHaveBeenCalledTimes(1);
    expect(editCommunityContext).toHaveBeenCalledWith(new Map(), false);
  });

  it("passes the merged community map to editCommunityContext on the final call", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllCommunities } = await import("../fetch-service");

    const dbEvent = makeCommunityEvent({
      id: "ctx-db-community",
      sig: "sig-ctx-db",
      created_at: 100,
      tags: [["d", "ctx-db"]],
    });
    const relayEvent = makeCommunityEvent({
      id: "ctx-relay-community",
      sig: "sig-ctx-relay",
      created_at: 200,
      tags: [["d", "ctx-relay"]],
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue(makeDbPayload([dbEvent])) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([relayEvent]) } as any;
    const editCommunityContext = jest.fn();

    await fetchAllCommunities(
      nostr,
      ["wss://relay.example"],
      editCommunityContext
    );

    const lastCall = editCommunityContext.mock.calls[
      editCommunityContext.mock.calls.length - 1
    ][0] as Map<string, unknown>;

    expect(lastCall.has("ctx-db-community")).toBe(true);
    expect(lastCall.has("ctx-relay-community")).toBe(true);
    expect(editCommunityContext).toHaveBeenLastCalledWith(
      expect.any(Map),
      false
    );
  });

  it("catches and logs a DB fetch throw and still queries the relay", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllCommunities } = await import("../fetch-service");

    const dbError = new Error("DB unavailable");
    global.fetch = jest.fn().mockRejectedValue(dbError) as typeof global.fetch;

    const relayEvent = makeCommunityEvent({
      id: "relay-after-db-throw",
      sig: "sig-relay-throw",
      created_at: 100,
      tags: [["d", "relay-after-throw"]],
    });

    const nostr = { fetch: jest.fn().mockResolvedValue([relayEvent]) } as any;
    const editCommunityContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await fetchAllCommunities(
      nostr,
      ["wss://relay.example"],
      editCommunityContext
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch communities from database: ",
      dbError
    );
    expect(nostr.fetch).toHaveBeenCalledTimes(1);
    expect(result.has("relay-after-db-throw")).toBe(true);

    consoleErrorSpy.mockRestore();
  });

  it("logs cache rejection for relay community events and still resolves (line 2173)", async () => {
    const cacheError = new Error("community cache failed");
    const cacheEventsToDatabase = jest.fn().mockRejectedValue(cacheError);
    jest.doMock("@/utils/db/db-client", () => ({ cacheEventsToDatabase }));

    const { fetchAllCommunities } = await import("../fetch-service");

    const relayEvent = makeCommunityEvent({
      id: "community-cache-fail",
      sig: "sig-community-cache-fail",
      created_at: 100,
      tags: [["d", "community-cache-fail"]],
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockResolvedValue([relayEvent]) } as any;
    const editCommunityContext = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await fetchAllCommunities(
      nostr,
      ["wss://relay.example"],
      editCommunityContext
    );

    await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to cache communities to database:",
      cacheError
    );
    expect(result.has("community-cache-fail")).toBe(true);
    consoleErrorSpy.mockRestore();
  });

  it("rejects when nostr.fetch throws during community relay fetch (line 2179)", async () => {
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchAllCommunities } = await import("../fetch-service");

    const fetchError = new Error("communities relay fetch failed");

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const nostr = { fetch: jest.fn().mockRejectedValue(fetchError) } as any;
    const editCommunityContext = jest.fn();

    await expect(
      fetchAllCommunities(nostr, ["wss://relay.example"], editCommunityContext)
    ).rejects.toThrow("communities relay fetch failed");
  });
});

describe("fetchCommunityPosts", () => {
  const makeCommunity = (overrides: Record<string, any> = {}) => ({
    id: "community-id",
    kind: 34550,
    pubkey: "moderator-pk",
    createdAt: 100,
    d: "test-community",
    name: "Test Community",
    description: "",
    image: "https://robohash.org/community-id",
    moderators: ["moderator-pk"],
    relays: {
      approvals: [],
      requests: [],
      metadata: [],
      all: ["wss://community-relay.example"],
    },
    relaysList: ["wss://community-relay.example"],
    ...overrides,
  });

  const makeApprovalEvent = (overrides: Record<string, any> = {}) =>
    makeBaseEvent({
      kind: 4550,
      pubkey: "moderator-pk",
      ...overrides,
    });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("returns empty array without fetching when community is null or falsy", async () => {
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn().mockReturnValue({ relays: [] }),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCommunityPosts } = await import("../fetch-service");

    const nostr = { fetch: jest.fn() } as any;

    await expect(fetchCommunityPosts(nostr, null as any)).resolves.toEqual([]);

    expect(nostr.fetch).not.toHaveBeenCalled();
  });

  it("returns empty array without fetching when combined relay set is empty", async () => {
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn().mockReturnValue({ relays: [] }),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCommunityPosts } = await import("../fetch-service");

    const nostr = { fetch: jest.fn() } as any;
    const community = makeCommunity({
      relays: { approvals: [], requests: [], metadata: [], all: [] },
      relaysList: undefined,
    });

    await expect(fetchCommunityPosts(nostr, community as any)).resolves.toEqual(
      []
    );

    expect(nostr.fetch).not.toHaveBeenCalled();
  });

  it("filters out approval events from non-moderator pubkeys", async () => {
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn().mockReturnValue({ relays: [] }),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCommunityPosts } = await import("../fetch-service");

    const nonModApproval = makeApprovalEvent({
      id: "non-mod-approval",
      pubkey: "stranger-pk",
      tags: [["e", "post-to-approve"]],
      created_at: 100,
    });

    const nostr = {
      fetch: jest.fn().mockResolvedValueOnce([nonModApproval]),
    } as any;

    const result = await fetchCommunityPosts(nostr, makeCommunity() as any);

    expect(result).toEqual([]);
    expect(nostr.fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps only the latest approval for a given post when multiple approvals reference it", async () => {
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn().mockReturnValue({ relays: [] }),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCommunityPosts } = await import("../fetch-service");

    const earlierApproval = makeApprovalEvent({
      id: "approval-early",
      tags: [["e", "shared-post-id"]],
      created_at: 100,
    });
    const laterApproval = makeApprovalEvent({
      id: "approval-late",
      tags: [["e", "shared-post-id"]],
      created_at: 200,
    });
    const post = makeBaseEvent({
      id: "shared-post-id",
      kind: 1111,
      created_at: 50,
      sig: "sig-shared-post",
    });

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([earlierApproval, laterApproval])
        .mockResolvedValueOnce([post]),
    } as any;

    const result = await fetchCommunityPosts(nostr, makeCommunity() as any);

    expect(result[0]).toMatchObject({
      id: "shared-post-id",
      approved: true,
      approvalEventId: "approval-late",
    });
  });

  it("returns empty array when no valid approved event IDs exist after filtering approvals", async () => {
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn().mockReturnValue({ relays: [] }),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCommunityPosts } = await import("../fetch-service");

    const nostr = {
      fetch: jest.fn().mockResolvedValueOnce([]),
    } as any;

    const result = await fetchCommunityPosts(nostr, makeCommunity() as any);

    expect(result).toEqual([]);
    // Only the approval fetch ran
    expect(nostr.fetch).toHaveBeenCalledTimes(1);
  });

  it("batches approved event IDs into groups of 50 for post fetching", async () => {
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn().mockReturnValue({ relays: [] }),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCommunityPosts } = await import("../fetch-service");

    // One approval event approving 55 distinct posts
    const eTags = Array.from({ length: 55 }, (_, i) => [
      "e",
      `batch-post-${i}`,
    ]);
    const bigApproval = makeApprovalEvent({
      id: "big-approval",
      tags: eTags,
      created_at: 100,
    });

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([bigApproval])
        .mockResolvedValue([]),
    } as any;

    await fetchCommunityPosts(nostr, makeCommunity() as any);

    expect(nostr.fetch).toHaveBeenCalledTimes(3);
    const secondCallIds = nostr.fetch.mock.calls[1][0][0].ids as string[];
    const thirdCallIds = nostr.fetch.mock.calls[2][0][0].ids as string[];
    expect(secondCallIds).toHaveLength(50);
    expect(thirdCallIds).toHaveLength(5);
  });

  it("annotates approved posts with approval metadata and sets approved: false for unapproved posts", async () => {
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn().mockReturnValue({ relays: [] }),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCommunityPosts } = await import("../fetch-service");

    const approval = makeApprovalEvent({
      id: "approval-annotate",
      tags: [["e", "approved-post-id"]],
      created_at: 100,
    });
    const approvedPost = makeBaseEvent({
      id: "approved-post-id",
      kind: 1111,
      created_at: 200,
      sig: "sig-approved",
    });
    const unapprovedPost = makeBaseEvent({
      id: "unapproved-post-id",
      kind: 1111,
      created_at: 100,
      sig: "sig-unapproved",
    });

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([approval])
        .mockResolvedValueOnce([approvedPost, unapprovedPost]),
    } as any;

    const result = await fetchCommunityPosts(nostr, makeCommunity() as any);

    const approvedResult = result.find(
      (p) => p.id === "approved-post-id"
    ) as any;
    const unapprovedResult = result.find(
      (p) => p.id === "unapproved-post-id"
    ) as any;

    expect(approvedResult).toMatchObject({
      id: "approved-post-id",
      approved: true,
      approvalEventId: "approval-annotate",
      approvedBy: "moderator-pk",
    });
    expect(unapprovedResult).toMatchObject({
      id: "unapproved-post-id",
      approved: false,
    });
    expect(unapprovedResult.approvalEventId).toBeUndefined();
  });

  it("sorts returned posts newest-first by created_at", async () => {
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn().mockReturnValue({ relays: [] }),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCommunityPosts } = await import("../fetch-service");

    const approval = makeApprovalEvent({
      id: "sort-approval",
      tags: [
        ["e", "post-x"],
        ["e", "post-y"],
        ["e", "post-z"],
      ],
      created_at: 100,
    });
    const postX = makeBaseEvent({
      id: "post-x",
      kind: 1111,
      created_at: 300,
      sig: "sig-x",
    });
    const postY = makeBaseEvent({
      id: "post-y",
      kind: 1111,
      created_at: 100,
      sig: "sig-y",
    });
    const postZ = makeBaseEvent({
      id: "post-z",
      kind: 1111,
      created_at: 200,
      sig: "sig-z",
    });

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce([approval])
        .mockResolvedValueOnce([postX, postY, postZ]),
    } as any;

    const result = await fetchCommunityPosts(nostr, makeCommunity() as any);

    expect(result.map((p) => p.id)).toEqual(["post-x", "post-z", "post-y"]);
  });

  it("falls back to combinedRelays for approval fetching when community has no explicit approval relays", async () => {
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn().mockReturnValue({ relays: [] }),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCommunityPosts } = await import("../fetch-service");

    const community = makeCommunity({
      relays: {
        approvals: [],
        requests: [],
        metadata: [],
        all: ["wss://all-relay.example"],
      },
    });

    const nostr = { fetch: jest.fn().mockResolvedValue([]) } as any;

    await fetchCommunityPosts(nostr, community as any);

    expect(nostr.fetch).toHaveBeenNthCalledWith(
      1,
      [expect.objectContaining({ kinds: [4550] })],
      {},
      ["wss://all-relay.example"]
    );
  });

  it("rejects and logs when nostr.fetch throws during the community posts fetch (lines 2301-2302)", async () => {
    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn().mockReturnValue({ relays: [] }),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));
    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchCommunityPosts } = await import("../fetch-service");

    const fetchError = new Error("approval fetch threw");
    const nostr = {
      fetch: jest.fn().mockRejectedValue(fetchError),
    } as any;

    const community = makeCommunity();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(fetchCommunityPosts(nostr, community as any)).rejects.toThrow(
      "approval fetch threw"
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch community posts:",
      fetchError
    );
    consoleErrorSpy.mockRestore();
  });
});
