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
      productEvent({ id: hex("1"), tags: [["t", "Electronics"]] }),
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
  assert.equal(fetchCount, 1);
});
