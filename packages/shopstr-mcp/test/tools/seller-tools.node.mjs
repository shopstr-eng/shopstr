import assert from "node:assert/strict";
import test from "node:test";

import { nip19 } from "nostr-tools";

import { MemoryCache } from "../../dist/cache.js";
import { handleGetCompanyDetails } from "../../dist/tools/get-company-details.js";
import { handleGetSellerReputation } from "../../dist/tools/get-seller-reputation.js";
import { handleGetStorefront } from "../../dist/tools/get-storefront.js";
import { handleListCompanies } from "../../dist/tools/list-companies.js";
import { REVIEW_PRODUCT_FILTER_LIMIT } from "../../dist/tools/utils/common.js";

const hex = (char) => char.repeat(64);
const sellerPubkey = hex("8");
const reviewerPubkey = hex("7");
const productAddress = `30402:${sellerPubkey}:coffee`;

function profileEvent(overrides = {}) {
  return {
    id: hex("1"),
    pubkey: sellerPubkey,
    created_at: 100,
    kind: 0,
    tags: [],
    content: JSON.stringify({
      name: "Fresh Seller",
      display_name: "Fresh Seller",
      about: "Public seller profile",
      website: "https://example.com",
    }),
    sig: "a".repeat(128),
    ...overrides,
  };
}

function shopEvent(overrides = {}) {
  return {
    id: hex("2"),
    pubkey: sellerPubkey,
    created_at: 120,
    kind: 30019,
    tags: [],
    content: JSON.stringify({
      name: "Fresh Shop",
      about: "Relay-native storefront",
      storefront: {
        shopSlug: "fresh-shop",
        productLayout: "grid",
      },
      freeShippingThreshold: 100,
      freeShippingCurrency: "USD",
    }),
    sig: "b".repeat(128),
    ...overrides,
  };
}

function productEvent(overrides = {}) {
  return {
    id: hex("3"),
    pubkey: sellerPubkey,
    created_at: 130,
    kind: 30402,
    tags: [
      ["d", "coffee"],
      ["title", "Coffee Beans"],
      ["summary", "Washed process coffee"],
      ["price", "25", "USD"],
      ["shipping", "Free", "0", "USD"],
      ["t", "Coffee"],
    ],
    content: "",
    sig: "c".repeat(128),
    ...overrides,
  };
}

function reviewEvent(overrides = {}) {
  return {
    id: hex("4"),
    pubkey: reviewerPubkey,
    created_at: 140,
    kind: 31555,
    tags: [
      ["d", `a:${productAddress}`],
      ["rating", "1", "thumb"],
      ["rating", "0.8", "quality"],
    ],
    content: "Fast shipping and good product.",
    sig: "d".repeat(128),
    ...overrides,
  };
}

function context(fetchImpl, cache = new MemoryCache(60_000)) {
  const calls = [];
  return {
    calls,
    relays: ["wss://relay.example.com"],
    timeoutMs: 100,
    cache,
    nostr: {
      async fetch(filters) {
        calls.push(filters);
        return fetchImpl(filters);
      },
    },
  };
}

function sellerFetch(filters) {
  if (
    filters.some((filter) =>
      filter.kinds?.some((kind) => kind === 0 || kind === 30019)
    )
  ) {
    return [profileEvent(), shopEvent()];
  }
  if (filters.some((filter) => filter.kinds?.includes(30402))) {
    return [productEvent()];
  }
  if (filters.some((filter) => filter.kinds?.includes(31555))) {
    return [reviewEvent()];
  }
  return [];
}

// ─── list_companies ──────────────────────────────────────────────────

test("list_companies fetches latest public shop profiles and budgets results", async () => {
  const response = await handleListCompanies(
    { limit: 1 },
    context(() => [
      shopEvent({
        id: hex("5"),
        created_at: 80,
        content: JSON.stringify({ name: "Old Shop" }),
      }),
      shopEvent(),
      shopEvent({
        id: hex("6"),
        pubkey: hex("9"),
        created_at: 110,
        content: JSON.stringify({ name: "Second Shop" }),
      }),
    ])
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, undefined);
  assert.equal(body.count, 1);
  assert.equal(body.totalMatches, 2);
  assert.equal(body.companies[0].name, "Fresh Shop");
  assert.equal(body._meta._truncated, true);
});

test("list_companies passes until to relay filter and includes _pagination", async () => {
  const ctx = context((filters) => {
    // Verify the until parameter is passed to relay filter
    assert.ok(filters.some((f) => f.until === 100));
    return [
      shopEvent({ created_at: 90 }),
      shopEvent({
        id: hex("6"),
        pubkey: hex("9"),
        created_at: 80,
        content: JSON.stringify({ name: "Older Shop" }),
      }),
    ];
  });
  const response = await handleListCompanies({ limit: 10, until: 100 }, ctx);
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.count, 2);
  assert.ok(body._pagination);
  assert.equal(body._pagination.oldestCreatedAt, 80);
});

test("list_companies returns null oldestCreatedAt when empty", async () => {
  const response = await handleListCompanies(
    { limit: 10 },
    context(() => [])
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.count, 0);
  assert.equal(body._pagination.oldestCreatedAt, null);
});

// ─── get_company_details ─────────────────────────────────────────────

test("get_company_details merges profiles, products, reviews, and cache metadata", async () => {
  const cache = new MemoryCache(60_000);
  const ctx = context(sellerFetch, cache);

  const first = await handleGetCompanyDetails({ pubkey: sellerPubkey }, ctx);
  const firstBody = JSON.parse(first.content[0].text);

  assert.equal(firstBody.pubkey, sellerPubkey);
  assert.equal(firstBody.shopProfile.name, "Fresh Shop");
  assert.equal(firstBody.shopProfile.storefrontUrl, "/shop/fresh-shop");
  assert.equal(firstBody.userProfile.name, "Fresh Seller");
  assert.equal(firstBody.userProfile.displayName, "Fresh Seller");
  assert.equal(firstBody.products.count, 1);
  assert.equal(firstBody.products.items[0].title, "Coffee Beans");
  assert.equal(firstBody.reviews.count, 1);
  assert.deepEqual(firstBody.paymentInfo.acceptedPaymentMethods, [
    "lightning",
    "cashu",
  ]);
  assert.equal(firstBody.paymentInfo.freeShippingAvailable, true);
  assert.deepEqual(firstBody._meta.cached, {
    userProfile: false,
    shopProfile: false,
  });

  const profileFetchesBefore = ctx.calls.filter((filters) =>
    filters.some((filter) =>
      filter.kinds?.some((kind) => kind === 0 || kind === 30019)
    )
  ).length;
  const second = await handleGetCompanyDetails({ pubkey: sellerPubkey }, ctx);
  const secondBody = JSON.parse(second.content[0].text);
  const profileFetchesAfter = ctx.calls.filter((filters) =>
    filters.some((filter) =>
      filter.kinds?.some((kind) => kind === 0 || kind === 30019)
    )
  ).length;

  assert.equal(profileFetchesAfter, profileFetchesBefore);
  assert.deepEqual(secondBody._meta.cached, {
    userProfile: true,
    shopProfile: true,
  });
});

test("get_company_details hints when review lookup is partial", async () => {
  const products = Array.from({ length: 21 }, (_, index) =>
    productEvent({
      id: (index + 1).toString(16).padStart(64, "0"),
      created_at: 130 + index,
      tags: [
        ["d", `item-${index}`],
        ["title", `Product ${index}`],
        ["summary", "Product beyond review scan cap"],
        ["price", "25", "USD"],
      ],
    })
  );
  const response = await handleGetCompanyDetails(
    { pubkey: sellerPubkey },
    context((filters) => {
      if (
        filters.some((filter) =>
          filter.kinds?.some((kind) => kind === 0 || kind === 30019)
        )
      ) {
        return [profileEvent(), shopEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(30402))) {
        return products;
      }
      if (filters.some((filter) => filter.kinds?.includes(31555))) {
        return [];
      }
      return [];
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, undefined);
  assert.equal(body.products.totalMatches, 21);
  assert.ok(
    body._meta._hints.some((hint) => hint.includes("Review lookup was partial"))
  );
});

test("get_company_details excludes hidden products and keeps mixed-currency price ranges explicit", async () => {
  const response = await handleGetCompanyDetails(
    { pubkey: sellerPubkey },
    context((filters) => {
      if (
        filters.some((filter) =>
          filter.kinds?.some((kind) => kind === 0 || kind === 30019)
        )
      ) {
        return [profileEvent(), shopEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(30402))) {
        return [
          productEvent({
            id: hex("a"),
            tags: [
              ["d", "coffee-usd"],
              ["title", "Coffee USD"],
              ["price", "25", "USD"],
            ],
          }),
          productEvent({
            id: hex("b"),
            tags: [
              ["d", "coffee-eur"],
              ["title", "Coffee EUR"],
              ["price", "20", "EUR"],
            ],
          }),
          productEvent({
            id: hex("c"),
            tags: [
              ["d", "hidden-coffee"],
              ["title", "Hidden Coffee"],
              ["price", "15", "USD"],
              ["visibility", "hidden"],
            ],
          }),
        ];
      }
      if (filters.some((filter) => filter.kinds?.includes(31555))) {
        return [];
      }
      return [];
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, undefined);
  assert.equal(body.products.count, 2);
  assert.deepEqual(body.products.items.map((product) => product.title).sort(), [
    "Coffee EUR",
    "Coffee USD",
  ]);
  assert.equal(body.paymentInfo.priceRange, null);
  assert.deepEqual(
    body.paymentInfo.priceRanges
      .map((range) => ({
        currency: range.currency,
        min: range.min,
        max: range.max,
        count: range.count,
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    [
      { currency: "EUR", min: 20, max: 20, count: 1 },
      { currency: "USD", min: 25, max: 25, count: 1 },
    ]
  );
});

test("get_company_details can return cached profiles when product and review relay fetches degrade", async () => {
  const cache = new MemoryCache(60_000);
  const warmContext = context(sellerFetch, cache);
  const warmResponse = await handleGetCompanyDetails(
    { pubkey: sellerPubkey },
    warmContext
  );
  assert.equal(warmResponse.isError, undefined);

  const degradedContext = context(() => {
    throw new Error("relay down");
  }, cache);
  const response = await handleGetCompanyDetails(
    { pubkey: sellerPubkey },
    degradedContext
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, undefined);
  assert.equal(body.shopProfile.name, "Fresh Shop");
  assert.equal(body.userProfile.name, "Fresh Seller");
  assert.equal(body.products.count, 0);
  assert.equal(body.reviews.count, 0);
  assert.equal(body._meta.degraded, true);
  assert.deepEqual(body._meta.cached, {
    userProfile: true,
    shopProfile: true,
  });
});

test("get_company_details accepts npub input via pubkeySchema", async () => {
  const npub = nip19.npubEncode(sellerPubkey);
  const response = await handleGetCompanyDetails(
    { pubkey: npub },
    context(sellerFetch)
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.pubkey, sellerPubkey);
  assert.equal(body.shopProfile.name, "Fresh Shop");
});

test("get_company_details returns NOT_FOUND for unknown pubkey", async () => {
  const response = await handleGetCompanyDetails(
    { pubkey: hex("f") },
    context(() => [])
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "NOT_FOUND");
});

test("get_company_details rejects invalid pubkey", async () => {
  const response = await handleGetCompanyDetails(
    { pubkey: "not-a-valid-key" },
    context(() => [])
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "VALIDATION_ERROR");
});

// ─── get_storefront ──────────────────────────────────────────────────

test("get_storefront requires pubkey and returns storefront data", async () => {
  const response = await handleGetStorefront(
    { pubkey: sellerPubkey },
    context(sellerFetch)
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.pubkey, sellerPubkey);
  assert.equal(body.storefront.shopSlug, "fresh-shop");
  assert.equal(body.storefront.storefrontUrl, "/shop/fresh-shop");
  assert.equal(body.storefront.customDomain, null);
  assert.equal(body.products.count, 1);
});

test("get_storefront rejects missing pubkey", async () => {
  const response = await handleGetStorefront({}, context(sellerFetch));
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "VALIDATION_ERROR");
});

test("get_storefront returns NOT_FOUND for unknown pubkey", async () => {
  const response = await handleGetStorefront(
    { pubkey: hex("f") },
    context(() => [])
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "NOT_FOUND");
});

// ─── get_seller_reputation ───────────────────────────────────────────

test("get_seller_reputation summarizes public review scores", async () => {
  const response = await handleGetSellerReputation(
    { sellerPubkey },
    context((filters) => {
      if (
        filters.some((filter) =>
          filter.kinds?.some((kind) => kind === 0 || kind === 30019)
        )
      ) {
        return [profileEvent(), shopEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(30402))) {
        return [productEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(31555))) {
        return [
          reviewEvent(),
          reviewEvent({
            id: hex("5"),
            pubkey: hex("6"),
            created_at: 150,
            tags: [
              ["d", `a:${productAddress}`],
              ["rating", "0", "thumb"],
              ["rating", "0.2", "quality"],
            ],
            content: "Poor communication.",
          }),
        ];
      }
      return [];
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.reviewCount, 2);
  assert.equal(body.productCount, 1);
  assert.equal(body.reputation.averageScore, 0.5);
  assert.equal(body.reputation.averagePercent, 50);
  assert.equal(body.reputation.positiveReviewCount, 1);
  assert.equal(body.reputation.negativeReviewCount, 1);
  assert.equal(body.reputation.trustLevel, "low");
  assert.deepEqual(body.reputation.ratingBreakdown.thumb, {
    average: 0.5,
    count: 2,
  });
  assert.equal(body.recentReviews.length, 2);
});

test("get_seller_reputation treats reviews with no ratings as unknown reputation", async () => {
  const response = await handleGetSellerReputation(
    { sellerPubkey },
    context((filters) => {
      if (
        filters.some((filter) =>
          filter.kinds?.some((kind) => kind === 0 || kind === 30019)
        )
      ) {
        return [profileEvent(), shopEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(30402))) {
        return [productEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(31555))) {
        return [
          reviewEvent({
            id: hex("a"),
            pubkey: hex("1"),
            tags: [["d", `a:${productAddress}`]],
          }),
          reviewEvent({
            id: hex("b"),
            pubkey: hex("2"),
            tags: [["d", `a:${productAddress}`]],
          }),
        ];
      }
      return [];
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.reviewCount, 2);
  assert.equal(body.reputation.averageScore, null);
  assert.equal(body.reputation.averagePercent, null);
  assert.deepEqual(body.reputation.ratingBreakdown, {});
  assert.equal(body.reputation.positiveReviewCount, 0);
  assert.equal(body.reputation.neutralReviewCount, 0);
  assert.equal(body.reputation.negativeReviewCount, 0);
  assert.equal(body.reputation.trustLevel, "unknown");
});

test("get_seller_reputation keeps a single positive review at low trust", async () => {
  const response = await handleGetSellerReputation(
    { sellerPubkey },
    context((filters) => {
      if (
        filters.some((filter) =>
          filter.kinds?.some((kind) => kind === 0 || kind === 30019)
        )
      ) {
        return [profileEvent(), shopEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(30402))) {
        return [productEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(31555))) {
        return [
          reviewEvent({
            tags: [
              ["d", `a:${productAddress}`],
              ["rating", "1", "thumb"],
            ],
          }),
        ];
      }
      return [];
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.reviewCount, 1);
  assert.equal(body.reputation.averageScore, 1);
  assert.equal(body.reputation.averagePercent, 100);
  assert.equal(body.reputation.positiveReviewCount, 1);
  assert.equal(body.reputation.trustLevel, "low");
});

test("get_seller_reputation marks exactly five reviews at 0.8 average as high trust", async () => {
  const reviews = ["1", "2", "3", "4", "5"].map((char) =>
    reviewEvent({
      id: hex(char),
      pubkey: hex(char),
      tags: [
        ["d", `a:${productAddress}`],
        ["rating", "0.8", "quality"],
      ],
    })
  );
  const response = await handleGetSellerReputation(
    { sellerPubkey },
    context((filters) => {
      if (
        filters.some((filter) =>
          filter.kinds?.some((kind) => kind === 0 || kind === 30019)
        )
      ) {
        return [profileEvent(), shopEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(30402))) {
        return [productEvent()];
      }
      if (filters.some((filter) => filter.kinds?.includes(31555))) {
        return reviews;
      }
      return [];
    })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(body.reviewCount, 5);
  assert.equal(body.reputation.averageScore, 0.8);
  assert.equal(body.reputation.averagePercent, 80);
  assert.equal(body.reputation.positiveReviewCount, 5);
  assert.equal(body.reputation.trustLevel, "high");
});

test("get_seller_reputation includes oldestListingDate", async () => {
  const response = await handleGetSellerReputation(
    { sellerPubkey },
    context(sellerFetch)
  );
  const body = JSON.parse(response.content[0].text);

  assert.ok(body.oldestListingDate);
  assert.equal(body.oldestListingDate, new Date(130 * 1000).toISOString());
});

test("get_seller_reputation caps product-address review filters and reports partial lookup", async () => {
  const products = Array.from(
    { length: REVIEW_PRODUCT_FILTER_LIMIT + 5 },
    (_, index) =>
      productEvent({
        id: (index + 1).toString(16).padStart(64, "0"),
        created_at: 130 + index,
        tags: [
          ["d", `capped-item-${index}`],
          ["title", `Capped Product ${index}`],
          ["price", "25", "USD"],
        ],
      })
  );
  const ctx = context((filters) => {
    if (
      filters.some((filter) =>
        filter.kinds?.some((kind) => kind === 0 || kind === 30019)
      )
    ) {
      return [profileEvent(), shopEvent()];
    }
    if (filters.some((filter) => filter.kinds?.includes(30402))) {
      return products;
    }
    if (filters.some((filter) => filter.kinds?.includes(31555))) {
      return [];
    }
    return [];
  });

  const response = await handleGetSellerReputation({ sellerPubkey }, ctx);
  const body = JSON.parse(response.content[0].text);
  const reviewFilters = ctx.calls.find((filters) =>
    filters.some((filter) => filter.kinds?.includes(31555))
  );

  assert.equal(response.isError, undefined);
  assert.ok(reviewFilters);
  assert.equal(
    reviewFilters.filter((filter) => Array.isArray(filter["#d"])).length,
    REVIEW_PRODUCT_FILTER_LIMIT
  );
  assert.equal(
    reviewFilters.filter((filter) => Array.isArray(filter["#a"])).length,
    REVIEW_PRODUCT_FILTER_LIMIT
  );
  assert.equal(
    reviewFilters.some((filter) => filter["#p"]?.includes(sellerPubkey)),
    true
  );
  assert.ok(
    body._meta._hints.some((hint) => hint.includes("Review lookup was partial"))
  );
});

test("get_seller_reputation returns NOT_FOUND for unknown seller", async () => {
  const response = await handleGetSellerReputation(
    { sellerPubkey: hex("f") },
    context(() => [])
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "NOT_FOUND");
});
