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
