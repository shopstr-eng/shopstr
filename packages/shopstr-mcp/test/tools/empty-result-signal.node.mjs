import assert from "node:assert/strict";
import test from "node:test";

import { MemoryCache } from "../../dist/cache.js";
import { handleGetCategories } from "../../dist/tools/get-categories.js";
import { handleGetReviews } from "../../dist/tools/get-reviews.js";
import { handleListCompanies } from "../../dist/tools/list-companies.js";
import { handleSearchProducts } from "../../dist/tools/search-products.js";

const okRelay = "wss://ok.example.com";
const downRelay = "wss://down.example.com";
const slowRelay = "wss://slow.example.com";

function multiRelayContext(relays, relayImpl) {
  let fetchCount = 0;
  return {
    get fetchCount() {
      return fetchCount;
    },
    relays,
    timeoutMs: 100,
    cache: new MemoryCache(60_000),
    categoryCache: new MemoryCache(60_000),
    maxConcurrentRequests: 10,
    nostr: {
      async fetchWithStatus(filters, _params, relayUrls) {
        fetchCount += 1;
        return relayImpl(relayUrls[0], filters);
      },
    },
  };
}

const failDown = (relay) => {
  if (relay === downRelay) {
    throw new Error("Relay subscription closed: connection failed");
  }
  return { events: [], complete: true };
};
const allEmpty = () => ({ events: [], complete: true });

const tools = [
  ["search_products", handleSearchProducts, { keyword: "Arman" }, "products"],
  ["get_categories", handleGetCategories, {}, "categories"],
  ["list_companies", handleListCompanies, {}, "companies"],
  [
    "get_reviews",
    handleGetReviews,
    { productAddress: `30402:${"b".repeat(64)}:product` },
    "reviews",
  ],
];

for (const [name, handler, args, subject] of tools) {
  test(`${name} marks an empty degraded result as retryable notFound`, async () => {
    const response = await handler(
      args,
      multiRelayContext([okRelay, downRelay], failDown)
    );
    const body = JSON.parse(response.content[0].text);

    assert.notEqual(response.isError, true);
    assert.equal(body.count, 0);
    assert.equal(body._meta.notFound, true);
    assert.equal(body._meta.retryable, true);
    assert.equal(body._meta.retryAfterMs, 2_000);
    assert.equal(response._meta.notFound, true);
    assert.equal(response._meta.retryable, true);
    assert.equal(body._meta.degraded, true);
    assert.equal(
      body._meta._hints[0],
      `Not found on ${okRelay}. ${downRelay} failed and may have matching ${subject}; retry later.`
    );
  });

  test(`${name} names a timed-out relay when the result is empty`, async () => {
    const response = await handler(
      args,
      multiRelayContext([okRelay, slowRelay], (relay) => ({
        events: [],
        complete: relay !== slowRelay,
      }))
    );
    const body = JSON.parse(response.content[0].text);

    assert.equal(body._meta.notFound, true);
    assert.equal(body._meta.retryable, true);
    assert.equal(
      body._meta._hints[0],
      `Not found on ${okRelay}. ${slowRelay} timed out and may have matching ${subject}; retry later.`
    );
  });

  test(`${name} marks an empty result non-retryable when every relay answered`, async () => {
    const response = await handler(
      args,
      multiRelayContext([okRelay, downRelay], allEmpty)
    );
    const body = JSON.parse(response.content[0].text);

    assert.notEqual(response.isError, true);
    assert.equal(body._meta.notFound, true);
    assert.equal(body._meta.retryable, false);
    assert.equal(body._meta.retryAfterMs, undefined);
    assert.equal(body._meta.degraded, false);
  });

  test(`${name} stays RELAY_UNAVAILABLE when every relay failed`, async () => {
    const response = await handler(
      args,
      multiRelayContext([downRelay], failDown)
    );
    const body = JSON.parse(response.content[0].text);

    assert.equal(response.isError, true);
    assert.equal(body.errorCode, "RELAY_UNAVAILABLE");
  });
}

test("search_products leaves notFound off when results were returned despite a failed relay", async () => {
  const product = {
    id: "a".repeat(64),
    pubkey: "b".repeat(64),
    created_at: 100,
    kind: 30402,
    tags: [
      ["d", "product"],
      ["title", "Arman Mug"],
      ["price", "10", "USD"],
    ],
    content: "",
    sig: "c".repeat(128),
  };
  const response = await handleSearchProducts(
    { keyword: "Arman" },
    multiRelayContext([okRelay, downRelay], (relay) => {
      if (relay === downRelay) throw new Error("connection failed");
      return { events: [product], complete: true };
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.count, 1);
  assert.equal(body._meta.degraded, true);
  assert.equal(body._meta.notFound, undefined);
  assert.equal(body._meta.retryable, undefined);
});

test("get_categories does not cache an empty degraded scan, so the retry refetches", async () => {
  const ctx = multiRelayContext([okRelay, downRelay], failDown);
  await handleGetCategories({}, ctx);
  const afterFirst = ctx.fetchCount;
  await handleGetCategories({}, ctx);

  assert.ok(ctx.fetchCount > afterFirst);
});

test("get_categories still caches an empty scan when every relay answered", async () => {
  const ctx = multiRelayContext([okRelay, downRelay], allEmpty);
  await handleGetCategories({}, ctx);
  const afterFirst = ctx.fetchCount;
  await handleGetCategories({}, ctx);

  assert.equal(ctx.fetchCount, afterFirst);
});
