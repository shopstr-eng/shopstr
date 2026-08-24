import assert from "node:assert/strict";
import test from "node:test";

import { handleGetReviews } from "../../dist/tools/get-reviews.js";
import { MemoryCache } from "../../dist/cache.js";
import { REVIEW_PRODUCT_FILTER_LIMIT } from "../../dist/tools/utils/common.js";
import {
  createPaginationCursor,
  createQueryFingerprint,
  decodePaginationCursor,
  hashPaginationLogicalIdentity,
} from "../../dist/tools/utils/pagination-cursor.js";

const hex = (char) => char.repeat(64);
const productId = hex("9");
const sellerPubkey = hex("8");
const productAddress = `30402:${sellerPubkey}:product-1`;

function reviewEvent(overrides = {}) {
  return {
    id: hex("a"),
    pubkey: hex("b"),
    created_at: 100,
    kind: 31555,
    tags: [
      ["d", `${hex("b")}:${productId}`],
      ["e", productId],
      ["rating", "5", "quality"],
    ],
    content: "Great product",
    sig: "c".repeat(128),
    ...overrides,
  };
}

function productEvent(overrides = {}) {
  return {
    id: productId,
    pubkey: sellerPubkey,
    created_at: 90,
    kind: 30402,
    tags: [["d", "product-1"]],
    content: "",
    sig: "d".repeat(128),
    ...overrides,
  };
}

function context(fetchImpl, cache = new MemoryCache(0)) {
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

test("get_reviews queries Gamma #d and standard #a product review models", async () => {
  const ctx = context((filters) => {
    if (filters.some((filter) => filter.kinds?.includes(30402))) {
      return [productEvent()];
    }

    return [
      reviewEvent({
        id: hex("1"),
        created_at: 10,
        tags: [
          ["d", `a:${productAddress}`],
          ["rating", "5", "quality"],
        ],
        content: "Old Gamma review",
      }),
      reviewEvent({
        id: hex("2"),
        created_at: 20,
        tags: [
          ["d", productAddress],
          ["a", productAddress],
          ["rating", "4", "quality"],
        ],
        content: "New standard review",
      }),
      reviewEvent({
        id: hex("3"),
        pubkey: hex("d"),
        created_at: 15,
        tags: [
          ["d", `a:${productAddress}`],
          ["rating", "4", "shipping"],
        ],
        content: "Second reviewer",
      }),
    ];
  });

  const response = await handleGetReviews({ productId }, ctx);
  const body = JSON.parse(response.content[0].text);
  const reviewFilters = ctx.calls[1];

  assert.equal(response.resultCount, 2);
  assert.equal(body.count, 2);
  assert.deepEqual(
    body.reviews.map((review) => review.id),
    [hex("2"), hex("3")]
  );
  assert.deepEqual(body.reviews[0].ratings, { quality: 4 });
  assert.equal(body.reviews[0].matchConfidence, undefined);
  assert.equal(body.reviews[1].matchConfidence, "legacy_fallback");
  assert.equal(body.ratingsSummary.averageScore, 1);
  assert.equal(
    reviewFilters.some((filter) =>
      filter["#d"]?.includes(`a:${productAddress}`)
    ),
    true
  );
  assert.equal(
    reviewFilters.some((filter) => filter["#a"]?.includes(productAddress)),
    true
  );
  assert.equal(
    reviewFilters.some((filter) => filter["#e"]?.includes(productId)),
    true
  );
});

test("get_reviews accepts productAddress without a product lookup", async () => {
  const ctx = context((filters) => {
    assert.equal(
      filters.some((filter) => filter.kinds?.includes(30402)),
      false
    );
    return [
      reviewEvent({
        id: hex("4"),
        tags: [
          ["d", `a:${productAddress}`],
          ["rating", "5", "quality"],
        ],
      }),
    ];
  });

  const response = await handleGetReviews(
    { productAddress: `a:${productAddress}` },
    ctx
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(ctx.calls.length, 1);
  assert.equal(body.count, 1);
  assert.equal(body.reviews[0].d, `a:${productAddress}`);
  assert.equal(body.reviews[0].matchConfidence, "legacy_fallback");
});

test("get_reviews resolves seller products and queries product-address reviews", async () => {
  const secondProductAddress = `30402:${sellerPubkey}:product-2`;
  const ctx = context((filters) => {
    if (filters.some((filter) => filter.authors?.includes(sellerPubkey))) {
      return [
        productEvent(),
        productEvent({
          id: hex("7"),
          tags: [["d", "product-2"]],
        }),
      ];
    }

    return [
      reviewEvent({
        id: hex("5"),
        tags: [
          ["d", `a:${productAddress}`],
          ["rating", "1", "thumb"],
        ],
      }),
      reviewEvent({
        id: hex("6"),
        tags: [
          ["d", `a:${secondProductAddress}`],
          ["rating", "0.5", "quality"],
        ],
      }),
    ];
  });

  const response = await handleGetReviews({ sellerPubkey }, ctx);
  const body = JSON.parse(response.content[0].text);
  const productFilters = ctx.calls[0];
  const reviewFilters = ctx.calls[1];

  assert.equal(
    productFilters.some((filter) => filter.authors?.includes(sellerPubkey)),
    true
  );
  assert.equal(
    reviewFilters.some((filter) =>
      filter["#d"]?.includes(`a:${productAddress}`)
    ),
    true
  );
  assert.equal(
    reviewFilters.some((filter) =>
      filter["#a"]?.includes(secondProductAddress)
    ),
    true
  );
  assert.equal(
    reviewFilters.some((filter) => filter["#p"]?.includes(sellerPubkey)),
    true
  );
  assert.equal(body.count, 2);
  assert.equal(body.reviewCoverage, "complete");
});

test("get_reviews requires productId, productAddress, or sellerPubkey", async () => {
  const response = await handleGetReviews(
    {},
    context(() => [])
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "VALIDATION_ERROR");
});

test("get_reviews reuses seller product and review caches on a second seller-only call", async () => {
  let productFetchCount = 0;
  let reviewFetchCount = 0;

  // Shared enabled cache (60s TTL) across both calls
  const cache = new MemoryCache(60_000);
  const fetchImpl = (filters) => {
    // Seller product resolution (kind 30402 by author)
    if (
      filters.some(
        (f) => f.authors?.includes(sellerPubkey) && f.kinds?.includes(30402)
      )
    ) {
      productFetchCount++;
      return [productEvent()];
    }
    // Review fetch
    reviewFetchCount++;
    return [
      reviewEvent({
        id: hex("5"),
        tags: [
          ["d", `a:${productAddress}`],
          ["rating", "4", "quality"],
        ],
      }),
    ];
  };

  const ctx = {
    relays: ["wss://relay.example.com"],
    timeoutMs: 100,
    cache,
    categoryCache: new MemoryCache(60_000),
    maxConcurrentRequests: 10,
    nostr: {
      async fetch(filters) {
        return fetchImpl(filters);
      },
    },
  };

  // First call: cache miss -> fetches seller's products from relay
  const first = await handleGetReviews({ sellerPubkey }, ctx);
  assert.equal(first.resultCount, 1);
  assert.equal(
    productFetchCount,
    1,
    "first call should fetch seller products from relay"
  );
  assert.equal(reviewFetchCount, 1);
  assert.deepEqual(JSON.parse(first.content[0].text)._meta.cached, {
    products: false,
    reviews: false,
  });

  // Second call: both seller product and seller review lists come from cache.
  const second = await handleGetReviews({ sellerPubkey }, ctx);
  assert.equal(second.resultCount, 1);
  assert.equal(
    productFetchCount,
    1,
    "second call should skip seller product fetch via cache"
  );
  assert.equal(
    reviewFetchCount,
    1,
    "second call should skip seller review fetch via cache"
  );
  assert.deepEqual(JSON.parse(second.content[0].text)._meta.cached, {
    products: true,
    reviews: true,
  });
});

test("get_reviews caps seller product-address filters and reports partial coverage", async () => {
  const products = Array.from(
    { length: REVIEW_PRODUCT_FILTER_LIMIT + 5 },
    (_, index) =>
      productEvent({
        id: (index + 1).toString(16).padStart(64, "0"),
        tags: [["d", `product-${index}`]],
      })
  );
  const ctx = context((filters) => {
    if (filters.some((filter) => filter.authors?.includes(sellerPubkey))) {
      return products;
    }
    return [];
  });

  const response = await handleGetReviews({ sellerPubkey }, ctx);
  const body = JSON.parse(response.content[0].text);
  const reviewFilters = ctx.calls[1];

  assert.equal(body.reviewCoverage, "partial");
  assert.equal(
    reviewFilters.filter((filter) => Array.isArray(filter["#d"])).length,
    REVIEW_PRODUCT_FILTER_LIMIT
  );
  assert.equal(
    reviewFilters.filter((filter) => Array.isArray(filter["#a"])).length,
    REVIEW_PRODUCT_FILTER_LIMIT
  );
});

test("get_reviews seller-only cursors traverse two cached pages", async () => {
  let productFetchCount = 0;
  let reviewFetchCount = 0;
  const ctx = context((filters) => {
    if (filters.some((filter) => filter.authors?.includes(sellerPubkey))) {
      productFetchCount += 1;
      return [productEvent()];
    }
    reviewFetchCount += 1;
    return Array.from({ length: 51 }, (_, index) =>
      reviewEvent({
        id: (index + 1).toString(16).padStart(64, "0"),
        pubkey: (index + 20).toString(16).padStart(64, "0"),
        created_at: 500 - index,
        tags: [
          ["d", `review-${index}`],
          ["a", productAddress],
          ["rating", "1", "thumb"],
        ],
      })
    );
  }, new MemoryCache(60_000));

  const first = JSON.parse(
    (await handleGetReviews({ sellerPubkey }, ctx)).content[0].text
  );
  const second = JSON.parse(
    (
      await handleGetReviews(
        { sellerPubkey, cursor: first._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );

  assert.equal(first.count, 50);
  assert.equal(first._pagination.hasMore, true);
  assert.equal(typeof first._pagination.nextCursor, "string");
  assert.equal(second.count, 1);
  assert.equal(second._pagination.hasMore, false);
  assert.equal(second._pagination.nextCursor, null);
  assert.equal(productFetchCount, 1);
  assert.equal(reviewFetchCount, 1);
  assert.deepEqual(second._meta.cached, {
    products: true,
    reviews: true,
  });
  assert.deepEqual(
    new Set([...first.reviews, ...second.reviews].map((review) => review.id))
      .size,
    51
  );
});

test("get_reviews cursor continues through reviews with the same timestamp", async () => {
  const ctx = context((filters) => {
    if (filters.some((filter) => filter.authors?.includes(sellerPubkey))) {
      return [productEvent()];
    }
    return Array.from({ length: 51 }, (_, index) =>
      reviewEvent({
        id: (index + 1).toString(16).padStart(64, "0"),
        pubkey: (index + 20).toString(16).padStart(64, "0"),
        created_at: 500,
        tags: [
          ["d", `review-${index}`],
          ["a", productAddress],
          ["rating", "1", "thumb"],
        ],
      })
    );
  });

  const first = JSON.parse(
    (await handleGetReviews({ sellerPubkey }, ctx)).content[0].text
  );
  const second = JSON.parse(
    (
      await handleGetReviews(
        { sellerPubkey, cursor: first._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );

  assert.equal(first.count, 50);
  assert.equal(second.count, 1);
  assert.notEqual(first.reviews[0].id, second.reviews[0].id);
  const combinedIds = [...first.reviews, ...second.reviews].map(
    (review) => review.id
  );
  assert.equal(combinedIds.length, 51);
  assert.equal(new Set(combinedIds).size, 51);
});

test("get_reviews never resurfaces a stale revision of a consumed logical review", async () => {
  const firstWindow = Array.from({ length: 51 }, (_, index) =>
    reviewEvent({
      id: (index + 1).toString(16).padStart(64, "0"),
      pubkey: (index + 20).toString(16).padStart(64, "0"),
      created_at: 500 - index,
      tags: [
        ["d", `a:${productAddress}`],
        ["a", productAddress],
        ["rating", "1", "thumb"],
      ],
    })
  );
  const staleFirstReview = reviewEvent({
    id: hex("f"),
    pubkey: firstWindow[0].pubkey,
    created_at: 440,
    tags: [
      ["d", `a:${productAddress}`],
      ["a", productAddress],
      ["rating", "0", "thumb"],
    ],
  });
  let fetchCount = 0;
  const ctx = context(() => {
    fetchCount += 1;
    return fetchCount === 1
      ? firstWindow
      : [firstWindow[49], firstWindow[50], staleFirstReview];
  });

  const first = JSON.parse(
    (await handleGetReviews({ productAddress }, ctx)).content[0].text
  );
  const second = JSON.parse(
    (
      await handleGetReviews(
        { productAddress, cursor: first._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );
  const combined = [...first.reviews, ...second.reviews];

  assert.equal(combined.length, 51);
  assert.equal(new Set(combined.map((review) => review.pubkey)).size, 51);
  assert.equal(
    combined.some((review) => review.id === staleFirstReview.id),
    false
  );
});

test("get_reviews advances past a full raw window of revisions from one reviewer and target", async () => {
  const repeatedReviewer = hex("1");
  const olderReviewer = hex("2");
  const revisions = Array.from({ length: 51 }, (_, index) =>
    reviewEvent({
      id: (index + 1).toString(16).padStart(64, "0"),
      pubkey: repeatedReviewer,
      created_at: 1_000 - index,
      tags: [
        ["d", `a:${productAddress}`],
        ["a", productAddress],
        ["rating", "1", "thumb"],
      ],
    })
  );
  const olderReview = reviewEvent({
    id: hex("e"),
    pubkey: olderReviewer,
    created_at: 949,
    tags: [
      ["d", `a:${productAddress}`],
      ["a", productAddress],
      ["rating", "0.8", "quality"],
    ],
  });
  const capturedFilters = [];
  const ctx = context((filters) => {
    capturedFilters.push(filters);
    return filters[0].until === undefined
      ? revisions
      : [revisions[50], olderReview];
  });

  const first = JSON.parse(
    (await handleGetReviews({ productAddress }, ctx)).content[0].text
  );
  const second = JSON.parse(
    (
      await handleGetReviews(
        { productAddress, cursor: first._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );

  assert.equal(first.count, 1);
  assert.equal(first.reviews[0].pubkey, repeatedReviewer);
  assert.equal(first._pagination.hasMore, true);
  assert.equal(second.count, 1);
  assert.equal(second.reviews[0].pubkey, olderReviewer);
  assert.equal(capturedFilters[1][0].until, 950);
});

test("get_reviews does not overfill cursor seen ids for a large sparse relay window", async () => {
  const reviewer = hex("1");
  const matchingRevisions = Array.from({ length: 51 }, (_, index) =>
    reviewEvent({
      id: (index + 1).toString(16).padStart(64, "0"),
      pubkey: reviewer,
      created_at: 1_000 - index,
      tags: [
        ["d", `a:${productAddress}`],
        ["a", productAddress],
        ["rating", "1", "thumb"],
      ],
    })
  );
  const unrelatedReviews = Array.from({ length: 150 }, (_, index) =>
    reviewEvent({
      id: (1_000 + index).toString(16).padStart(64, "0"),
      pubkey: (2_000 + index).toString(16).padStart(64, "0"),
      created_at: 999 - index,
      tags: [
        ["d", `unrelated-${index}`],
        ["rating", "1", "thumb"],
      ],
    })
  );
  const olderReview = reviewEvent({
    id: hex("f"),
    pubkey: hex("2"),
    created_at: 949,
    tags: [
      ["d", `a:${productAddress}`],
      ["a", productAddress],
      ["rating", "0.8", "quality"],
    ],
  });
  const saturatedWindow = [...matchingRevisions, ...unrelatedReviews];
  const capturedFilters = [];
  const ctx = context((filters) => {
    capturedFilters.push(filters);
    return filters[0].until === undefined ? saturatedWindow : [olderReview];
  });

  const first = JSON.parse(
    (await handleGetReviews({ productAddress }, ctx)).content[0].text
  );
  const decodedCursor = decodePaginationCursor(first._pagination.nextCursor, {
    tool: "get_reviews",
    query: createQueryFingerprint("get_reviews", [
      undefined,
      productAddress,
      undefined,
      50,
    ]),
  });
  const second = JSON.parse(
    (
      await handleGetReviews(
        { productAddress, cursor: first._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );

  assert.equal(first.count, 1);
  assert.equal(first._pagination.hasMore, true);
  assert.equal(decodedCursor.boundary, 950);
  assert.ok(decodedCursor.seen.length <= 2);
  assert.equal(capturedFilters[1][0].until, 950);
  assert.equal(second.reviews[0].id, olderReview.id);
});

test("get_reviews advances from a saturated continuation window containing only consumed revisions", async () => {
  const reviewer = hex("1");
  const reviewIdentity = `${reviewer}:a:${productAddress}`;
  const cursor = createPaginationCursor({
    tool: "get_reviews",
    query: createQueryFingerprint("get_reviews", [
      undefined,
      productAddress,
      undefined,
      50,
    ]),
    boundary: 1_000,
    seen: [hashPaginationLogicalIdentity(reviewIdentity)],
  });
  const consumedRevisions = Array.from({ length: 52 }, (_, index) =>
    reviewEvent({
      id: (index + 1).toString(16).padStart(64, "0"),
      pubkey: reviewer,
      created_at: 999 - index,
      tags: [
        ["d", `a:${productAddress}`],
        ["a", productAddress],
        ["rating", "1", "thumb"],
      ],
    })
  );
  const olderReview = reviewEvent({
    id: hex("f"),
    pubkey: hex("2"),
    created_at: 947,
    tags: [
      ["d", `a:${productAddress}`],
      ["a", productAddress],
      ["rating", "0.8", "quality"],
    ],
  });
  const capturedFilters = [];
  const ctx = context((filters) => {
    capturedFilters.push(filters);
    return filters[0].until === 1_000 ? consumedRevisions : [olderReview];
  });

  const emptyPage = JSON.parse(
    (await handleGetReviews({ productAddress, cursor }, ctx)).content[0].text
  );
  const olderPage = JSON.parse(
    (
      await handleGetReviews(
        {
          productAddress,
          cursor: emptyPage._pagination.nextCursor,
        },
        ctx
      )
    ).content[0].text
  );

  assert.equal(emptyPage.count, 0);
  assert.equal(emptyPage._pagination.hasMore, true);
  assert.equal(capturedFilters[1][0].until, 948);
  assert.equal(olderPage.reviews[0].id, olderReview.id);
});

test("get_reviews does not infer saturation by aggregating multiple filters", async () => {
  const reviewer = hex("1");
  const dTagEvents = Array.from({ length: 26 }, (_, index) =>
    reviewEvent({
      id: (index + 1).toString(16).padStart(64, "0"),
      pubkey: reviewer,
      created_at: 100 - index,
      tags: [["d", `a:${productAddress}`]],
    })
  );
  const aTagEvents = Array.from({ length: 26 }, (_, index) =>
    reviewEvent({
      id: (index + 27).toString(16).padStart(64, "0"),
      pubkey: reviewer,
      created_at: 74 - index,
      tags: [["a", productAddress]],
    })
  );

  const response = await handleGetReviews(
    { productAddress },
    context(() => [...dTagEvents, ...aTagEvents])
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.count, 1);
  assert.equal(body._pagination.hasMore, false);
  assert.equal(body._pagination.nextCursor, null);
  assert.equal(body._meta._truncated, false);
});

test("get_reviews ignores older overlap from an unsaturated filter when choosing the saturated boundary", async () => {
  const saturatedReviewer = hex("1");
  const saturatedDTagWindow = Array.from({ length: 51 }, (_, index) =>
    reviewEvent({
      id: (index + 1).toString(16).padStart(64, "0"),
      pubkey: saturatedReviewer,
      created_at: 100 - index,
      tags: [
        ["d", `a:${productAddress}`],
        ["rating", "1", "thumb"],
      ],
    })
  );
  const oldUnsaturatedATagEvent = reviewEvent({
    id: hex("9"),
    pubkey: hex("2"),
    created_at: 10,
    tags: [
      ["d", `a:${productAddress}`],
      ["a", productAddress],
      ["rating", "1", "thumb"],
    ],
  });
  const olderReview = reviewEvent({
    id: hex("f"),
    pubkey: hex("3"),
    created_at: 49,
    tags: [
      ["d", `a:${productAddress}`],
      ["rating", "1", "thumb"],
    ],
  });
  const capturedFilters = [];
  const ctx = context((filters) => {
    capturedFilters.push(filters);
    if (filters[0].until === undefined) {
      return [...saturatedDTagWindow, oldUnsaturatedATagEvent];
    }
    return filters[0].until === 50
      ? [olderReview, oldUnsaturatedATagEvent]
      : [];
  });

  const first = JSON.parse(
    (await handleGetReviews({ productAddress }, ctx)).content[0].text
  );
  const second = JSON.parse(
    (
      await handleGetReviews(
        { productAddress, cursor: first._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );

  assert.equal(first._pagination.hasMore, true);
  assert.deepEqual(
    first.reviews.map((review) => review.createdAt),
    [100]
  );
  assert.equal(capturedFilters[1][0].until, 50);
  assert.equal(capturedFilters[1][1].until, 50);
  assert.deepEqual(
    second.reviews.map((review) => review.id),
    [olderReview.id, oldUnsaturatedATagEvent.id]
  );
});

test("get_reviews traverses an over-budget unsaturated union without crossing a saturated frontier", async () => {
  const saturatedRelay = "wss://saturated.example.com";
  const mixedRelay = "wss://mixed.example.com";
  const saturatedReviewer = hex("1");
  const saturatedRevisions = Array.from({ length: 51 }, (_, index) =>
    reviewEvent({
      id: (index + 1).toString(16).padStart(64, "0"),
      pubkey: saturatedReviewer,
      created_at: 200 - index,
      tags: [
        ["d", `a:${productAddress}`],
        ["rating", "1", "thumb"],
      ],
    })
  );
  const newerDTagReviews = Array.from({ length: 26 }, (_, index) =>
    reviewEvent({
      id: (1_000 + index).toString(16).padStart(64, "0"),
      pubkey: (100 + index).toString(16).padStart(64, "0"),
      created_at: 199 - index,
      tags: [
        ["d", `a:${productAddress}`],
        ["rating", "1", "thumb"],
      ],
    })
  );
  const olderATagReviews = Array.from({ length: 26 }, (_, index) =>
    reviewEvent({
      id: (2_000 + index).toString(16).padStart(64, "0"),
      pubkey: (200 + index).toString(16).padStart(64, "0"),
      created_at: 100 - index,
      tags: [
        ["a", productAddress],
        ["rating", "1", "thumb"],
      ],
    })
  );
  const hiddenReview = reviewEvent({
    id: hex("f"),
    pubkey: hex("e"),
    created_at: 149,
    tags: [
      ["d", `a:${productAddress}`],
      ["rating", "1", "thumb"],
    ],
  });
  const requests = [];
  const ctx = {
    ...context(() => []),
    relays: [saturatedRelay, mixedRelay],
    nostr: {
      async fetch(filters, _params, relayUrls) {
        const relay = relayUrls[0];
        const until = filters[0].until;
        requests.push({ relay, until });
        if (relay === saturatedRelay) {
          const events =
            until === undefined
              ? saturatedRevisions
              : [saturatedRevisions.at(-1), hiddenReview];
          return events.filter(
            (event) =>
              event !== undefined && (until ?? Infinity) >= event.created_at
          );
        }
        return [...newerDTagReviews, ...olderATagReviews].filter(
          (event) => (until ?? Infinity) >= event.created_at
        );
      },
    },
  };

  const first = JSON.parse(
    (await handleGetReviews({ productAddress }, ctx)).content[0].text
  );
  const second = JSON.parse(
    (
      await handleGetReviews(
        { productAddress, cursor: first._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );
  const traversed = [...first.reviews, ...second.reviews];

  assert.equal(first.count, 27);
  assert.equal(first._pagination.hasMore, true);
  assert.equal(
    requests.find(
      (request) =>
        request.relay === saturatedRelay && request.until !== undefined
    )?.until,
    150
  );
  assert.equal(second.count, 27);
  assert.equal(second._pagination.hasMore, false);
  assert.equal(second._pagination.nextCursor, null);
  assert.deepEqual(
    traversed.map((review) => review.createdAt),
    [
      200,
      ...Array.from({ length: 26 }, (_, index) => 199 - index),
      149,
      ...Array.from({ length: 26 }, (_, index) => 100 - index),
    ]
  );
  assert.equal(
    new Set(traversed.map((review) => review.id)).size,
    traversed.length
  );
});

test("get_reviews rejects malformed and mismatched cursors before relay work", async () => {
  const ctx = context(() => {
    throw new Error("cursor validation must precede relay work");
  });

  const malformed = await handleGetReviews(
    { sellerPubkey, cursor: "malformed" },
    ctx
  );
  const malformedBody = JSON.parse(malformed.content[0].text);
  assert.equal(malformedBody.errorCode, "VALIDATION_ERROR");
  assert.equal(malformedBody.retryable, false);

  const mismatchedCursor = createPaginationCursor({
    tool: "get_reviews",
    query: createQueryFingerprint("get_reviews", [
      undefined,
      productAddress,
      undefined,
      50,
    ]),
    boundary: 100,
    seen: [],
  });
  const mismatched = await handleGetReviews(
    { sellerPubkey, cursor: mismatchedCursor },
    ctx
  );
  const mismatchedBody = JSON.parse(mismatched.content[0].text);
  assert.equal(mismatchedBody.errorCode, "VALIDATION_ERROR");
  assert.equal(mismatchedBody.retryable, false);
  assert.equal(ctx.calls.length, 0);
});
