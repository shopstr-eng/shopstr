import assert from "node:assert/strict";
import test from "node:test";

import { handleSearchProducts } from "../../dist/tools/search-products.js";
import { MemoryCache } from "../../dist/cache.js";
import {
  createPaginationCursor,
  createQueryFingerprint,
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
