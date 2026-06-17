import assert from "node:assert/strict";
import test from "node:test";

import { nip19 } from "nostr-tools";

import { MemoryCache } from "../../dist/cache.js";
import { handleGetCompanyDetails } from "../../dist/tools/get-company-details.js";
import { handleGetSellerReputation } from "../../dist/tools/get-seller-reputation.js";
import { handleGetStorefront } from "../../dist/tools/get-storefront.js";
import { handleListCompanies } from "../../dist/tools/list-companies.js";

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

test("get_seller_reputation includes oldestListingDate", async () => {
  const response = await handleGetSellerReputation(
    { sellerPubkey },
    context(sellerFetch)
  );
  const body = JSON.parse(response.content[0].text);

  assert.ok(body.oldestListingDate);
  assert.equal(body.oldestListingDate, new Date(130 * 1000).toISOString());
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
