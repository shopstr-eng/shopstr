import assert from "node:assert/strict";
import test from "node:test";

import { nip19 } from "nostr-tools";

import {
  canonicalizePubkey,
  eventIdSchema,
  pubkeySchema,
  reviewsInputSchema,
  searchProductsSchema,
  searchSchema,
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
