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
  storefrontInputSchema,
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

test("requires currency when price filters are used", () => {
  assert.equal(
    searchProductsSchema.safeParse({ maxPrice: 50, limit: 10 }).success,
    false
  );
  const parsed = searchProductsSchema.parse({
    maxPrice: 50,
    currency: " USD ",
    limit: "10",
  });
  assert.equal(parsed.currency, "USD");
  assert.equal(parsed.limit, 10);
});

test("requires at least one reviews lookup identifier", () => {
  assert.equal(reviewsInputSchema.safeParse({}).success, false);
  assert.equal(
    reviewsInputSchema.safeParse({ sellerPubkey: pubkey.toUpperCase() })
      .success,
    true
  );
});

// ─── PR4 schema tests ───────────────────────────────────────────────

test("listCompaniesSchema defaults limit to 50 and accepts until", () => {
  const result = listCompaniesSchema.parse({});
  assert.equal(result.limit, 50);
  assert.equal(result.until, undefined);

  const withUntil = listCompaniesSchema.parse({ until: 1700000000 });
  assert.equal(withUntil.until, 1700000000);
  assert.equal(withUntil.limit, 50);
});

test("listCompaniesSchema rejects negative until", () => {
  assert.equal(listCompaniesSchema.safeParse({ until: -1 }).success, false);
});

test("companyDetailsInputSchema canonicalizes npub to hex", () => {
  const npub = nip19.npubEncode(pubkey);
  const result = companyDetailsInputSchema.parse({ pubkey: npub });
  assert.equal(result.pubkey, pubkey);
});

test("companyDetailsInputSchema rejects invalid pubkey", () => {
  assert.equal(
    companyDetailsInputSchema.safeParse({ pubkey: "not-a-key" }).success,
    false
  );
});

test("storefrontInputSchema requires pubkey", () => {
  assert.equal(storefrontInputSchema.safeParse({}).success, false);
  assert.equal(
    storefrontInputSchema.safeParse({ pubkey: pubkey }).success,
    true
  );
});

test("storefrontInputSchema canonicalizes npub pubkey", () => {
  const npub = nip19.npubEncode(pubkey);
  const result = storefrontInputSchema.parse({ pubkey: npub });
  assert.equal(result.pubkey, pubkey);
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
