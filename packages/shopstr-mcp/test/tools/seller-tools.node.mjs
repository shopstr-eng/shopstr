import assert from "node:assert/strict";
import test from "node:test";

import { nip19 } from "nostr-tools";

import { MemoryCache } from "../../dist/cache.js";
import { handleGetCompanyDetails } from "../../dist/tools/get-company-details.js";
import { handleGetSellerReputation } from "../../dist/tools/get-seller-reputation.js";
import { handleListCompanies } from "../../dist/tools/list-companies.js";
import { REVIEW_PRODUCT_FILTER_LIMIT } from "../../dist/tools/utils/common.js";
import {
  createPaginationCursor,
  createQueryFingerprint,
  decodePaginationCursor,
  hashPaginationLogicalIdentity,
} from "../../dist/tools/utils/pagination-cursor.js";

const hex = (char) => char.repeat(64);
const sellerPubkey = hex("8");
const reviewerPubkey = hex("7");
const productAddress = `30402:${sellerPubkey}:coffee`;

function profileEvent(overrides = {}) {
  return {
    id: hex("1"),
    pubkey: sellerPubkey,
    created_at: 100,
    kind: 0,
    tags: [],
    content: JSON.stringify({
      name: "Fresh Seller",
      display_name: "Fresh Seller",
      about: "Public seller profile",
      website: "https://example.com",
    }),
    sig: "a".repeat(128),
    ...overrides,
  };
}

function shopEvent(overrides = {}) {
  return {
    id: hex("2"),
    pubkey: sellerPubkey,
    created_at: 120,
    kind: 30019,
    tags: [],
    content: JSON.stringify({
      name: "Fresh Shop",
      about: "Relay-native storefront",
      storefront: {
        shopSlug: "fresh-shop",
        productLayout: "grid",
      },
      freeShippingThreshold: 100,
      freeShippingCurrency: "USD",
    }),
    sig: "b".repeat(128),
    ...overrides,
  };
}

function productEvent(overrides = {}) {
  return {
    id: hex("3"),
    pubkey: sellerPubkey,
    created_at: 130,
    kind: 30402,
    tags: [
      ["d", "coffee"],
      ["title", "Coffee Beans"],
      ["summary", "Washed process coffee"],
      ["price", "25", "USD"],
      ["shipping", "Free", "0", "USD"],
      ["t", "Coffee"],
    ],
    content: "",
    sig: "c".repeat(128),
    ...overrides,
  };
}

function reviewEvent(overrides = {}) {
  return {
    id: hex("4"),
    pubkey: reviewerPubkey,
    created_at: 140,
    kind: 31555,
    tags: [
      ["d", `a:${productAddress}`],
      ["rating", "1", "thumb"],
      ["rating", "0.8", "quality"],
    ],
    content: "Fast shipping and good product.",
    sig: "d".repeat(128),
    ...overrides,
  };
}

function context(fetchImpl, cache = new MemoryCache(60_000)) {
  const calls = [];
  return {
    calls,
    relays: ["wss://relay.example.com"],
    timeoutMs: 100,
    cache,
    categoryCache: new MemoryCache(60_000),
    maxConcurrentRequests: 10,
    nostr: {
      async fetch(filters) {
        calls.push(filters);
        return fetchImpl(filters);
      },
    },
  };
}

function sellerFetch(filters) {
  if (
    filters.some((filter) =>
      filter.kinds?.some((kind) => kind === 0 || kind === 30019)
    )
  ) {
    return [profileEvent(), shopEvent()];
  }
  if (filters.some((filter) => filter.kinds?.includes(30402))) {
    return [productEvent()];
  }
  if (filters.some((filter) => filter.kinds?.includes(31555))) {
    return [reviewEvent()];
  }
  return [];
}

// ─── list_companies ──────────────────────────────────────────────────

test("list_companies fetches latest public shop profiles and budgets results", async () => {
  const response = await handleListCompanies(
    { limit: 1 },
    context(() => [
      shopEvent({
        id: hex("5"),
        created_at: 80,
        content: JSON.stringify({ name: "Old Shop" }),
      }),
      shopEvent(),
      shopEvent({
        id: hex("6"),
        pubkey: hex("9"),
        created_at: 110,
        content: JSON.stringify({ name: "Second Shop" }),
      }),
    ])
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, undefined);
  assert.equal(body.count, 1);
  assert.equal(body.totalMatches, 2);
  assert.equal(body.companies[0].name, "Fresh Shop");
  assert.equal(body._meta._truncated, true);
});

test("list_companies traverses two pages with an opaque cursor", async () => {
  const events = [
    shopEvent({ id: hex("1"), created_at: 100 }),
    shopEvent({ id: hex("2"), pubkey: hex("9"), created_at: 99 }),
    shopEvent({ id: hex("3"), pubkey: hex("a"), created_at: 98 }),
  ];
  const filters = [];
  const ctx = context((requestFilters) => {
    filters.push(requestFilters);
    return events.filter(
      (event) =>
        requestFilters[0].until === undefined ||
        event.created_at <= requestFilters[0].until
    );
  });

  const first = JSON.parse(
    (await handleListCompanies({ limit: 2 }, ctx)).content[0].text
  );
  assert.deepEqual(
    first.companies.map((company) => company.pubkey),
    [sellerPubkey, hex("9")]
  );
  assert.equal(first._pagination.hasMore, true);
  assert.equal(typeof first._pagination.nextCursor, "string");
  assert.equal(first._pagination.oldestCreatedAt, undefined);

  const second = JSON.parse(
    (
      await handleListCompanies(
        { limit: 2, cursor: first._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );
  assert.deepEqual(
    second.companies.map((company) => company.pubkey),
    [hex("a")]
  );
  assert.equal(second._pagination.hasMore, false);
  assert.equal(second._pagination.nextCursor, null);
  assert.equal(filters[1][0].until, 99);
});

test("list_companies preserves same-timestamp profiles without duplicates", async () => {
  const events = [
    shopEvent({ id: hex("1"), created_at: 100 }),
    shopEvent({ id: hex("2"), pubkey: hex("9"), created_at: 100 }),
    shopEvent({ id: hex("3"), pubkey: hex("a"), created_at: 99 }),
  ];
  const ctx = context(() => events);

  const first = JSON.parse(
    (await handleListCompanies({ limit: 1 }, ctx)).content[0].text
  );
  const second = JSON.parse(
    (
      await handleListCompanies(
        { limit: 1, cursor: first._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );
  const third = JSON.parse(
    (
      await handleListCompanies(
        { limit: 1, cursor: second._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );

  assert.deepEqual(
    [first, second, third].flatMap((page) =>
      page.companies.map((company) => company.pubkey)
    ),
    [sellerPubkey, hex("9"), hex("a")]
  );
  assert.equal(third._pagination.nextCursor, null);
});

test("list_companies never resurfaces a stale profile revision after its seller was consumed", async () => {
  const firstSeller = hex("1");
  const secondSeller = hex("2");
  const latest = shopEvent({
    id: hex("3"),
    pubkey: firstSeller,
    created_at: 100,
  });
  const other = shopEvent({
    id: hex("4"),
    pubkey: secondSeller,
    created_at: 99,
  });
  const stale = shopEvent({
    id: hex("5"),
    pubkey: firstSeller,
    created_at: 98,
  });
  const thirdSeller = shopEvent({
    id: hex("6"),
    pubkey: hex("6"),
    created_at: 97,
  });
  let fetchCount = 0;
  const ctx = context(() => {
    fetchCount += 1;
    if (fetchCount === 1) return [latest, other];
    if (fetchCount === 2) return [other, stale, thirdSeller];
    return [stale];
  });

  const first = JSON.parse(
    (await handleListCompanies({ limit: 1 }, ctx)).content[0].text
  );
  const second = JSON.parse(
    (
      await handleListCompanies(
        { limit: 1, cursor: first._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );
  const third = JSON.parse(
    (
      await handleListCompanies(
        { limit: 1, cursor: second._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );

  assert.deepEqual(
    [first, second, third].flatMap((page) =>
      page.companies.map((company) => company.pubkey)
    ),
    [firstSeller, secondSeller]
  );
  assert.equal(third._pagination.nextCursor, null);
});

test("list_companies rejects malformed and mismatched cursors before relay work", async () => {
  const ctx = context(() => {
    throw new Error("cursor validation must precede relay work");
  });

  const malformed = await handleListCompanies({ cursor: "malformed" }, ctx);
  const malformedBody = JSON.parse(malformed.content[0].text);
  assert.equal(malformedBody.errorCode, "VALIDATION_ERROR");
  assert.equal(malformedBody.retryable, false);

  const mismatchedCursor = createPaginationCursor({
    tool: "list_companies",
    query: createQueryFingerprint("list_companies", ["coffee", 1]),
    boundary: 100,
    seen: [],
  });
  const mismatched = await handleListCompanies(
    { category: "tea", limit: 1, cursor: mismatchedCursor },
    ctx
  );
  const mismatchedBody = JSON.parse(mismatched.content[0].text);
  assert.equal(mismatchedBody.errorCode, "VALIDATION_ERROR");
  assert.equal(mismatchedBody.retryable, false);
  assert.equal(ctx.calls.length, 0);
});

test("list_companies rejects cursors when the effective response limit changes", async () => {
  const cursor = createPaginationCursor({
    tool: "list_companies",
    query: createQueryFingerprint("list_companies", ["coffee", 1]),
    boundary: 100,
    seen: [],
  });
  const ctx = context(() => {
    throw new Error("cursor validation must precede relay work");
  });

  const response = await handleListCompanies(
    { category: "coffee", limit: 2, cursor },
    ctx
  );
  const body = JSON.parse(response.content[0].text);
  assert.equal(body.errorCode, "VALIDATION_ERROR");
  assert.equal(body.retryable, false);
  assert.equal(ctx.calls.length, 0);
});

test("list_companies fingerprints normalized categories", async () => {
  const cursor = createPaginationCursor({
    tool: "list_companies",
    query: createQueryFingerprint("list_companies", ["coffee", 1]),
    boundary: 100,
    seen: [],
  });
  const ctx = context((filters) => {
    if (filters.some((filter) => filter.kinds?.includes(30019))) {
      return [shopEvent({ created_at: 100 })];
    }
    return [productEvent()];
  });

  const response = await handleListCompanies(
    { category: "  COFFEE  ", limit: 1, cursor },
    ctx
  );
  const body = JSON.parse(response.content[0].text);
  assert.equal(response.isError, undefined);
  assert.equal(body.count, 1);
});

test("list_companies advances sparse category windows from the oldest raw profile", async () => {
  const firstSeller = hex("1");
  const secondSeller = hex("2");
  const initialWindow = Array.from({ length: 500 }, (_, index) =>
    shopEvent({
      id: (index + 1).toString(16).padStart(64, "0"),
      pubkey: firstSeller,
      created_at: 1_000 - index,
    })
  );
  const olderWindow = [
    shopEvent({ id: hex("f"), pubkey: secondSeller, created_at: 500 }),
  ];
  const profileFilters = [];
  const ctx = context((filters) => {
    if (filters.some((filter) => filter.kinds?.includes(30019))) {
      profileFilters.push(filters);
      return filters[0].until === undefined ? initialWindow : olderWindow;
    }
    return [
      productEvent({ pubkey: firstSeller }),
      productEvent({ id: hex("e"), pubkey: secondSeller }),
    ];
  });

  const first = JSON.parse(
    (await handleListCompanies({ category: "coffee", limit: 1 }, ctx))
      .content[0].text
  );
  assert.equal(first.companies[0].pubkey, firstSeller);
  assert.equal(first._pagination.hasMore, true);

  const second = JSON.parse(
    (
      await handleListCompanies(
        { category: "coffee", limit: 1, cursor: first._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );
  assert.equal(second.companies[0].pubkey, secondSeller);
  assert.equal(profileFilters[1][0].until, 501);
});

test("list_companies does not overfill cursor seen ids for a large sparse category window", async () => {
  const firstSeller = hex("1");
  const olderSeller = hex("2");
  const initialWindow = Array.from({ length: 500 }, (_, index) =>
    shopEvent({
      id: (index + 1).toString(16).padStart(64, "0"),
      pubkey: (index + 20).toString(16).padStart(64, "0"),
      created_at: 1_000 - index,
    })
  );
  initialWindow[0] = shopEvent({
    id: hex("1"),
    pubkey: firstSeller,
    created_at: 1_000,
  });
  const olderWindow = [
    shopEvent({ id: hex("f"), pubkey: olderSeller, created_at: 500 }),
  ];
  const profileFilters = [];
  const ctx = context((filters) => {
    if (filters.some((filter) => filter.kinds?.includes(30019))) {
      profileFilters.push(filters);
      return filters[0].until === undefined ? initialWindow : olderWindow;
    }
    return [
      productEvent({ pubkey: firstSeller }),
      productEvent({ id: hex("e"), pubkey: olderSeller }),
    ];
  });

  const first = JSON.parse(
    (await handleListCompanies({ category: "coffee", limit: 1 }, ctx))
      .content[0].text
  );
  const decodedCursor = decodePaginationCursor(first._pagination.nextCursor, {
    tool: "list_companies",
    query: createQueryFingerprint("list_companies", ["coffee", 1]),
  });
  const second = JSON.parse(
    (
      await handleListCompanies(
        { category: "coffee", limit: 1, cursor: first._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );

  assert.equal(first.count, 1);
  assert.equal(first.companies[0].pubkey, firstSeller);
  assert.equal(first._pagination.hasMore, true);
  assert.equal(decodedCursor.boundary, 501);
  assert.ok(decodedCursor.seen.length <= 2);
  assert.equal(profileFilters[1][0].until, 501);
  assert.equal(second.companies[0].pubkey, olderSeller);
});

test("list_companies advances from the newest saturated relay boundary", async () => {
  const saturatedRelay = "wss://saturated.example.com";
  const olderUnsaturatedRelay = "wss://older.example.com";
  const saturatedSeller = hex("1");
  const oldUnsaturatedSeller = hex("2");
  const olderMatchingSeller = hex("3");
  const saturatedWindow = Array.from({ length: 500 }, (_, index) =>
    shopEvent({
      id: (index + 1).toString(16).padStart(64, "0"),
      pubkey: saturatedSeller,
      created_at: 1_000 - index,
    })
  );
  const oldUnsaturatedProfile = shopEvent({
    id: hex("e"),
    pubkey: oldUnsaturatedSeller,
    created_at: 50,
  });
  const olderMatchingProfile = shopEvent({
    id: hex("f"),
    pubkey: olderMatchingSeller,
    created_at: 500,
  });
  const profileRequests = [];
  const ctx = {
    ...context(() => []),
    relays: [saturatedRelay, olderUnsaturatedRelay],
    nostr: {
      async fetch(filters, _params, relayUrls) {
        const relay = relayUrls[0];
        if (filters.some((filter) => filter.kinds?.includes(30402))) {
          return [
            productEvent({ id: hex("d"), pubkey: oldUnsaturatedSeller }),
            productEvent({ id: hex("c"), pubkey: olderMatchingSeller }),
          ];
        }
        profileRequests.push({ relay, until: filters[0].until });
        if (relay === saturatedRelay) {
          if (filters[0].until === undefined) return saturatedWindow;
          return filters[0].until === 501 ? [olderMatchingProfile] : [];
        }
        return [oldUnsaturatedProfile];
      },
    },
  };

  const first = JSON.parse(
    (await handleListCompanies({ category: "coffee", limit: 1 }, ctx))
      .content[0].text
  );
  const second = JSON.parse(
    (
      await handleListCompanies(
        {
          category: "coffee",
          limit: 1,
          cursor: first._pagination.nextCursor,
        },
        ctx
      )
    ).content[0].text
  );
  const third = JSON.parse(
    (
      await handleListCompanies(
        {
          category: "coffee",
          limit: 1,
          cursor: second._pagination.nextCursor,
        },
        ctx
      )
    ).content[0].text
  );

  assert.equal(first.count, 0);
  assert.equal(first._pagination.hasMore, true);
  assert.equal(
    profileRequests.find(
      (request) =>
        request.relay === saturatedRelay && request.until !== undefined
    )?.until,
    501
  );
  assert.equal(second.companies[0].pubkey, olderMatchingSeller);
  assert.equal(third.companies[0].pubkey, oldUnsaturatedSeller);
});

test("list_companies advances from a saturated continuation window containing only consumed revisions", async () => {
  const consumedSeller = hex("1");
  const olderSeller = hex("2");
  const cursor = createPaginationCursor({
    tool: "list_companies",
    query: createQueryFingerprint("list_companies", [undefined, 1]),
    boundary: 100,
    seen: [hashPaginationLogicalIdentity(`30019:${consumedSeller}`)],
  });
  const consumedRevisions = Array.from({ length: 6 }, (_, index) =>
    shopEvent({
      id: (index + 1).toString(16).padStart(64, "0"),
      pubkey: consumedSeller,
      created_at: 99 - index,
    })
  );
  const olderProfile = shopEvent({
    id: hex("f"),
    pubkey: olderSeller,
    created_at: 93,
  });
  const profileFilters = [];
  const ctx = context((filters) => {
    profileFilters.push(filters);
    return filters[0].until === 100 ? consumedRevisions : [olderProfile];
  });

  const emptyPage = JSON.parse(
    (await handleListCompanies({ limit: 1, cursor }, ctx)).content[0].text
  );
  const olderPage = JSON.parse(
    (
      await handleListCompanies(
        {
          limit: 1,
          cursor: emptyPage._pagination.nextCursor,
        },
        ctx
      )
    ).content[0].text
  );

  assert.equal(emptyPage.count, 0);
  assert.equal(emptyPage._pagination.hasMore, true);
  assert.equal(profileFilters[1][0].until, 94);
  assert.equal(olderPage.companies[0].pubkey, olderSeller);
});

test("list_companies fails closed when a sparse window needs more logical cursor keys than allowed", async () => {
  const initialWindow = Array.from({ length: 500 }, (_, index) =>
    shopEvent({
      id: (index + 1).toString(16).padStart(64, "0"),
      pubkey: (index + 16).toString(16).padStart(64, "a"),
      created_at: 100,
    })
  );
  const ctx = context((filters) =>
    filters.some((filter) => filter.kinds?.includes(30019)) ? initialWindow : []
  );

  const response = await handleListCompanies(
    { category: "coffee", limit: 1 },
    ctx
  );
  const body = JSON.parse(response.content[0].text);
  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "PAGINATION_LIMIT");
  assert.equal(body.retryable, false);
  assert.equal(ctx.calls.length, 2);
  assert.equal(body._pagination, undefined);
});

test("list_companies does not treat aggregate sparse profile counts as saturation", async () => {
  const makeProfiles = (offset) =>
    Array.from({ length: 499 }, (_, index) =>
      shopEvent({
        id: (offset + index).toString(16).padStart(64, "0"),
        pubkey: (offset + index).toString(16).padStart(64, "b"),
        created_at: 1_000 - offset - index,
      })
    );
  const firstRelay = "wss://first.example.com";
  const secondRelay = "wss://second.example.com";
  const ctx = {
    ...context(() => []),
    relays: [firstRelay, secondRelay],
    nostr: {
      async fetch(filters, _params, relayUrls) {
        if (filters.some((filter) => filter.kinds?.includes(30402))) return [];
        return relayUrls[0] === firstRelay
          ? makeProfiles(1)
          : makeProfiles(600);
      },
    },
  };

  const body = JSON.parse(
    (await handleListCompanies({ category: "coffee", limit: 1 }, ctx))
      .content[0].text
  );
  assert.equal(body.count, 0);
  assert.equal(body._pagination.hasMore, false);
  assert.equal(body._pagination.nextCursor, null);
});

test("list_companies returns null nextCursor when empty", async () => {
  const response = await handleListCompanies(
    { limit: 10 },
    context(() => [])
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.count, 0);
  assert.equal(body._pagination.nextCursor, null);
});

test("list_companies filters sellers by a public product category with one batched query", async () => {
  const otherSeller = hex("9");
  const ctx = context((filters) => {
    if (filters.some((filter) => filter.kinds?.includes(30019))) {
      return [
        shopEvent(),
        shopEvent({
          id: hex("9"),
          pubkey: otherSeller,
          content: JSON.stringify({ name: "Other Shop" }),
        }),
      ];
    }
    if (filters.some((filter) => filter.kinds?.includes(30402))) {
      return [
        productEvent({
          tags: [
            ["d", "coffee"],
            ["title", "Coffee Beans"],
            ["t", "Coffee"],
          ],
        }),
        productEvent({
          id: hex("9"),
          pubkey: otherSeller,
          tags: [
            ["d", "tea"],
            ["title", "Hidden Tea"],
            ["t", "Coffee"],
            ["visibility", "hidden"],
          ],
        }),
      ];
    }
    return [];
  });

  const response = await handleListCompanies({ category: "coffee" }, ctx);
  const body = JSON.parse(response.content[0].text);
  const productFetchCount = ctx.calls.filter((filters) =>
    filters.some((filter) => filter.kinds?.includes(30402))
  ).length;

  assert.equal(body.count, 1);
  assert.equal(body.companies[0].pubkey, sellerPubkey);
  assert.equal(productFetchCount, 1);
});

// ─── get_company_details ─────────────────────────────────────────────

test("get_company_details merges profiles, products, reviews, and cache metadata", async () => {
  const cache = new MemoryCache(60_000);
  const ctx = context(sellerFetch, cache);

  const first = await handleGetCompanyDetails({ sellerPubkey }, ctx);
  const firstBody = JSON.parse(first.content[0].text);

  assert.equal(firstBody.sellerPubkey, sellerPubkey);
  assert.equal(firstBody.shopProfile.name, "Fresh Shop");
  assert.equal(firstBody.shopProfile.storefrontUrl, "/shop/fresh-shop");
  assert.equal(firstBody.userProfile.name, "Fresh Seller");
  assert.equal(firstBody.userProfile.displayName, "Fresh Seller");
  assert.equal(firstBody.products.count, 1);
  assert.equal(firstBody.products.items[0].title, "Coffee Beans");
  assert.equal(firstBody.reviews.count, 1);
  assert.deepEqual(firstBody.paymentInfo.acceptedPaymentMethods, [
    "lightning",
    "cashu",
  ]);
  assert.equal(firstBody.paymentInfo.freeShippingAvailable, true);
  assert.deepEqual(firstBody._meta.cached, {
    userProfile: false,
    shopProfile: false,
    userNip05Verification: false,
    shopNip05Verification: false,
    products: false,
    reviews: false,
  });

  const profileFetchesBefore = ctx.calls.filter((filters) =>
    filters.some((filter) =>
      filter.kinds?.some((kind) => kind === 0 || kind === 30019)
    )
  ).length;
  const second = await handleGetCompanyDetails({ sellerPubkey }, ctx);
  const secondBody = JSON.parse(second.content[0].text);
  const profileFetchesAfter = ctx.calls.filter((filters) =>
    filters.some((filter) =>
      filter.kinds?.some((kind) => kind === 0 || kind === 30019)
    )
  ).length;

  assert.equal(profileFetchesAfter, profileFetchesBefore);
  assert.deepEqual(secondBody._meta.cached, {
    userProfile: true,
    shopProfile: true,
    userNip05Verification: false,
    shopNip05Verification: false,
    products: true,
    reviews: true,
  });
});

test("get_company_details verifies and caches NIP-05 claims from seller profiles", async () => {
  const cache = new MemoryCache(60_000);
  const verifierCalls = [];
  const ctx = {
    ...context((filters) => {
      if (
        filters.some((filter) =>
          filter.kinds?.some((kind) => kind === 0 || kind === 30019)
        )
      ) {
        return [
          profileEvent({
            content: JSON.stringify({
              name: "Fresh Seller",
              nip05: "seller@example.com",
            }),
          }),
          shopEvent({
            content: JSON.stringify({
              name: "Fresh Shop",
              nip05: "shop@example.com",
            }),
          }),
        ];
      }
      return [];
    }, cache),
    nip05Verifier: async (claimed, pubkey) => {
      verifierCalls.push([claimed, pubkey]);
      return {
        attempted: true,
        verified: claimed === "seller@example.com",
        claimed,
        checkedAt: "2024-01-01T00:00:00.000Z",
        ...(claimed === "seller@example.com"
          ? {}
          : { error: "pubkey_mismatch" }),
      };
    },
  };

  const first = JSON.parse(
    (await handleGetCompanyDetails({ sellerPubkey, include: [] }, ctx))
      .content[0].text
  );
  const second = JSON.parse(
    (await handleGetCompanyDetails({ sellerPubkey, include: [] }, ctx))
      .content[0].text
  );

  assert.deepEqual(verifierCalls, [
    ["seller@example.com", sellerPubkey],
    ["shop@example.com", sellerPubkey],
  ]);
  assert.equal(first.nip05Verification.userProfile.verified, true);
  assert.equal(first.nip05Verification.shopProfile.verified, false);
  assert.equal(second.nip05Verification.userProfile.verified, true);
  assert.equal(second._meta.cached.userNip05Verification, true);
  assert.equal(second._meta.cached.shopNip05Verification, true);
});

test("get_company_details always includes storefront and can skip product/review fetches", async () => {
  const ctx = context((filters) => {
    assert.equal(
      filters.some((filter) => filter.kinds?.includes(30402)),
      false
    );
    assert.equal(
      filters.some((filter) => filter.kinds?.includes(31555)),
      false
    );
    return [profileEvent(), shopEvent()];
  });

  const response = await handleGetCompanyDetails(
    { sellerPubkey, include: [] },
    ctx
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.storefront.shopSlug, "fresh-shop");
  assert.equal(body.storefront.storefrontUrl, "/shop/fresh-shop");
  assert.equal(body.products, undefined);
  assert.equal(body.reviews, undefined);
  assert.equal(body.paymentInfo, undefined);
});

test("get_company_details hints when review lookup is partial", async () => {
  const products = Array.from({ length: 21 }, (_, index) =>
    productEvent({
      id: (index + 1).toString(16).padStart(64, "0"),
      created_at: 130 + index,
      tags: [
        ["d", `item-${index}`],
        ["title", `Product ${index}`],
        ["summary", "Product beyond review scan cap"],
        ["price", "25", "USD"],
      ],
    })
  );
  const response = await handleGetCompanyDetails(
    { sellerPubkey },
    context((filters) => {
      if (
        filters.some((filter) =>
          filter.kinds?.some((kind) => kind === 0 || kind === 30019)
        )
      ) {
        return [profileEvent(), shopEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(30402))) {
        return products;
      }
      if (filters.some((filter) => filter.kinds?.includes(31555))) {
        return [];
      }
      return [];
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, undefined);
  assert.equal(body.products.totalMatches, 21);
  assert.equal(body.reviewCoverage, "partial");
});

test("get_company_details excludes hidden products and keeps mixed-currency price ranges explicit", async () => {
  const response = await handleGetCompanyDetails(
    { sellerPubkey },
    context((filters) => {
      if (
        filters.some((filter) =>
          filter.kinds?.some((kind) => kind === 0 || kind === 30019)
        )
      ) {
        return [profileEvent(), shopEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(30402))) {
        return [
          productEvent({
            id: hex("a"),
            tags: [
              ["d", "coffee-usd"],
              ["title", "Coffee USD"],
              ["price", "25", "USD"],
            ],
          }),
          productEvent({
            id: hex("b"),
            tags: [
              ["d", "coffee-eur"],
              ["title", "Coffee EUR"],
              ["price", "20", "EUR"],
            ],
          }),
          productEvent({
            id: hex("c"),
            tags: [
              ["d", "hidden-coffee"],
              ["title", "Hidden Coffee"],
              ["price", "15", "USD"],
              ["visibility", "hidden"],
            ],
          }),
        ];
      }
      if (filters.some((filter) => filter.kinds?.includes(31555))) {
        return [
          reviewEvent({
            id: hex("d"),
            tags: [
              ["d", `a:30402:${sellerPubkey}:hidden-coffee`],
              ["rating", "1", "thumb"],
            ],
            content: "Hidden product review should not be public.",
          }),
        ];
      }
      return [];
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, undefined);
  assert.equal(body.products.count, 2);
  assert.deepEqual(body.products.items.map((product) => product.title).sort(), [
    "Coffee EUR",
    "Coffee USD",
  ]);
  assert.equal(body.reviews.count, 0);
  assert.equal(body.reviews.totalMatches, 0);
  assert.equal(body.paymentInfo.priceRange, null);
  assert.deepEqual(
    body.paymentInfo.priceRanges
      .map((range) => ({
        currency: range.currency,
        min: range.min,
        max: range.max,
        count: range.count,
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    [
      { currency: "EUR", min: 20, max: 20, count: 1 },
      { currency: "USD", min: 25, max: 25, count: 1 },
    ]
  );
});

test("get_company_details can return cached profiles when product and review relay fetches degrade", async () => {
  const cache = new MemoryCache(60_000);
  const warmContext = context(sellerFetch, cache);
  const warmResponse = await handleGetCompanyDetails(
    { sellerPubkey },
    warmContext
  );
  assert.equal(warmResponse.isError, undefined);

  const degradedContext = context(() => {
    throw new Error("relay down");
  }, cache);
  const response = await handleGetCompanyDetails(
    { sellerPubkey },
    degradedContext
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, undefined);
  assert.equal(body.shopProfile.name, "Fresh Shop");
  assert.equal(body.userProfile.name, "Fresh Seller");
  assert.equal(body.products.count, 1);
  assert.equal(body.reviews.count, 1);
  assert.equal(body._meta.degraded, false);
  assert.deepEqual(body._meta.cached, {
    userProfile: true,
    shopProfile: true,
    userNip05Verification: false,
    shopNip05Verification: false,
    products: true,
    reviews: true,
  });
});

test("get_company_details accepts npub input via pubkeySchema", async () => {
  const npub = nip19.npubEncode(sellerPubkey);
  const response = await handleGetCompanyDetails(
    { sellerPubkey: npub },
    context(sellerFetch)
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.sellerPubkey, sellerPubkey);
  assert.equal(body.shopProfile.name, "Fresh Shop");
});

test("get_company_details returns NOT_FOUND for unknown pubkey", async () => {
  const response = await handleGetCompanyDetails(
    { sellerPubkey: hex("f") },
    context(() => [])
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "NOT_FOUND");
});

test("get_company_details rejects invalid pubkey", async () => {
  const response = await handleGetCompanyDetails(
    { sellerPubkey: "not-a-valid-key" },
    context(() => [])
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "VALIDATION_ERROR");
});

// ─── get_seller_reputation ───────────────────────────────────────────

test("get_seller_reputation summarizes public review scores", async () => {
  const response = await handleGetSellerReputation(
    { sellerPubkey },
    context((filters) => {
      if (
        filters.some((filter) =>
          filter.kinds?.some((kind) => kind === 0 || kind === 30019)
        )
      ) {
        return [profileEvent(), shopEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(30402))) {
        return [productEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(31555))) {
        return [
          reviewEvent(),
          reviewEvent({
            id: hex("5"),
            pubkey: hex("6"),
            created_at: 150,
            tags: [
              ["d", `a:${productAddress}`],
              ["rating", "0", "thumb"],
              ["rating", "0.2", "quality"],
            ],
            content: "Poor communication.",
          }),
        ];
      }
      return [];
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.reviewCount, 2);
  assert.equal(body.productCount, 1);
  assert.deepEqual(body.seller.nip05Verification, {
    userProfile: null,
    shopProfile: null,
  });
  assert.equal(body.reputation.averageScore, 0.5);
  assert.equal(body.reputation.averagePercent, 50);
  assert.equal(body.reputation.positiveReviewCount, 1);
  assert.equal(body.reputation.negativeReviewCount, 1);
  assert.equal(body.reputation.trustLevel, "low");
  assert.deepEqual(body.reputation.ratingBreakdown.thumb, {
    average: 0.5,
    count: 2,
  });
  assert.equal(body.recentReviews.length, 2);
});

test("get_seller_reputation ignores reviews for hidden products", async () => {
  const response = await handleGetSellerReputation(
    { sellerPubkey },
    context((filters) => {
      if (
        filters.some((filter) =>
          filter.kinds?.some((kind) => kind === 0 || kind === 30019)
        )
      ) {
        return [profileEvent(), shopEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(30402))) {
        return [
          productEvent({
            id: hex("a"),
            tags: [
              ["d", "coffee"],
              ["title", "Coffee Beans"],
              ["price", "25", "USD"],
            ],
          }),
          productEvent({
            id: hex("c"),
            tags: [
              ["d", "hidden-coffee"],
              ["title", "Hidden Coffee"],
              ["price", "15", "USD"],
              ["visibility", "hidden"],
            ],
          }),
        ];
      }
      if (filters.some((filter) => filter.kinds?.includes(31555))) {
        return [
          reviewEvent({
            id: hex("d"),
            tags: [
              ["d", `a:30402:${sellerPubkey}:hidden-coffee`],
              ["rating", "1", "thumb"],
            ],
            content: "Hidden product review should not affect reputation.",
          }),
        ];
      }
      return [];
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, undefined);
  assert.equal(body.productCount, 1);
  assert.equal(body.reviewCount, 0);
  assert.equal(body.recentReviews.length, 0);
  assert.equal(body.reputation.averageScore, null);
  assert.equal(body.reputation.trustLevel, "unknown");
});

test("get_seller_reputation treats reviews with no ratings as unknown reputation", async () => {
  const response = await handleGetSellerReputation(
    { sellerPubkey },
    context((filters) => {
      if (
        filters.some((filter) =>
          filter.kinds?.some((kind) => kind === 0 || kind === 30019)
        )
      ) {
        return [profileEvent(), shopEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(30402))) {
        return [productEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(31555))) {
        return [
          reviewEvent({
            id: hex("a"),
            pubkey: hex("1"),
            tags: [["d", `a:${productAddress}`]],
          }),
          reviewEvent({
            id: hex("b"),
            pubkey: hex("2"),
            tags: [["d", `a:${productAddress}`]],
          }),
        ];
      }
      return [];
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.reviewCount, 2);
  assert.equal(body.reputation.averageScore, null);
  assert.equal(body.reputation.averagePercent, null);
  assert.deepEqual(body.reputation.ratingBreakdown, {});
  assert.equal(body.reputation.positiveReviewCount, 0);
  assert.equal(body.reputation.neutralReviewCount, 0);
  assert.equal(body.reputation.negativeReviewCount, 0);
  assert.equal(body.reputation.trustLevel, "unknown");
});

test("get_seller_reputation keeps a single positive review at low trust", async () => {
  const response = await handleGetSellerReputation(
    { sellerPubkey },
    context((filters) => {
      if (
        filters.some((filter) =>
          filter.kinds?.some((kind) => kind === 0 || kind === 30019)
        )
      ) {
        return [profileEvent(), shopEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(30402))) {
        return [productEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(31555))) {
        return [
          reviewEvent({
            tags: [
              ["d", `a:${productAddress}`],
              ["rating", "1", "thumb"],
            ],
          }),
        ];
      }
      return [];
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.reviewCount, 1);
  assert.equal(body.reputation.averageScore, 1);
  assert.equal(body.reputation.averagePercent, 100);
  assert.equal(body.reputation.positiveReviewCount, 1);
  assert.equal(body.reputation.trustLevel, "low");
});

test("get_seller_reputation does not let unrated reviews inflate trust confidence", async () => {
  const reviews = Array.from({ length: 5 }, (_, index) =>
    reviewEvent({
      id: (index + 1).toString(16).padStart(64, "0"),
      pubkey: (index + 10).toString(16).padStart(64, "0"),
      tags:
        index === 0
          ? [
              ["d", `a:${productAddress}`],
              ["rating", "1", "thumb"],
            ]
          : [["d", `a:${productAddress}`]],
    })
  );
  const response = await handleGetSellerReputation(
    { sellerPubkey },
    context((filters) => {
      if (
        filters.some((filter) =>
          filter.kinds?.some((kind) => kind === 0 || kind === 30019)
        )
      ) {
        return [profileEvent(), shopEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(30402))) {
        return [productEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(31555))) {
        return reviews;
      }
      return [];
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.reviewCount, 5);
  assert.equal(body.reputation.averageScore, 1);
  assert.equal(body.reputation.positiveReviewCount, 1);
  assert.equal(body.reputation.trustLevel, "low");
});

test("get_seller_reputation marks exactly five reviews at 0.8 average as high trust", async () => {
  const reviews = ["1", "2", "3", "4", "5"].map((char) =>
    reviewEvent({
      id: hex(char),
      pubkey: hex(char),
      tags: [
        ["d", `a:${productAddress}`],
        ["rating", "0.8", "quality"],
      ],
    })
  );
  const response = await handleGetSellerReputation(
    { sellerPubkey },
    context((filters) => {
      if (
        filters.some((filter) =>
          filter.kinds?.some((kind) => kind === 0 || kind === 30019)
        )
      ) {
        return [profileEvent(), shopEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(30402))) {
        return [productEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(31555))) {
        return reviews;
      }
      return [];
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.reviewCount, 5);
  assert.equal(body.reputation.averageScore, 0.8);
  assert.equal(body.reputation.averagePercent, 80);
  assert.equal(body.reputation.positiveReviewCount, 5);
  assert.equal(body.reputation.trustLevel, "high");
});

test("get_seller_reputation includes oldestListingDate", async () => {
  const response = await handleGetSellerReputation(
    { sellerPubkey },
    context(sellerFetch)
  );
  const body = JSON.parse(response.content[0].text);

  assert.ok(body.oldestListingDate);
  assert.equal(body.oldestListingDate, new Date(130 * 1000).toISOString());
});

test("get_seller_reputation caps product-address review filters and reports partial lookup", async () => {
  const products = Array.from(
    { length: REVIEW_PRODUCT_FILTER_LIMIT + 5 },
    (_, index) =>
      productEvent({
        id: (index + 1).toString(16).padStart(64, "0"),
        created_at: 130 + index,
        tags: [
          ["d", `capped-item-${index}`],
          ["title", `Capped Product ${index}`],
          ["price", "25", "USD"],
        ],
      })
  );
  const ctx = context((filters) => {
    if (
      filters.some((filter) =>
        filter.kinds?.some((kind) => kind === 0 || kind === 30019)
      )
    ) {
      return [profileEvent(), shopEvent()];
    }
    if (filters.some((filter) => filter.kinds?.includes(30402))) {
      return products;
    }
    if (filters.some((filter) => filter.kinds?.includes(31555))) {
      return [];
    }
    return [];
  });

  const response = await handleGetSellerReputation({ sellerPubkey }, ctx);
  const body = JSON.parse(response.content[0].text);
  const reviewFilters = ctx.calls.find((filters) =>
    filters.some((filter) => filter.kinds?.includes(31555))
  );

  assert.equal(response.isError, undefined);
  assert.ok(reviewFilters);
  assert.equal(
    reviewFilters.filter((filter) => Array.isArray(filter["#d"])).length,
    REVIEW_PRODUCT_FILTER_LIMIT
  );
  assert.equal(
    reviewFilters.filter((filter) => Array.isArray(filter["#a"])).length,
    REVIEW_PRODUCT_FILTER_LIMIT
  );
  assert.equal(
    reviewFilters.some((filter) => filter["#p"]?.includes(sellerPubkey)),
    true
  );
  assert.equal(body.reviewCoverage, "partial");
});

test("get_seller_reputation returns NOT_FOUND for unknown seller", async () => {
  const response = await handleGetSellerReputation(
    { sellerPubkey: hex("f") },
    context(() => [])
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "NOT_FOUND");
});
