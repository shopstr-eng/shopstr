import assert from "node:assert/strict";
import test from "node:test";

import { handleSearchProducts } from "../../dist/tools/search-products.js";
import { MemoryCache } from "../../dist/cache.js";
import {
  createPaginationCursor,
  createQueryFingerprint,
  decodePaginationCursor,
  hashPaginationLogicalIdentity,
} from "../../dist/tools/utils/pagination-cursor.js";

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
    cache: new MemoryCache(0),
    categoryCache: new MemoryCache(60_000),
    maxConcurrentRequests: 10,
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
    cache: new MemoryCache(0),
    categoryCache: new MemoryCache(60_000),
    maxConcurrentRequests: 10,
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
    cache: new MemoryCache(0),
    categoryCache: new MemoryCache(60_000),
    maxConcurrentRequests: 10,
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
  assert.equal(body._meta.usedFallbackQuery, true);
  assert.equal(body._meta.eventCount, 1);
});

test("search_products queries normal and NIP-50 relays concurrently for keyword searches", async () => {
  const normalRelay = "wss://normal.example.com";
  const nip50Relay = "wss://search.example.com";
  const calls = [];
  let resolveNormal;
  const normalResult = new Promise((resolve) => {
    resolveNormal = resolve;
  });
  const ctx = {
    ...context({}),
    relays: [normalRelay],
    nip50SearchRelays: [nip50Relay],
    timeoutMs: 10_000,
    nostr: {
      async fetch(filters, _params, relayUrls, options) {
        const relay = relayUrls[0];
        calls.push({ relay, filters, options });
        if (relay === normalRelay) return normalResult;
        return [
          productEvent({
            id: hex("2"),
            created_at: 20,
            tags: [
              ["d", "wallet-nip50"],
              ["title", "Hardware Wallet"],
              ["summary", "NIP-50 result"],
              ["price", "35", "USD"],
            ],
          }),
        ];
      },
    },
  };

  const responsePromise = handleSearchProducts({ keyword: "wallet" }, ctx);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 2, "normal and NIP-50 fetches should be started");
  assert.equal(
    calls.find((call) => call.relay === normalRelay).filters[0].search,
    undefined
  );
  assert.equal(
    calls.find((call) => call.relay === nip50Relay).filters[0].search,
    "wallet"
  );
  assert.equal(
    calls.find((call) => call.relay === normalRelay).options.timeoutMs,
    10_000
  );
  assert.equal(
    calls.find((call) => call.relay === nip50Relay).options.timeoutMs,
    3_000
  );
  assert.equal(
    calls.find((call) => call.relay === nip50Relay).filters[0].limit,
    100
  );

  resolveNormal([
    productEvent({
      id: hex("1"),
      created_at: 10,
      tags: [
        ["d", "wallet-normal"],
        ["title", "Hardware Wallet"],
        ["summary", "Normal relay result"],
        ["price", "40", "USD"],
      ],
    }),
  ]);

  const body = JSON.parse((await responsePromise).content[0].text);

  assert.equal(body.count, 2);
  assert.equal(body.products[0].id, hex("2"));
  assert.equal(body.products[0].matchedVia, "nip50");
  assert.equal(body.products[1].id, hex("1"));
  assert.deepEqual(body._meta.nip50, {
    attempted: true,
    relaysQueried: [nip50Relay],
    eventCount: 1,
    reservedSlotsUsed: 1,
  });
});

test("search_products returns normal relay results when NIP-50 relays fail", async () => {
  const normalRelay = "wss://normal.example.com";
  const nip50Relay = "wss://search.example.com";
  const response = await handleSearchProducts(
    { keyword: "wallet" },
    {
      ...context({}),
      relays: [normalRelay],
      nip50SearchRelays: [nip50Relay],
      nostr: {
        async fetch(_filters, _params, relayUrls) {
          if (relayUrls[0] === nip50Relay) throw new Error("search down");
          return [productEvent()];
        },
      },
    }
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, undefined);
  assert.equal(body.count, 1);
  assert.equal(body._meta.nip50.attempted, true);
  assert.equal(body._meta.nip50.eventCount, 0);
  assert.equal(body._meta.degraded, true);
});

test("search_products returns NIP-50 results when normal relays fail", async () => {
  const normalRelay = "wss://normal.example.com";
  const nip50Relay = "wss://search.example.com";
  const response = await handleSearchProducts(
    { keyword: "wallet" },
    {
      ...context({}),
      relays: [normalRelay],
      nip50SearchRelays: [nip50Relay],
      nostr: {
        async fetch(_filters, _params, relayUrls) {
          if (relayUrls[0] === normalRelay) throw new Error("normal down");
          return [productEvent()];
        },
      },
    }
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, undefined);
  assert.equal(body.count, 1);
  assert.equal(body._meta.nip50.eventCount, 1);
  assert.equal(body._meta.degraded, true);
});

test("search_products fails only when normal and NIP-50 relays both fail", async () => {
  const response = await handleSearchProducts(
    { keyword: "wallet" },
    {
      ...context({}),
      relays: ["wss://normal.example.com"],
      nip50SearchRelays: ["wss://search.example.com"],
      nostr: {
        async fetch() {
          throw new Error("relay down");
        },
      },
    }
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "RELAY_UNAVAILABLE");
  assert.deepEqual(
    body._meta.relaysQueried.sort(),
    ["wss://normal.example.com", "wss://search.example.com"].sort()
  );
});

test("search_products keeps cursor progress when NIP-50 reveals a newer revision", async () => {
  const seenIdentity = `30402:${hex("b")}:already-seen`;
  const cursor = createPaginationCursor({
    tool: "search_products",
    query: createQueryFingerprint("search_products", [
      "wallet",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      2,
      "newest",
    ]),
    boundary: 100,
    seen: [hashPaginationLogicalIdentity(seenIdentity)],
  });
  const listing = (id, dTag, createdAt) =>
    productEvent({
      id: hex(id),
      created_at: createdAt,
      tags: [
        ["d", dTag],
        ["title", "Hardware Wallet"],
      ],
    });
  const staleNormal = listing("2", "updated-product", 99);
  const nextNormal = listing("3", "next-product", 98);
  const latestFromNip50 = listing("5", "updated-product", 200);
  const rankedNip50Match = listing("6", "nip50-result", 50);
  const calls = [];
  const response = await handleSearchProducts(
    { keyword: "wallet", limit: 2, cursor },
    {
      ...context({}),
      relays: ["wss://normal.example.com"],
      nip50SearchRelays: ["wss://search.example.com"],
      nostr: {
        async fetch(filters, _params, relayUrls) {
          calls.push({ relay: relayUrls[0], filters });
          return relayUrls[0] === "wss://search.example.com"
            ? [latestFromNip50, rankedNip50Match]
            : [staleNormal, nextNormal];
        },
      },
    }
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, undefined);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].relay, "wss://normal.example.com");
  assert.equal(calls[0].filters[0].search, undefined);
  assert.equal(calls[0].filters[0].until, 100);
  assert.equal(calls[0].filters[0].limit, 11);
  assert.equal(calls[1].relay, "wss://search.example.com");
  assert.equal(calls[1].filters[0].search, "wallet");
  assert.equal(calls[1].filters[0].until, undefined);
  assert.equal(calls[1].filters[0].limit, 11);
  assert.deepEqual(
    body.products.map((product) => product.id),
    [latestFromNip50.id, rankedNip50Match.id]
  );
  assert.equal(body._pagination.hasMore, true);
  assert.equal(typeof body._pagination.nextCursor, "string");
  assert.equal(body._meta.nip50.attempted, true);
});

test("search_products keeps older NIP-50 matches outside the normal sparse boundary", async () => {
  const normalWindow = Array.from({ length: 10 }, (_, index) =>
    productEvent({
      id: (index + 1).toString(16).padStart(64, "0"),
      created_at: 100 - index,
      tags: [
        ["d", `normal-${index}`],
        ["title", "Unrelated Product"],
      ],
    })
  );
  const nip50Match = productEvent({
    id: hex("f"),
    created_at: 1,
    tags: [
      ["d", "rare-match"],
      ["title", "Unrelated Product"],
    ],
    content: "Rare Search Match in the listing description",
  });

  const response = await handleSearchProducts(
    { keyword: "rare", limit: 2 },
    {
      ...context({}),
      relays: ["wss://normal.example.com"],
      nip50SearchRelays: ["wss://search.example.com"],
      nostr: {
        async fetch(_filters, _params, relayUrls) {
          return relayUrls[0] === "wss://search.example.com"
            ? [nip50Match]
            : normalWindow;
        },
      },
    }
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, undefined);
  assert.equal(body.count, 1);
  assert.equal(body.products[0].id, nip50Match.id);
  assert.equal(body.products[0].matchedVia, "nip50");
});

test("search_products keeps the latest cross-stream revision and applies the requested price sort", async () => {
  const staleNormal = productEvent({
    id: hex("1"),
    created_at: 100,
    tags: [
      ["d", "product"],
      ["title", "Hardware Wallet"],
      ["price", "100", "USD"],
    ],
  });
  const normalMidPrice = productEvent({
    id: hex("2"),
    created_at: 90,
    tags: [
      ["d", "mid-price"],
      ["title", "Hardware Wallet"],
      ["price", "50", "USD"],
    ],
  });
  const latestFromNip50 = productEvent({
    id: hex("3"),
    created_at: 120,
    tags: [
      ["d", "product"],
      ["title", "Hardware Wallet"],
      ["price", "10", "USD"],
    ],
  });
  const nip50HighPrice = productEvent({
    id: hex("4"),
    created_at: 110,
    tags: [
      ["d", "high-price"],
      ["title", "Hardware Wallet"],
      ["price", "200", "USD"],
    ],
  });
  const nip50LowPrice = productEvent({
    id: hex("5"),
    created_at: 80,
    tags: [
      ["d", "low-price"],
      ["title", "Hardware Wallet"],
      ["price", "5", "USD"],
    ],
  });
  const response = await handleSearchProducts(
    {
      keyword: "wallet",
      currency: "USD",
      sortBy: "price_asc",
      limit: 4,
    },
    {
      ...context({}),
      relays: ["wss://normal.example.com"],
      nip50SearchRelays: ["wss://search.example.com"],
      nostr: {
        async fetch(_filters, _params, relayUrls) {
          return relayUrls[0] === "wss://search.example.com"
            ? [latestFromNip50, nip50HighPrice, nip50LowPrice]
            : [staleNormal, normalMidPrice];
        },
      },
    }
  );
  const body = JSON.parse(response.content[0].text);

  assert.deepEqual(
    body.products.map((product) => product.price),
    [5, 10, 50, 200]
  );
  assert.equal(body.products[1].id, latestFromNip50.id);
});

test("search_products preserves limit-1 normal priority and paginates NIP-50 matches", async () => {
  const ctx = {
    ...context({}),
    relays: ["wss://normal.example.com"],
    nip50SearchRelays: ["wss://search.example.com"],
    nostr: {
      async fetch(_filters, _params, relayUrls) {
        if (relayUrls[0] === "wss://search.example.com") {
          return [
            productEvent({
              id: hex("2"),
              tags: [
                ["d", "nip50-wallet"],
                ["title", "Hardware Wallet"],
              ],
            }),
          ];
        }
        return [productEvent()];
      },
    },
  };
  const first = JSON.parse(
    (await handleSearchProducts({ keyword: "wallet", limit: 1 }, ctx))
      .content[0].text
  );

  assert.equal(first.count, 1);
  assert.equal(first.products[0].id, productEvent().id);
  assert.equal(first.products[0].matchedVia, undefined);
  assert.equal(first._meta.nip50.reservedSlotsUsed, 0);
  assert.equal(first._pagination.hasMore, true);
  assert.equal(typeof first._pagination.nextCursor, "string");

  const second = JSON.parse(
    (
      await handleSearchProducts(
        {
          keyword: "wallet",
          limit: 1,
          cursor: first._pagination.nextCursor,
        },
        ctx
      )
    ).content[0].text
  );

  assert.equal(second.count, 1);
  assert.equal(second.products[0].id, hex("2"));
  assert.equal(second.products[0].matchedVia, "nip50");
  assert.equal(second._pagination.hasMore, false);
});

test("search_products bounds content scanned during keyword verification", async () => {
  const response = await handleSearchProducts(
    { keyword: "needle" },
    {
      ...context({}),
      relays: ["wss://normal.example.com"],
      nip50SearchRelays: ["wss://search.example.com"],
      nostr: {
        async fetch(_filters, _params, relayUrls) {
          return relayUrls[0] === "wss://search.example.com"
            ? [
                productEvent({
                  id: hex("2"),
                  tags: [["d", "oversized-content"]],
                  content: `${"x".repeat(20_000)}needle`,
                }),
              ]
            : [];
        },
      },
    }
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.count, 0);
});

test("search_products reallocates unused normal capacity to NIP-50 matches", async () => {
  const normalProducts = Array.from({ length: 5 }, (_, index) =>
    productEvent({
      id: (index + 1).toString(16).padStart(64, "0"),
      created_at: 1_000 - index,
      tags: [
        ["d", `normal-wallet-${index}`],
        ["title", `Normal Hardware Wallet ${index}`],
      ],
    })
  );
  const nip50Products = Array.from({ length: 60 }, (_, index) =>
    productEvent({
      id: (100 + index).toString(16).padStart(64, "0"),
      created_at: 900 - index,
      tags: [
        ["d", `nip50-wallet-${index}`],
        ["title", `NIP-50 Hardware Wallet ${index}`],
      ],
    })
  );
  const response = await handleSearchProducts(
    { keyword: "wallet" },
    {
      ...context({}),
      relays: ["wss://normal.example.com"],
      nip50SearchRelays: ["wss://search.example.com"],
      nostr: {
        async fetch(_filters, _params, relayUrls) {
          return relayUrls[0] === "wss://search.example.com"
            ? nip50Products
            : normalProducts;
        },
      },
    }
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.resultCount, 37);
  assert.equal(body.count, 37);
  assert.equal(
    body.products.filter((product) => product.matchedVia === "nip50").length,
    32
  );
  assert.equal(body._meta.nip50.reservedSlotsUsed, 32);
  assert.equal(body._pagination.hasMore, true);
});

test("search_products paginates NIP-50-only results without skipping relay-ranked candidates", async () => {
  const nip50Products = Array.from({ length: 6 }, (_, index) =>
    productEvent({
      id: (index + 1).toString(16).padStart(64, "0"),
      created_at: index + 1,
      tags: [
        ["d", `nip50-${index + 1}`],
        ["title", `Hardware Wallet Search ${index + 1}`],
      ],
    })
  );
  const ctx = {
    ...context({}),
    relays: ["wss://normal.example.com"],
    nip50SearchRelays: ["wss://search.example.com"],
    nostr: {
      async fetch(_filters, _params, relayUrls) {
        return relayUrls[0] === "wss://search.example.com" ? nip50Products : [];
      },
    },
  };

  const first = JSON.parse(
    (await handleSearchProducts({ keyword: "wallet", limit: 3 }, ctx))
      .content[0].text
  );
  assert.equal(first._pagination.hasMore, true);
  assert.equal(typeof first._pagination.nextCursor, "string");

  const second = JSON.parse(
    (
      await handleSearchProducts(
        {
          keyword: "wallet",
          limit: 3,
          cursor: first._pagination.nextCursor,
        },
        ctx
      )
    ).content[0].text
  );

  assert.deepEqual(
    first.products.map((product) => product.id).sort(),
    nip50Products
      .slice(0, 3)
      .map((product) => product.id)
      .sort()
  );
  assert.deepEqual(
    second.products.map((product) => product.id).sort(),
    nip50Products
      .slice(3, 6)
      .map((product) => product.id)
      .sort()
  );
});

test("search_products applies NIP-50 to category fallback keyword retries", async () => {
  const calls = [];
  const response = await handleSearchProducts(
    { keyword: "running", category: "Shoes" },
    {
      ...context({}),
      relays: ["wss://normal.example.com"],
      nip50SearchRelays: ["wss://search.example.com"],
      nostr: {
        async fetch(filters, _params, relayUrls) {
          calls.push({ relay: relayUrls[0], filters });
          const filter = filters[0];
          if (filter["#t"]) return [];
          if (filter.search) {
            return [
              productEvent({
                id: hex("1"),
                tags: [
                  ["d", "running-shoes"],
                  ["title", "Running Shoes"],
                  ["summary", "NIP-50 fallback result"],
                  ["price", "100", "USD"],
                  ["t", "shoes"],
                ],
              }),
            ];
          }
          return [];
        },
      },
    }
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, undefined);
  assert.equal(body.count, 1);
  assert.equal(body._meta.usedFallbackQuery, true);
  assert.equal(calls.length, 4);
  assert.equal(calls[0].filters[0].search, undefined);
  assert.equal(calls[1].filters[0].search, "running");
  assert.equal(calls[2].filters[0].search, undefined);
  assert.equal(calls[3].filters[0].search, "running");
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

test("search_products traverses newest products with an opaque cursor", async () => {
  const events = [
    productEvent({
      id: hex("1"),
      created_at: 100,
      tags: [
        ["d", "one"],
        ["title", "One"],
      ],
    }),
    productEvent({
      id: hex("2"),
      created_at: 99,
      tags: [
        ["d", "two"],
        ["title", "Two"],
      ],
    }),
    productEvent({
      id: hex("3"),
      created_at: 98,
      tags: [
        ["d", "three"],
        ["title", "Three"],
      ],
    }),
  ];
  const filters = [];
  const ctx = {
    ...context({ "wss://relay.example.com": events }),
    nostr: {
      async fetch(requestFilters) {
        filters.push(requestFilters);
        return events.filter(
          (event) =>
            requestFilters[0].until === undefined ||
            event.created_at <= requestFilters[0].until
        );
      },
    },
  };

  const first = JSON.parse(
    (await handleSearchProducts({ limit: 2 }, ctx)).content[0].text
  );
  assert.deepEqual(
    first.products.map((product) => product.id),
    [hex("1"), hex("2")]
  );
  assert.equal(first._pagination.hasMore, true);
  assert.equal(typeof first._pagination.nextCursor, "string");
  assert.equal(first._pagination.oldestCreatedAt, undefined);

  const second = JSON.parse(
    (
      await handleSearchProducts(
        { limit: 2, cursor: first._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );
  assert.deepEqual(
    second.products.map((product) => product.id),
    [hex("3")]
  );
  assert.equal(second._pagination.hasMore, false);
  assert.equal(second._pagination.nextCursor, null);
  assert.equal(filters[1][0].until, 99);
});

test("search_products preserves unconsumed same-timestamp products across cursors", async () => {
  const events = [
    productEvent({
      id: hex("1"),
      created_at: 100,
      tags: [
        ["d", "one"],
        ["title", "One"],
      ],
    }),
    productEvent({
      id: hex("2"),
      created_at: 100,
      tags: [
        ["d", "two"],
        ["title", "Two"],
      ],
    }),
    productEvent({
      id: hex("3"),
      created_at: 99,
      tags: [
        ["d", "three"],
        ["title", "Three"],
      ],
    }),
  ];
  const ctx = context({ "wss://relay.example.com": events });

  const first = JSON.parse(
    (await handleSearchProducts({ limit: 1 }, ctx)).content[0].text
  );
  const second = JSON.parse(
    (
      await handleSearchProducts(
        { limit: 1, cursor: first._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );
  const third = JSON.parse(
    (
      await handleSearchProducts(
        { limit: 1, cursor: second._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );

  assert.deepEqual(
    [first, second, third].flatMap((page) =>
      page.products.map((product) => product.id)
    ),
    [hex("1"), hex("2"), hex("3")]
  );
  assert.equal(third._pagination.nextCursor, null);
});

test("search_products accepts equivalent case-insensitive filters across cursor pages", async () => {
  const events = [
    productEvent({
      id: hex("1"),
      created_at: 100,
      tags: [
        ["d", "one"],
        ["title", "Widget One"],
        ["location", "New York"],
        ["price", "10", "USD"],
        ["t", "Tools"],
      ],
    }),
    productEvent({
      id: hex("2"),
      created_at: 99,
      tags: [
        ["d", "two"],
        ["title", "Widget Two"],
        ["location", "NEW YORK"],
        ["price", "20", "usd"],
        ["t", "TOOLS"],
      ],
    }),
  ];
  const ctx = context({ "wss://relay.example.com": events });

  const first = JSON.parse(
    (
      await handleSearchProducts(
        {
          keyword: "Widget",
          category: "Tools",
          location: "New York",
          currency: "USD",
          limit: 1,
        },
        ctx
      )
    ).content[0].text
  );
  const secondResponse = await handleSearchProducts(
    {
      keyword: "widget",
      category: "tools",
      location: "new york",
      currency: "usd",
      limit: 1,
      cursor: first._pagination.nextCursor,
    },
    ctx
  );
  const second = JSON.parse(secondResponse.content[0].text);

  assert.equal(secondResponse.isError, undefined);
  assert.equal(second.count, 1);
  assert.equal(second.products[0].id, hex("2"));
});

test("search_products never resurfaces a stale revision of a consumed product", async () => {
  const seller = hex("b");
  const latest = productEvent({
    id: hex("1"),
    pubkey: seller,
    created_at: 100,
    tags: [
      ["d", "replaceable"],
      ["title", "Latest revision"],
    ],
  });
  const other = productEvent({
    id: hex("2"),
    pubkey: seller,
    created_at: 99,
    tags: [
      ["d", "other"],
      ["title", "Other product"],
    ],
  });
  const stale = productEvent({
    id: hex("3"),
    pubkey: seller,
    created_at: 98,
    tags: [
      ["d", "replaceable"],
      ["title", "Stale revision"],
    ],
  });
  const thirdProduct = productEvent({
    id: hex("4"),
    pubkey: seller,
    created_at: 97,
    tags: [
      ["d", "third"],
      ["title", "Third product"],
    ],
  });
  let fetchCount = 0;
  const ctx = {
    ...context({ "wss://relay.example.com": [] }),
    nostr: {
      async fetch() {
        fetchCount += 1;
        if (fetchCount === 1) return [latest, other];
        if (fetchCount === 2) return [other, stale, thirdProduct];
        return [stale];
      },
    },
  };

  const first = JSON.parse(
    (await handleSearchProducts({ limit: 1 }, ctx)).content[0].text
  );
  const second = JSON.parse(
    (
      await handleSearchProducts(
        { limit: 1, cursor: first._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );
  const third = JSON.parse(
    (
      await handleSearchProducts(
        { limit: 1, cursor: second._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );

  assert.deepEqual(
    [first, second, third].flatMap((page) =>
      page.products.map((product) => product.d)
    ),
    ["replaceable", "other"]
  );
  assert.equal(third._pagination.nextCursor, null);
});

test("search_products advances a sparse search through a full relay window", async () => {
  const initialWindow = [100, 99, 98, 97, 96].map((created_at, index) =>
    productEvent({
      id: hex(String(index + 1)),
      created_at,
      tags: [
        ["d", `initial-${index}`],
        ["title", index === 0 ? "Matching product" : "Other product"],
      ],
    })
  );
  const olderWindow = [
    productEvent({
      id: hex("6"),
      created_at: 95,
      tags: [
        ["d", "older"],
        ["title", "Matching older product"],
      ],
    }),
  ];
  const capturedFilters = [];
  const ctx = {
    ...context({ "wss://relay.example.com": [] }),
    nostr: {
      async fetch(requestFilters) {
        capturedFilters.push(requestFilters);
        return requestFilters[0].until === undefined
          ? initialWindow
          : olderWindow;
      },
    },
  };

  const first = JSON.parse(
    (await handleSearchProducts({ keyword: "matching", limit: 1 }, ctx))
      .content[0].text
  );
  assert.equal(first.products[0].id, hex("1"));
  assert.equal(first._pagination.hasMore, true);
  assert.equal(typeof first._pagination.nextCursor, "string");

  const second = JSON.parse(
    (
      await handleSearchProducts(
        { keyword: "matching", limit: 1, cursor: first._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );
  assert.equal(second.products[0].id, hex("6"));
  assert.equal(capturedFilters[1][0].until, 96);
});

test("search_products does not overfill cursor seen ids for a large sparse relay window", async () => {
  const saturatedWindow = Array.from({ length: 185 }, (_, index) =>
    productEvent({
      id: index.toString(16).padStart(64, "0"),
      created_at: 1_000 - index,
      tags: [
        ["d", `window-${index}`],
        ["title", index === 0 ? "Electronics Match" : "Other Product"],
      ],
    })
  );
  const olderWindow = [
    productEvent({
      id: hex("f"),
      created_at: 814,
      tags: [
        ["d", "older-electronics"],
        ["title", "Older Electronics Match"],
      ],
    }),
  ];
  const capturedFilters = [];
  const ctx = {
    ...context({ "wss://relay.example.com": [] }),
    nostr: {
      async fetch(filters) {
        capturedFilters.push(filters);
        return filters[0].until === undefined ? saturatedWindow : olderWindow;
      },
    },
  };

  const first = JSON.parse(
    (await handleSearchProducts({ keyword: "electronics" }, ctx)).content[0]
      .text
  );
  const decodedCursor = decodePaginationCursor(first._pagination.nextCursor, {
    tool: "search_products",
    query: createQueryFingerprint("search_products", [
      "electronics",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      37,
      "newest",
    ]),
  });
  const second = JSON.parse(
    (
      await handleSearchProducts(
        { keyword: "electronics", cursor: first._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );

  assert.equal(first.count, 1);
  assert.equal(first._pagination.hasMore, true);
  assert.equal(decodedCursor.boundary, 816);
  assert.ok(decodedCursor.seen.length <= 2);
  assert.equal(capturedFilters[1][0].until, 816);
  assert.equal(second.products[0].id, olderWindow[0].id);
});

test("search_products advances from the newest saturated relay boundary", async () => {
  const saturatedRelay = "wss://saturated.example.com";
  const olderUnsaturatedRelay = "wss://older.example.com";
  const saturatedWindow = [100, 99, 98, 97, 96].map((created_at, index) =>
    productEvent({
      id: hex(String(index + 1)),
      created_at,
      tags: [
        ["d", `saturated-${index}`],
        ["title", "Other product"],
      ],
    })
  );
  const oldUnsaturatedEvent = productEvent({
    id: hex("6"),
    created_at: 50,
    tags: [
      ["d", "old-unsaturated"],
      ["title", "Matching old unsaturated product"],
    ],
  });
  const olderMatchingProduct = productEvent({
    id: hex("f"),
    created_at: 95,
    tags: [
      ["d", "older-match"],
      ["title", "Matching older product"],
    ],
  });
  const requests = [];
  const ctx = {
    ...context({}),
    relays: [saturatedRelay, olderUnsaturatedRelay],
    nostr: {
      async fetch(filters, _params, relayUrls) {
        const relay = relayUrls[0];
        requests.push({ relay, until: filters[0].until });
        if (relay === saturatedRelay) {
          if (filters[0].until === undefined) return saturatedWindow;
          return filters[0].until === 96 ? [olderMatchingProduct] : [];
        }
        return [oldUnsaturatedEvent];
      },
    },
  };

  const first = JSON.parse(
    (await handleSearchProducts({ keyword: "matching", limit: 1 }, ctx))
      .content[0].text
  );
  const second = JSON.parse(
    (
      await handleSearchProducts(
        { keyword: "matching", limit: 1, cursor: first._pagination.nextCursor },
        ctx
      )
    ).content[0].text
  );
  const third = JSON.parse(
    (
      await handleSearchProducts(
        {
          keyword: "matching",
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
    requests.find(
      (request) =>
        request.relay === saturatedRelay && request.until !== undefined
    )?.until,
    96
  );
  assert.equal(second.products[0].id, olderMatchingProduct.id);
  assert.equal(third.products[0].id, oldUnsaturatedEvent.id);
});

test("search_products advances from a saturated continuation window containing only consumed revisions", async () => {
  const seller = hex("b");
  const consumedIdentity = `30402:${seller}:consumed`;
  const cursor = createPaginationCursor({
    tool: "search_products",
    query: createQueryFingerprint("search_products", [
      "matching",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      "newest",
    ]),
    boundary: 100,
    seen: [hashPaginationLogicalIdentity(consumedIdentity)],
  });
  const consumedRevisions = Array.from({ length: 6 }, (_, index) =>
    productEvent({
      id: (index + 1).toString(16).padStart(64, "0"),
      pubkey: seller,
      created_at: 99 - index,
      tags: [
        ["d", "consumed"],
        ["title", "Already consumed"],
      ],
    })
  );
  const olderProduct = productEvent({
    id: hex("f"),
    pubkey: seller,
    created_at: 93,
    tags: [
      ["d", "older"],
      ["title", "Matching older product"],
    ],
  });
  const capturedFilters = [];
  const ctx = {
    ...context({ "wss://relay.example.com": [] }),
    nostr: {
      async fetch(filters) {
        capturedFilters.push(filters);
        return filters[0].until === 100 ? consumedRevisions : [olderProduct];
      },
    },
  };

  const emptyPage = JSON.parse(
    (await handleSearchProducts({ keyword: "matching", limit: 1, cursor }, ctx))
      .content[0].text
  );
  const olderPage = JSON.parse(
    (
      await handleSearchProducts(
        {
          keyword: "matching",
          limit: 1,
          cursor: emptyPage._pagination.nextCursor,
        },
        ctx
      )
    ).content[0].text
  );

  assert.equal(emptyPage.count, 0);
  assert.equal(emptyPage._pagination.hasMore, true);
  assert.equal(typeof emptyPage._pagination.nextCursor, "string");
  assert.equal(capturedFilters[1][0].until, 94);
  assert.equal(olderPage.products[0].id, olderProduct.id);
});

test("search_products fails closed when a saturated all-seen window cannot advance its boundary", async () => {
  const seller = hex("b");
  const consumedIdentity = `30402:${seller}:consumed`;
  const cursor = createPaginationCursor({
    tool: "search_products",
    query: createQueryFingerprint("search_products", [
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      "newest",
    ]),
    boundary: 100,
    seen: [hashPaginationLogicalIdentity(consumedIdentity)],
  });
  const response = await handleSearchProducts(
    { limit: 1, cursor },
    context({
      "wss://relay.example.com": Array.from({ length: 6 }, (_, index) =>
        productEvent({
          id: (index + 1).toString(16).padStart(64, "0"),
          pubkey: seller,
          created_at: 100,
          tags: [["d", "consumed"]],
        })
      ),
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "PAGINATION_LIMIT");
  assert.equal(body.retryable, false);
});

test("search_products does not advance a sparse window from aggregate relay counts", async () => {
  const eventsByRelay = {
    "wss://first.example.com": ["1", "2", "3", "4"].map((id, index) =>
      productEvent({
        id: hex(id),
        created_at: 100 - index,
        tags: [
          ["d", `first-${id}`],
          ["title", "Other product"],
        ],
      })
    ),
    "wss://second.example.com": ["5", "6", "7", "8"].map((id, index) =>
      productEvent({
        id: hex(id),
        created_at: 90 - index,
        tags: [
          ["d", `second-${id}`],
          ["title", "Other product"],
        ],
      })
    ),
  };

  const body = JSON.parse(
    (
      await handleSearchProducts(
        { keyword: "matching", limit: 1 },
        context(eventsByRelay)
      )
    ).content[0].text
  );

  assert.equal(body.count, 0);
  assert.equal(body._pagination.hasMore, false);
  assert.equal(body._pagination.nextCursor, null);
});

test("search_products applies the same cursor boundary and limit to category fallback", async () => {
  const capturedFilters = [];
  const cursor = createPaginationCursor({
    tool: "search_products",
    query: createQueryFingerprint("search_products", [
      undefined,
      "shoes",
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      "newest",
    ]),
    boundary: 100,
    seen: [],
  });
  const ctx = {
    ...context({ "wss://relay.example.com": [] }),
    nostr: {
      async fetch(filters) {
        capturedFilters.push(filters);
        return filters[0]["#t"]
          ? []
          : [
              productEvent({
                id: hex("1"),
                created_at: 100,
                tags: [
                  ["d", "shoe"],
                  ["title", "Running Shoe"],
                  ["t", "shoes"],
                ],
              }),
            ];
      },
    },
  };

  const body = JSON.parse(
    (await handleSearchProducts({ category: "shoes", limit: 1, cursor }, ctx))
      .content[0].text
  );

  assert.equal(body.count, 1);
  assert.equal(capturedFilters.length, 2);
  for (const [filter] of capturedFilters) {
    assert.equal(filter.until, 100);
    assert.equal(filter.limit, 5);
  }
});

test("search_products rejects mismatched cursors before calling relays", async () => {
  let fetchCalls = 0;
  const cursor = createPaginationCursor({
    tool: "search_products",
    query: createQueryFingerprint("search_products", [
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      "newest",
    ]),
    boundary: 100,
    seen: [],
  });
  const ctx = {
    ...context({ "wss://relay.example.com": [] }),
    nostr: {
      async fetch() {
        fetchCalls++;
        return [];
      },
    },
  };

  const response = await handleSearchProducts(
    { keyword: "different", limit: 1, cursor },
    ctx
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "VALIDATION_ERROR");
  assert.equal(body.retryable, false);
  assert.equal(fetchCalls, 0);
});

test("search_products rejects an empty cursor before calling relays", async () => {
  let fetchCalls = 0;
  const ctx = {
    ...context({ "wss://relay.example.com": [] }),
    nostr: {
      async fetch() {
        fetchCalls++;
        return [];
      },
    },
  };

  const response = await handleSearchProducts({ cursor: "" }, ctx);
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "VALIDATION_ERROR");
  assert.equal(body.retryable, false);
  assert.equal(fetchCalls, 0);
});

test("search_products rejects cursors for price sorts before calling relays", async () => {
  let fetchCalls = 0;
  const ctx = {
    ...context({ "wss://relay.example.com": [] }),
    nostr: {
      async fetch() {
        fetchCalls++;
        return [];
      },
    },
  };

  const response = await handleSearchProducts(
    { sortBy: "price_asc", currency: "USD", cursor: "not-allowed" },
    ctx
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "VALIDATION_ERROR");
  assert.equal(body.retryable, false);
  assert.equal(fetchCalls, 0);
});

test("search_products rejects price sorting without currency before calling relays", async () => {
  let fetchCalls = 0;
  const ctx = {
    ...context({ "wss://relay.example.com": [] }),
    nostr: {
      async fetch() {
        fetchCalls += 1;
        return [];
      },
    },
  };

  const response = await handleSearchProducts({ sortBy: "price_desc" }, ctx);
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "VALIDATION_ERROR");
  assert.equal(fetchCalls, 0);
});

test("search_products returns no cursor for price sorts", async () => {
  const response = await handleSearchProducts(
    { sortBy: "price_asc", currency: "USD", limit: 1 },
    context({
      "wss://relay.example.com": [
        productEvent({
          id: hex("1"),
          created_at: 10,
          tags: [
            ["d", "expensive"],
            ["title", "Expensive Product"],
            ["price", "20", "USD"],
          ],
        }),
        productEvent({
          id: hex("2"),
          created_at: 20,
          tags: [
            ["d", "cheap"],
            ["title", "Cheap Product"],
            ["price", "5", "USD"],
          ],
        }),
      ],
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.count, 1);
  assert.equal(body.products[0].title, "Cheap Product");
  assert.equal(body._pagination.nextCursor, null);
  assert.equal(body._pagination.hasMore, false);
  assert.equal(body._meta._truncated, true);
  assert.equal(
    body._meta._hints.some((hint) => hint.includes("Price-sorted search")),
    true
  );
});
