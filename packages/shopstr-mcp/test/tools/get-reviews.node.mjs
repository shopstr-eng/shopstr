import assert from "node:assert/strict";
import test from "node:test";

import { handleGetReviews } from "../dist/tools/get-reviews.js";

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
