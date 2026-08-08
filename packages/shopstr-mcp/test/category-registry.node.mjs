import assert from "node:assert/strict";
import test from "node:test";

import {
  CATEGORY_VARIANT_REGISTRY_MAX_ENTRIES,
  getCategoryQueryVariants,
  observeCategoryTag,
} from "../dist/tools/utils/common.js";

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
