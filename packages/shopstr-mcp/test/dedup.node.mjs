import assert from "node:assert/strict";
import test from "node:test";

import {
  getParameterizedReplaceableCoordinate,
  mergeAndDeduplicateProducts,
  mergeAndDeduplicateProfiles,
  mergeAndDeduplicateReviews,
} from "../dist/dedup.js";

const hex = (char) => char.repeat(64);

function event(overrides = {}) {
  return {
    id: hex("a"),
    pubkey: hex("b"),
    created_at: 1,
    kind: 30402,
    tags: [["d", "product-1"]],
    content: "",
    sig: "c".repeat(128),
    ...overrides,
  };
}

test("builds parameterized replaceable coordinates from kind/pubkey/d-tag", () => {
  const sample = event();
  assert.equal(
    getParameterizedReplaceableCoordinate(sample),
    `30402:${sample.pubkey}:product-1`
  );
});

test("deduplicates products by coordinate and keeps latest event", () => {
  const older = event({ id: hex("1"), created_at: 10 });
  const newer = event({ id: hex("2"), created_at: 20 });
  const other = event({
    id: hex("3"),
    created_at: 15,
    tags: [["d", "product-2"]],
  });

  const deduped = mergeAndDeduplicateProducts([older, newer, other]);

  assert.deepEqual(
    deduped.map((item) => item.id),
    [hex("2"), hex("3")]
  );
});

test("deduplicates identical event ids after coordinate merge", () => {
  const duplicateA = event({ id: hex("4"), tags: [["d", "a"]] });
  const duplicateB = event({ id: hex("4"), tags: [["d", "b"]] });

  const deduped = mergeAndDeduplicateProducts([duplicateA, duplicateB]);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].id, hex("4"));
});

test("deduplicates reviews by reviewer and target d-tag", () => {
  const older = event({
    id: hex("5"),
    kind: 31555,
    created_at: 10,
    tags: [["d", "reviewer:product"]],
  });
  const newer = event({
    id: hex("6"),
    kind: 31555,
    created_at: 20,
    tags: [["d", "reviewer:product"]],
  });
  const other = event({
    id: hex("7"),
    kind: 31555,
    pubkey: hex("d"),
    created_at: 15,
    tags: [["d", "reviewer:product"]],
  });

  const deduped = mergeAndDeduplicateReviews([older, newer, other]);

  assert.deepEqual(
    deduped.map((item) => item.id),
    [hex("6"), hex("7")]
  );
});

test("deduplicates Gamma d-tag and standard a-tag reviews by product address", () => {
  const productAddress = `30402:${hex("8")}:product-1`;
  const gammaReview = event({
    id: hex("8"),
    kind: 31555,
    created_at: 10,
    tags: [["d", `a:${productAddress}`]],
  });
  const standardReview = event({
    id: hex("9"),
    kind: 31555,
    created_at: 20,
    tags: [
      ["d", productAddress],
      ["a", productAddress],
    ],
  });

  const deduped = mergeAndDeduplicateReviews([gammaReview, standardReview]);

  assert.deepEqual(
    deduped.map((item) => item.id),
    [hex("9")]
  );
});

test("far-future product does not beat a current valid product for the same coordinate", () => {
  const now = Math.floor(Date.now() / 1000);
  const valid = event({ id: hex("c"), created_at: now - 60 }); // 1 minute ago
  const future = event({ id: hex("d"), created_at: now + 999999 }); // far future

  const deduped = mergeAndDeduplicateProducts([future, valid]);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].id, hex("c"), "should prefer the non-future event");
});

test("far-future review does not beat a current valid review for the same target", () => {
  const now = Math.floor(Date.now() / 1000);
  const valid = event({
    id: hex("e"),
    kind: 31555,
    created_at: now - 60,
    tags: [["d", "reviewer:product"]],
  });
  const future = event({
    id: hex("f"),
    kind: 31555,
    created_at: now + 999999,
    tags: [["d", "reviewer:product"]],
  });

  const deduped = mergeAndDeduplicateReviews([future, valid]);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].id, hex("e"), "should prefer the non-future event");
});

test("deduplicates profiles by pubkey+kind keeping latest", () => {
  const older = event({
    id: hex("a"),
    kind: 0,
    created_at: 10,
    content: JSON.stringify({ name: "Old Name" }),
  });
  const newer = event({
    id: hex("b"),
    kind: 0,
    created_at: 20,
    content: JSON.stringify({ name: "New Name" }),
  });

  const deduped = mergeAndDeduplicateProfiles([older, newer]);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].id, hex("b"));
});

test("deduplicates profiles across mixed kinds (0 and 30019)", () => {
  const userProfile = event({
    id: hex("a"),
    kind: 0,
    created_at: 10,
    content: JSON.stringify({ name: "User" }),
  });
  const shopProfile = event({
    id: hex("b"),
    kind: 30019,
    created_at: 20,
    content: JSON.stringify({ name: "Shop" }),
  });
  const olderShop = event({
    id: hex("c"),
    kind: 30019,
    created_at: 15,
    content: JSON.stringify({ name: "Old Shop" }),
  });

  const deduped = mergeAndDeduplicateProfiles([
    userProfile,
    shopProfile,
    olderShop,
  ]);
  assert.equal(deduped.length, 2);
  assert.deepEqual(deduped.map((p) => p.kind).sort(), [0, 30019]);
  // Shop should be the newer one
  const shop = deduped.find((p) => p.kind === 30019);
  assert.equal(shop.id, hex("b"));
});

test("mergeAndDeduplicateProfiles returns empty array for empty input", () => {
  const deduped = mergeAndDeduplicateProfiles([]);
  assert.deepEqual(deduped, []);
});
