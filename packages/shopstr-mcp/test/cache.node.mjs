import assert from "node:assert/strict";
import test from "node:test";

import { MemoryCache } from "../dist/cache.js";

const pubkey = "A".repeat(64);

test("serves cached responses and evicts lazily on expiration", () => {
  let now = 1_000;
  const cache = new MemoryCache(5_000, () => now);

  const key = { pubkey, kind: 0 };

  assert.equal(cache.get(key), undefined);

  cache.set(key, { name: "Alice" });
  assert.deepEqual(cache.get(key), { value: { name: "Alice" }, cached: true });

  // Right at expiration boundary (still valid, or just expired depending on <= logic)
  now += 5_000;
  assert.equal(cache.get(key), undefined, "should lazily evict on expiration");
});

test("keys entries by kind and canonicalized pubkey", () => {
  const cache = new MemoryCache(5_000, () => 1_000);

  cache.set({ pubkey, kind: 0 }, { name: "Alice" });
  cache.set({ pubkey, kind: 30019 }, { shopName: "Alice Store" });

  assert.deepEqual(cache.get({ pubkey: pubkey.toLowerCase(), kind: 0 }), {
    value: { name: "Alice" },
    cached: true,
  });
  assert.deepEqual(cache.get({ pubkey, kind: 30019 }), {
    value: { shopName: "Alice Store" },
    cached: true,
  });
});

test("prunes expired entries and supports disabled cache TTL", () => {
  let now = 1_000;
  const cache = new MemoryCache(10, () => now);

  cache.set({ pubkey, kind: 0 }, { name: "Alice" });
  assert.equal(cache.size(), 1);

  now += 11;
  assert.equal(cache.pruneExpired(), 1);
  assert.equal(cache.size(), 0);

  const disabledCache = new MemoryCache(0, () => now);
  disabledCache.set({ pubkey, kind: 0 }, { name: "Alice" });
  assert.equal(disabledCache.get({ pubkey, kind: 0 }), undefined);
  assert.equal(disabledCache.size(), 0);
});
