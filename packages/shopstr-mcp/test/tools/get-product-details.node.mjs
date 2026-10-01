import assert from "node:assert/strict";
import test from "node:test";

import { handleGetProductDetails } from "../../dist/tools/get-product-details.js";
import { MemoryCache } from "../../dist/cache.js";

const hex = (char) => char.repeat(64);

function productEvent(overrides = {}) {
  return {
    id: hex("a"),
    pubkey: hex("b"),
    created_at: 100,
    kind: 30402,
    tags: [
      ["d", "product"],
      ["title", "Linen Shirt"],
      ["summary", "A nice shirt"],
      ["price", "10", "USD"],
    ],
    content: "",
    sig: "c".repeat(128),
    ...overrides,
  };
}

function context(fetchImpl) {
  return {
    relays: ["wss://relay.example.com"],
    timeoutMs: 100,
    cache: new MemoryCache(0),
    nostr: {
      async fetch(filters) {
        return fetchImpl(filters);
      },
    },
  };
}

test("get_product_details returns a product by event id via coordinate resolution", async () => {
  const productId = hex("1");
  const ctx = context((filters) => {
    // Pre-flight: return the product by id
    if (filters.some((f) => f.ids?.includes(productId))) {
      return [productEvent({ id: productId })];
    }
    // Coordinate fetch: return the latest version
    if (filters.some((f) => f["#d"]?.includes("product"))) {
      return [productEvent({ id: productId })];
    }
    return [];
  });

  const response = await handleGetProductDetails({ productId }, ctx);
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.resultCount, 1);
  assert.equal(body.product.id, productId);
  assert.equal(body.product.title, "Linen Shirt");
  assert.equal(body._meta.resultCount, 1);
});

test("get_product_details returns short event content as product description", async () => {
  const productId = hex("1");
  const description = "Soft linen shirt with pearl buttons.";
  const ctx = context((filters) => {
    if (filters.some((f) => f.ids?.includes(productId))) {
      return [productEvent({ id: productId, content: description })];
    }
    if (filters.some((f) => f["#d"]?.includes("product"))) {
      return [productEvent({ id: productId, content: description })];
    }
    return [];
  });

  const response = await handleGetProductDetails({ productId }, ctx);
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.description, description);
  assert.equal(
    body._meta._hints.some((hint) => hint.startsWith("descriptionTruncated")),
    false
  );
});

test("get_product_details truncates long descriptions at a word boundary", async () => {
  const productId = hex("1");
  const description = "leather ".repeat(300);
  const ctx = context((filters) => {
    if (filters.some((f) => f.ids?.includes(productId))) {
      return [productEvent({ id: productId, content: description })];
    }
    if (filters.some((f) => f["#d"]?.includes("product"))) {
      return [productEvent({ id: productId, content: description })];
    }
    return [];
  });

  const response = await handleGetProductDetails({ productId }, ctx);
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.description.endsWith("..."), true);
  assert.equal(body.description.endsWith("leather..."), true);
  assert.ok(body.description.length <= 2_000);
  assert.equal(
    body._meta._hints.some((hint) => hint.startsWith("descriptionTruncated")),
    true
  );
});

test("get_product_details accepts productAddress and skips pre-flight", async () => {
  const productAddress = `30402:${hex("b")}:product`;
  let fetchCallCount = 0;
  const ctx = context((filters) => {
    fetchCallCount++;
    // Should only be called once (coordinate fetch), no pre-flight
    if (filters.some((f) => f["#d"]?.includes("product"))) {
      return [productEvent()];
    }
    return [];
  });

  const response = await handleGetProductDetails({ productAddress }, ctx);
  const body = JSON.parse(response.content[0].text);

  assert.equal(fetchCallCount, 1, "should skip pre-flight with productAddress");
  assert.equal(response.resultCount, 1);
  assert.equal(body.product.title, "Linen Shirt");
});

test("get_product_details returns not found when relays have no matching product", async () => {
  const response = await handleGetProductDetails(
    { productId: hex("1") },
    context(() => [])
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "NOT_FOUND");
});

test("get_product_details requires either productId or productAddress", async () => {
  const response = await handleGetProductDetails(
    {},
    context(() => [])
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "VALIDATION_ERROR");
});

test("get_product_details fetches latest version via coordinate when product is updated", async () => {
  const oldId = hex("1");
  const newId = hex("2");
  const ctx = context((filters) => {
    // Pre-flight: return the old version by id
    if (filters.some((f) => f.ids?.includes(oldId))) {
      return [productEvent({ id: oldId, created_at: 10 })];
    }
    // Coordinate fetch: return the newer version
    if (filters.some((f) => f["#d"]?.includes("product"))) {
      return [
        productEvent({
          id: newId,
          created_at: 20,
          tags: [
            ["d", "product"],
            ["title", "Updated Linen Shirt"],
            ["summary", "Updated description"],
            ["price", "50", "USD"],
          ],
        }),
      ];
    }
    return [];
  });

  const response = await handleGetProductDetails({ productId: oldId }, ctx);
  const body = JSON.parse(response.content[0].text);

  // Should return the LATEST version (new price), not the old stale one
  assert.equal(response.resultCount, 1);
  assert.equal(body.product.id, newId);
  assert.equal(body.product.title, "Updated Linen Shirt");
  assert.equal(body.product.price, 50);
});

test("get_product_details skips pre-flight on second call when cache is enabled", async () => {
  const productId = hex("1");
  let preflightCount = 0;

  // Shared enabled cache (60s TTL) across both calls
  const cache = new MemoryCache(60_000);
  const fetchImpl = (filters) => {
    if (filters.some((f) => f.ids?.includes(productId))) {
      preflightCount++;
      return [productEvent({ id: productId })];
    }
    if (filters.some((f) => f["#d"]?.includes("product"))) {
      return [productEvent({ id: productId })];
    }
    return [];
  };

  const ctx = {
    relays: ["wss://relay.example.com"],
    timeoutMs: 100,
    cache,
    nostr: {
      async fetch(filters) {
        return fetchImpl(filters);
      },
    },
  };

  // First call: cache miss → pre-flight hits the relay
  const first = await handleGetProductDetails({ productId }, ctx);
  assert.equal(first.resultCount, 1);
  assert.equal(preflightCount, 1, "first call should hit relay for pre-flight");

  // Second call: cache hit → pre-flight is skipped entirely
  const second = await handleGetProductDetails({ productId }, ctx);
  assert.equal(second.resultCount, 1);
  assert.equal(
    preflightCount,
    1,
    "second call should skip pre-flight via cache"
  );
});

const okRelay = "wss://ok.example.com";
const downRelay = "wss://down.example.com";
const slowRelay = "wss://slow.example.com";

// Per-relay context: `relayImpl(relay, filters)` returns { events, complete }
// or throws to simulate a failed relay.
function multiRelayContext(relays, relayImpl) {
  return {
    relays,
    timeoutMs: 100,
    cache: new MemoryCache(0),
    nostr: {
      async fetchWithStatus(filters, _params, relayUrls) {
        return relayImpl(relayUrls[0], filters);
      },
    },
  };
}

const productAddress = `30402:${hex("b")}:product`;

test("get_product_details returns retryable NOT_FOUND when a relay failed and others were empty", async () => {
  const response = await handleGetProductDetails(
    { productAddress },
    multiRelayContext([okRelay, downRelay], (relay) => {
      if (relay === downRelay) {
        throw new Error("Relay subscription closed: connection failed");
      }
      return { events: [], complete: true };
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "NOT_FOUND");
  assert.equal(body.retryable, true);
  assert.equal(body.retryAfterMs, 2_000);
  assert.equal(response._meta.retryable, true);
  assert.equal(response._meta.retryAfterMs, 2_000);
  assert.equal(body._meta.degraded, true);
  assert.equal(
    body._meta._hints[0],
    `Not found on ${okRelay}. ${downRelay} failed and may have this product; retry later.`
  );
  assert.ok(
    body._meta._hints.some((hint) => hint.startsWith("Use search_products"))
  );
});

test("get_product_details treats a timed-out relay like a failed one when nothing is found", async () => {
  const response = await handleGetProductDetails(
    { productAddress },
    multiRelayContext([okRelay, slowRelay], (relay) => ({
      events: [],
      complete: relay !== slowRelay,
    }))
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.errorCode, "NOT_FOUND");
  assert.equal(body.retryable, true);
  assert.equal(body.retryAfterMs, 2_000);
  assert.equal(
    body._meta._hints[0],
    `Not found on ${okRelay}. ${slowRelay} timed out and may have this product; retry later.`
  );
});

test("get_product_details stays non-retryable NOT_FOUND when every relay answered empty", async () => {
  const response = await handleGetProductDetails(
    { productAddress },
    multiRelayContext([okRelay, "wss://ok2.example.com"], () => ({
      events: [],
      complete: true,
    }))
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.errorCode, "NOT_FOUND");
  assert.equal(body.retryable, false);
  assert.equal(body.retryAfterMs, undefined);
  assert.equal(body._meta.degraded, false);
  assert.deepEqual(body._meta._hints, [
    "Use search_products with keyword, category, or location filters to discover products.",
  ]);
});

test("get_product_details stays RELAY_UNAVAILABLE when every relay failed", async () => {
  const response = await handleGetProductDetails(
    { productAddress },
    multiRelayContext([downRelay, "wss://down2.example.com"], () => {
      throw new Error("connection failed");
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.errorCode, "RELAY_UNAVAILABLE");
  assert.equal(body.retryable, true);
});

test("get_product_details uses the id fallback's relay outcomes when a relay recovers", async () => {
  const productId = hex("1");
  let idsRequests = 0;
  const response = await handleGetProductDetails(
    { productId },
    multiRelayContext([okRelay, downRelay], (relay, filters) => {
      assert.ok(filters.some((filter) => filter.ids?.includes(productId)));
      idsRequests++;
      // The relay fails only during resolution; the fallback repeats the same
      // query and it answers empty, so nothing is left unreached.
      if (relay === downRelay && idsRequests <= 2) {
        throw new Error("connection failed");
      }
      return { events: [], complete: true };
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(
    idsRequests,
    4,
    "resolve and fallback should each hit both relays"
  );
  assert.equal(body.errorCode, "NOT_FOUND");
  assert.equal(body.retryable, false);
  assert.equal(body.retryAfterMs, undefined);
  assert.equal(body._meta.degraded, false);
  assert.deepEqual(body._meta.relaysFailed, []);
});

test("get_product_details returns retryable NOT_FOUND when a relay fails both the productId resolve and the id fallback", async () => {
  const productId = hex("1");
  let idsRequests = 0;
  const response = await handleGetProductDetails(
    { productId },
    multiRelayContext([okRelay, downRelay], (relay, filters) => {
      assert.ok(filters.some((filter) => filter.ids?.includes(productId)));
      idsRequests++;
      if (relay === downRelay) throw new Error("connection failed");
      return { events: [], complete: true };
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(
    idsRequests,
    4,
    "resolve and fallback should each hit both relays"
  );
  assert.equal(body.errorCode, "NOT_FOUND");
  assert.equal(body.retryable, true);
  assert.equal(body.retryAfterMs, 2_000);
  assert.equal(body._meta.degraded, true);
  assert.deepEqual(
    body._meta.relaysFailed.map((failure) => failure.url),
    [downRelay]
  );
  assert.ok(
    body._meta._hints.includes(
      `Not found on ${okRelay}. ${downRelay} failed and may have this product; retry later.`
    )
  );
});
