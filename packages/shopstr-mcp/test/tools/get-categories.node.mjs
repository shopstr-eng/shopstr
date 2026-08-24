import assert from "node:assert/strict";
import test from "node:test";

import { MemoryCache } from "../../dist/cache.js";
import { handleGetCategories } from "../../dist/tools/get-categories.js";

const hex = (char) => char.repeat(64);

function productEvent(overrides = {}) {
  return {
    id: hex("a"),
    pubkey: hex("b"),
    created_at: 100,
    kind: 30402,
    tags: [
      ["d", "product"],
      ["title", "Hardware Wallet"],
      ["t", "Electronics"],
    ],
    content: "",
    sig: "c".repeat(128),
    ...overrides,
  };
}

function context(fetchImpl, categoryCache = new MemoryCache(60_000)) {
  const calls = [];
  return {
    calls,
    relays: ["wss://relay.example.com"],
    timeoutMs: 100,
    cache: new MemoryCache(60_000),
    categoryCache,
    maxConcurrentRequests: 10,
    nostr: {
      async fetch(filters) {
        calls.push(filters);
        return fetchImpl(filters);
      },
    },
  };
}

test("get_categories scans sampled products, normalizes counts, and caches", async () => {
  let fetchCount = 0;
  const categoryCache = new MemoryCache(60_000);
  const ctx = context(() => {
    fetchCount += 1;
    return [
      productEvent({
        id: hex("1"),
        tags: [
          ["t", "Electronics"],
          ["t", " electronics "],
        ],
      }),
      productEvent({ id: hex("2"), tags: [["t", "electronics"]] }),
      productEvent({ id: hex("3"), tags: [["t", "Coffee Gear"]] }),
    ];
  }, categoryCache);

  const first = await handleGetCategories({ limit: 10 }, ctx);
  const firstBody = JSON.parse(first.content[0].text);
  const second = await handleGetCategories({ limit: 10 }, ctx);
  const secondBody = JSON.parse(second.content[0].text);

  assert.equal(firstBody.count, 2);
  assert.deepEqual(firstBody.categories, [
    { name: "electronics", count: 2 },
    { name: "coffee gear", count: 1 },
  ]);
  assert.equal(
    firstBody._meta._hints.some((hint) =>
      hint.includes("count is the number of sampled products")
    ),
    true
  );
  assert.equal(secondBody._meta.cached.categories, true);
  assert.equal(secondBody._meta.resultCount, 2);
  assert.equal(secondBody._meta.totalMatches, 2);
  assert.equal(secondBody._meta._truncated, false);
  assert.equal(fetchCount, 1);
});

test("get_categories rejects hostile tags and accepts at most 20 categories per product", async () => {
  const validCategories = Array.from(
    { length: 25 },
    (_, index) => `bounded-${index}`
  );
  const response = await handleGetCategories(
    { limit: 100 },
    context(() => [
      productEvent({
        tags: [
          ["t", "nul\0category"],
          ["t", "control\u0001category"],
          ["t", "delete\u007fcategory"],
          ["t", "x".repeat(101)],
          ...validCategories.map((category) => ["t", category]),
        ],
      }),
    ])
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.totalMatches, 20);
  assert.deepEqual(
    new Set(body.categories.map((category) => category.name)),
    new Set(validCategories.slice(0, 20))
  );
});

test("get_categories caps summary keys at 5000 and keeps counting admitted categories", async () => {
  const events = Array.from({ length: 5_000 }, (_, index) =>
    productEvent({
      id: index.toString(16).padStart(64, "0"),
      tags: [["t", `summary-${index}`]],
    })
  );
  events.push(
    productEvent({
      id: (5_000).toString(16).padStart(64, "0"),
      tags: [
        ["t", "summary-0"],
        ["t", "summary-5000"],
      ],
    })
  );

  const response = await handleGetCategories(
    { limit: 500 },
    context(() => events)
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.totalMatches, 5_000);
  assert.deepEqual(body.categories[0], { name: "summary-0", count: 2 });
});
