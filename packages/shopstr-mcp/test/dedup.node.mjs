import assert from "node:assert/strict";
import test from "node:test";

import {
  getParameterizedReplaceableCoordinate,
  mergeAndDeduplicateProducts,
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
