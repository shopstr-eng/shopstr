import assert from "node:assert/strict";
import test from "node:test";

import { nip19 } from "nostr-tools";

import {
  canonicalizePubkey,
  companyDetailsInputSchema,
  eventIdSchema,
  listCompaniesSchema,
  pubkeySchema,
  reviewsInputSchema,
  searchProductsSchema,
  searchSchema,
  sellerReputationInputSchema,
} from "../dist/validation.js";

const pubkey = "a".repeat(64);

test("canonicalizes uppercase hex, nostr prefixes, and npub addresses", () => {
  assert.equal(canonicalizePubkey(pubkey.toUpperCase()), pubkey);
  assert.equal(canonicalizePubkey(`nostr:${pubkey.toUpperCase()}`), pubkey);
  assert.equal(canonicalizePubkey(nip19.npubEncode(pubkey)), pubkey);
  assert.equal(pubkeySchema.parse(nip19.npubEncode(pubkey)), pubkey);
});

test("validates event ids as canonical 64-char lowercase hex", () => {
  assert.equal(eventIdSchema.parse("B".repeat(64)), "b".repeat(64));
  assert.equal(eventIdSchema.safeParse("not-an-id").success, false);
});

test("normalizes search strings", () => {
  assert.equal(searchSchema.parse("  hardware   wallet  "), "hardware wallet");
});

test("requires currency when price filters or price sorting are used", () => {
  assert.equal(
    searchProductsSchema.safeParse({ maxPrice: 50, limit: 10 }).success,
    false
  );
  assert.equal(
    searchProductsSchema.safeParse({ sortBy: "price_asc" }).success,
    false
  );
  assert.equal(
    searchProductsSchema.safeParse({ sortBy: "price_desc" }).success,
    false
  );
  const parsed = searchProductsSchema.parse({
    maxPrice: 50,
    currency: " USD ",
    limit: "10",
  });
  assert.equal(parsed.currency, "USD");
  assert.equal(parsed.limit, 10);
  assert.equal(
    searchProductsSchema.safeParse({
      sortBy: "price_asc",
      currency: "USD",
    }).success,
    true
  );
});

test("search product pagination accepts a bounded cursor and rejects legacy until", () => {
  const parsed = searchProductsSchema.parse({ cursor: "cursor-token" });
  assert.equal(parsed.cursor, "cursor-token");
  assert.equal(
    searchProductsSchema.safeParse({ cursor: "a".repeat(16_385) }).success,
    false
  );
  assert.equal(searchProductsSchema.safeParse({ until: 1 }).success, false);
});

test("requires at least one reviews lookup identifier", () => {
  assert.equal(reviewsInputSchema.safeParse({}).success, false);
  assert.equal(
    reviewsInputSchema.safeParse({ sellerPubkey: pubkey.toUpperCase() })
      .success,
    true
  );
});

test("reviews pagination accepts a cursor and rejects legacy until", () => {
  const parsed = reviewsInputSchema.parse({
    sellerPubkey: pubkey,
    cursor: "cursor-token",
  });
  assert.equal(parsed.cursor, "cursor-token");
  assert.equal(
    reviewsInputSchema.safeParse({ sellerPubkey: pubkey, until: 1 }).success,
    false
  );
});

// ─── PR4 schema tests ───────────────────────────────────────────────

test("listCompaniesSchema defaults limit to 50, accepts a bounded cursor, and rejects legacy until", () => {
  const result = listCompaniesSchema.parse({});
  assert.equal(result.limit, 50);
  assert.equal(result.cursor, undefined);

  const withCursor = listCompaniesSchema.parse({ cursor: "cursor-token" });
  assert.equal(withCursor.cursor, "cursor-token");
  assert.equal(withCursor.limit, 50);
  assert.equal(
    listCompaniesSchema.safeParse({ until: 1700000000 }).success,
    false
  );
  assert.equal(
    listCompaniesSchema.safeParse({ cursor: "a".repeat(16_385) }).success,
    false
  );
});

test("companyDetailsInputSchema canonicalizes npub to hex", () => {
  const npub = nip19.npubEncode(pubkey);
  const result = companyDetailsInputSchema.parse({ sellerPubkey: npub });
  assert.equal(result.sellerPubkey, pubkey);
  assert.deepEqual(result.include, ["products", "reviews"]);
});

test("companyDetailsInputSchema rejects invalid pubkey", () => {
  assert.equal(
    companyDetailsInputSchema.safeParse({ sellerPubkey: "not-a-key" }).success,
    false
  );
});

test("companyDetailsInputSchema supports include sections", () => {
  const result = companyDetailsInputSchema.parse({
    sellerPubkey: pubkey,
    include: [],
  });

  assert.deepEqual(result.include, []);
});

test("sellerReputationInputSchema canonicalizes pubkey", () => {
  const result = sellerReputationInputSchema.parse({
    sellerPubkey: pubkey.toUpperCase(),
  });
  assert.equal(result.sellerPubkey, pubkey);
});

test("sellerReputationInputSchema rejects missing sellerPubkey", () => {
  assert.equal(sellerReputationInputSchema.safeParse({}).success, false);
});
