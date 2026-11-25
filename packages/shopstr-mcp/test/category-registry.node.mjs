import assert from "node:assert/strict";
import test from "node:test";

import {
  CATEGORY_VARIANT_REGISTRY_MAX_ENTRIES,
  getCategoryQueryVariants,
  getObservedCategoryVariants,
  observeCategoryTag,
  observeCategoryTags,
} from "../dist/tools/utils/common.js";

test("category variant registry rejects control characters and oversized tags", () => {
  const nulCategory = "unsafe\0category";
  const controlCategory = "unsafe\u0001category";
  const delCategory = "unsafe\u007fcategory";
  const oversizedCategory = "x".repeat(101);

  for (const category of [
    nulCategory,
    controlCategory,
    delCategory,
    oversizedCategory,
  ]) {
    observeCategoryTag(category);
    assert.deepEqual(getObservedCategoryVariants(category), []);
  }
});

test("category variant registry accepts at most 20 valid tags per event", () => {
  const prefix = "per-event-registry-category";
  observeCategoryTags(
    Array.from({ length: 25 }, (_, index) => ["t", `${prefix}-${index}`])
  );

  for (let index = 0; index < 20; index++) {
    assert.deepEqual(getObservedCategoryVariants(`${prefix}-${index}`), [
      `${prefix}-${index}`,
    ]);
  }
  assert.deepEqual(getObservedCategoryVariants(`${prefix}-20`), []);
});

test("category variant registry evicts oldest observed raw variant", () => {
  observeCategoryTag("MiXeD Weird");

  for (let index = 0; index < CATEGORY_VARIANT_REGISTRY_MAX_ENTRIES; index++) {
    observeCategoryTag(`unique-category-${index}`);
  }

  assert.equal(
    getCategoryQueryVariants("mixed weird").includes("MiXeD Weird"),
    false
  );
  assert.equal(
    getCategoryQueryVariants(
      `unique-category-${CATEGORY_VARIANT_REGISTRY_MAX_ENTRIES - 1}`
    ).includes(`unique-category-${CATEGORY_VARIANT_REGISTRY_MAX_ENTRIES - 1}`),
    true
  );
});
