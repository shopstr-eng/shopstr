import assert from "node:assert/strict";
import test from "node:test";

import { handleGetReviews } from "../../dist/tools/get-reviews.js";
import { MemoryCache } from "../../dist/cache.js";
import { REVIEW_PRODUCT_FILTER_LIMIT } from "../../dist/tools/utils/common.js";

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

function context(fetchImpl) {
  const calls = [];
  return {
    calls,
    relays: ["wss://relay.example.com"],
    timeoutMs: 100,
    cache: new MemoryCache(0),
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

test("get_reviews skips seller product resolution on second call when cache is enabled", async () => {
  let productFetchCount = 0;

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

  // Second call: cache hit -> skips seller product resolution entirely
  const second = await handleGetReviews({ sellerPubkey }, ctx);
  assert.equal(second.resultCount, 1);
  assert.equal(
    productFetchCount,
    1,
    "second call should skip seller product fetch via cache"
  );
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

test("get_reviews passes until and computes hasMore from extra review", async () => {
  const ctx = context((filters) => {
    assert.equal(
      filters.every((filter) => filter.until === 500),
      true
    );
    assert.equal(
      filters.every((filter) => filter.limit === 51),
      true
    );
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
  });

  const response = await handleGetReviews({ productAddress, until: 500 }, ctx);
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.count, 50);
  assert.equal(body._pagination.hasMore, true);
  assert.equal(body._pagination.oldestCreatedAt, 451);
});
