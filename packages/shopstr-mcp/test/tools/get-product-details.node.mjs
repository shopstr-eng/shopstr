import assert from "node:assert/strict";
import test from "node:test";

import { handleGetProductDetails } from "../../dist/tools/get-product-details.js";

const hex = (char) => char.repeat(64);

function productEvent(overrides = {}) {
  return {
    id: hex("a"),
    pubkey: hex("b"),
    created_at: 100,
    kind: 30402,
    tags: [
      ["d", "product"],
      ["title", "Linen Shirt"],
      ["summary", "A nice shirt"],
      ["price", "10", "USD"],
    ],
    content: "",
    sig: "c".repeat(128),
    ...overrides,
  };
}

function context(fetchImpl) {
  return {
    relays: ["wss://relay.example.com"],
    timeoutMs: 100,
    nostr: {
      async fetch(filters) {
        return fetchImpl(filters);
      },
    },
  };
}

test("get_product_details returns a product by event id via coordinate resolution", async () => {
  const productId = hex("1");
  const ctx = context((filters) => {
    // Pre-flight: return the product by id
    if (filters.some((f) => f.ids?.includes(productId))) {
      return [productEvent({ id: productId })];
    }
    // Coordinate fetch: return the latest version
    if (filters.some((f) => f["#d"]?.includes("product"))) {
      return [productEvent({ id: productId })];
    }
    return [];
  });

  const response = await handleGetProductDetails({ productId }, ctx);
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.resultCount, 1);
  assert.equal(body.product.id, productId);
  assert.equal(body.product.title, "Linen Shirt");
  assert.equal(body._meta.resultCount, 1);
});

test("get_product_details accepts productAddress and skips pre-flight", async () => {
  const productAddress = `30402:${hex("b")}:product`;
  let fetchCallCount = 0;
  const ctx = context((filters) => {
    fetchCallCount++;
    // Should only be called once (coordinate fetch), no pre-flight
    if (filters.some((f) => f["#d"]?.includes("product"))) {
      return [productEvent()];
    }
    return [];
  });

  const response = await handleGetProductDetails({ productAddress }, ctx);
  const body = JSON.parse(response.content[0].text);

  assert.equal(fetchCallCount, 1, "should skip pre-flight with productAddress");
  assert.equal(response.resultCount, 1);
  assert.equal(body.product.title, "Linen Shirt");
});

test("get_product_details returns not found when relays have no matching product", async () => {
  const response = await handleGetProductDetails(
    { productId: hex("1") },
    context(() => [])
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "NOT_FOUND");
});

test("get_product_details requires either productId or productAddress", async () => {
  const response = await handleGetProductDetails(
    {},
    context(() => [])
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "VALIDATION_ERROR");
});

test("get_product_details fetches latest version via coordinate when product is updated", async () => {
  const oldId = hex("1");
  const newId = hex("2");
  const ctx = context((filters) => {
    // Pre-flight: return the old version by id
    if (filters.some((f) => f.ids?.includes(oldId))) {
      return [productEvent({ id: oldId, created_at: 10 })];
    }
    // Coordinate fetch: return the newer version
    if (filters.some((f) => f["#d"]?.includes("product"))) {
      return [
        productEvent({
          id: newId,
          created_at: 20,
          tags: [
            ["d", "product"],
            ["title", "Updated Linen Shirt"],
            ["summary", "Updated description"],
            ["price", "50", "USD"],
          ],
        }),
      ];
    }
    return [];
  });

  const response = await handleGetProductDetails({ productId: oldId }, ctx);
  const body = JSON.parse(response.content[0].text);

  // Should return the LATEST version (new price), not the old stale one
  assert.equal(response.resultCount, 1);
  assert.equal(body.product.id, newId);
  assert.equal(body.product.title, "Updated Linen Shirt");
  assert.equal(body.product.price, 50);
});
