import assert from "node:assert/strict";
import test from "node:test";

import { handleSearchProducts } from "../dist/tools/search-products.js";

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
      ["summary", "Cold storage wallet"],
      ["price", "40", "USD"],
      ["t", "Electronics"],
      ["location", "NYC"],
    ],
    content: "",
    sig: "c".repeat(128),
    ...overrides,
  };
}

function context(eventsByRelay) {
  return {
    relays: Object.keys(eventsByRelay),
    timeoutMs: 100,
    nostr: {
      async fetch(_filters, _params, relayUrls) {
        const relay = relayUrls[0];
        const result = eventsByRelay[relay];
        if (result instanceof Error) throw result;
        return result;
      },
    },
  };
}

test("search_products filters, deduplicates, budgets, and reports relay degradation", async () => {
  const goodRelay = "wss://good.example.com";
  const badRelay = "wss://bad.example.com";
  const response = await handleSearchProducts(
    {
      keyword: "wallet",
      maxPrice: 50,
      currency: "USD",
    },
    context({
      [goodRelay]: [
        productEvent({
          id: hex("1"),
          created_at: 10,
          tags: [
            ["d", "wallet"],
            ["title", "Old Hardware Wallet"],
            ["summary", "Older model"],
            ["price", "45", "USD"],
            ["t", "Electronics"],
          ],
        }),
        productEvent({
          id: hex("2"),
          created_at: 20,
          tags: [
            ["d", "wallet"],
            ["title", "New Hardware Wallet"],
            ["summary", "Newer model"],
            ["price", "40", "USD"],
            ["t", "Electronics"],
          ],
        }),
        productEvent({
          id: hex("3"),
          created_at: 30,
          tags: [
            ["d", "expensive-wallet"],
            ["title", "Premium Wallet"],
            ["summary", "Too expensive"],
            ["price", "500", "USD"],
            ["t", "Electronics"],
          ],
        }),
      ],
      [badRelay]: new Error("relay down"),
    })
  );

  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, undefined);
  assert.equal(response.resultCount, 1);
  assert.equal(body.count, 1);
  assert.equal(body.products[0].id, hex("2"));
  assert.equal(body.products[0].price, 40);
  assert.equal(body._meta.degraded, true);
  assert.deepEqual(body._meta.relaysSucceeded, [goodRelay]);
  assert.equal(body._meta.relaysFailed[0].url, badRelay);
});

test("search_products requires currency with price filters", async () => {
  const response = await handleSearchProducts(
    { maxPrice: 50 },
    context({ "wss://relay.example.com": [] })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "VALIDATION_ERROR");
});

test("search_products pushes category down to relay with #t filter", async () => {
  let capturedFilters;
  const ctx = {
    relays: ["wss://relay.example.com"],
    timeoutMs: 100,
    nostr: {
      async fetch(filters) {
        capturedFilters = filters;
        return [
          productEvent({
            id: hex("1"),
            tags: [
              ["d", "electronics-product"],
              ["title", "USB Cable"],
              ["price", "5", "USD"],
              ["t", "Electronics"],
            ],
          }),
        ];
      },
    },
  };

  const response = await handleSearchProducts({ category: "Electronics" }, ctx);
  const body = JSON.parse(response.content[0].text);

  // Verify the relay received a #t filter
  assert.equal(
    capturedFilters.some(
      (f) =>
        f["#t"]?.includes("Electronics") || f["#t"]?.includes("electronics")
    ),
    true,
    "should push category down to relay via #t"
  );
  assert.equal(body.count, 1);
  assert.equal(body.products[0].title, "USB Cable");
});

test("search_products falls back to broad query when #t category returns no matches", async () => {
  let fetchCallCount = 0;
  const ctx = {
    relays: ["wss://relay.example.com"],
    timeoutMs: 100,
    nostr: {
      async fetch(filters) {
        fetchCallCount++;
        // First call: targeted #t query returns nothing
        if (filters.some((f) => f["#t"])) {
          return [];
        }
        // Second call: broad query returns the product (category in description)
        return [
          productEvent({
            id: hex("1"),
            tags: [
              ["d", "shoe-product"],
              ["title", "Running Shoes"],
              ["summary", "Great shoes for running"],
              ["price", "100", "USD"],
              ["t", "shoes"], // lowercase, different from "Shoes"
            ],
          }),
        ];
      },
    },
  };

  const response = await handleSearchProducts({ category: "shoes" }, ctx);
  const body = JSON.parse(response.content[0].text);

  assert.equal(fetchCallCount, 2, "should try targeted then fallback");
  assert.equal(body.count, 1);
});

test("search_products excludes hidden products", async () => {
  const response = await handleSearchProducts(
    {},
    context({
      "wss://relay.example.com": [
        productEvent({
          id: hex("1"),
          tags: [
            ["d", "visible-item"],
            ["title", "Visible Product"],
            ["price", "10", "USD"],
            ["t", "Electronics"],
          ],
        }),
        productEvent({
          id: hex("2"),
          tags: [
            ["d", "hidden-item"],
            ["title", "Hidden Product"],
            ["price", "20", "USD"],
            ["t", "Electronics"],
            ["visibility", "hidden"],
          ],
        }),
      ],
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.count, 1);
  assert.equal(body.products[0].title, "Visible Product");
});
