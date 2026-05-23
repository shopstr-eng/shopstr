import assert from "node:assert/strict";
import test from "node:test";

import {
  parseProductEvent,
  parseProfileEvent,
  parseReviewEvent,
} from "../dist/parse-tags.js";

const hex = (char) => char.repeat(64);

function event(overrides = {}) {
  return {
    id: hex("a"),
    pubkey: hex("b"),
    created_at: 100,
    kind: 30402,
    tags: [],
    content: "",
    sig: "c".repeat(128),
    ...overrides,
  };
}

test("parses product events into JSON-safe response objects", () => {
  const product = parseProductEvent(
    event({
      tags: [
        ["d", "shirt"],
        ["title", "Linen Shirt"],
        ["summary", "A nice shirt"],
        ["published_at", "1700000000"],
        ["image", "https://example.com/shirt.png"],
        ["t", "Clothing"],
        ["location", "NYC"],
        ["price", "10", "USD"],
        ["shipping", "Added Cost", "2", "USD"],
        ["quantity", "3"],
        ["size", "XL", "5"],
        ["volume", "500ml", "12.5"],
        ["weight", "1kg", "9"],
        ["bulk", "10", "8"],
        ["pickup_location", "Cafe"],
        ["subscription", "true"],
        ["subscription_discount", "5"],
        ["subscription_frequency", "weekly", "monthly"],
        ["content-warning"],
        ["required_customer_info", "email"],
      ],
    })
  );

  assert.equal(product.title, "Linen Shirt");
  assert.equal(product.price, 10);
  assert.equal(product.priceStatus, "known");
  assert.equal(product.currency, "USD");
  assert.equal(product.pricing.totalEstimate, 12);
  assert.deepEqual(product.sizes, [{ size: "XL", quantity: 5 }]);
  assert.deepEqual(product.volumes, [{ volume: "500ml", price: 12.5 }]);
  assert.deepEqual(product.weights, [{ weight: "1kg", price: 9 }]);
  assert.deepEqual(product.bulk, [{ units: 10, price: 8 }]);
  assert.equal(product.contentWarning, true);
  assert.equal(product.subscription.enabled, true);
  assert.deepEqual(product.subscription.frequencies, ["weekly", "monthly"]);
  assert.equal(JSON.stringify(product).includes("Map"), false);
});

test("does not coerce missing or invalid prices to free listings", () => {
  const missingPrice = parseProductEvent(event());
  const invalidPrice = parseProductEvent(
    event({
      tags: [["price", "not-a-number", "USD"]],
    })
  );

  assert.equal(missingPrice.price, undefined);
  assert.equal(missingPrice.currency, undefined);
  assert.equal(missingPrice.priceStatus, "missing");
  assert.equal(missingPrice.pricing, undefined);

  assert.equal(invalidPrice.price, undefined);
  assert.equal(invalidPrice.currency, "USD");
  assert.equal(invalidPrice.priceStatus, "invalid");
  assert.equal(invalidPrice.pricing, undefined);
});

test("parses profile and shop metadata safely", () => {
  const profile = parseProfileEvent(
    event({
      kind: 30019,
      content: JSON.stringify({
        name: "Shop",
        about: "About shop",
        storefront: { shopSlug: "shop" },
        freeShippingCurrency: "USD",
      }),
    })
  );

  assert.equal(profile.name, "Shop");
  assert.equal(profile.about, "About shop");
  assert.equal(profile.storefrontUrl, "/shop/shop");
  assert.equal(profile.freeShippingCurrency, "USD");
});

test("parses review ratings by rating type", () => {
  const review = parseReviewEvent(
    event({
      kind: 31555,
      content: "Great",
      tags: [
        ["d", "review:product"],
        ["rating", "1", "thumb"],
        ["rating", "4.5", "quality"],
      ],
    })
  );

  assert.equal(review.d, "review:product");
  assert.deepEqual(review.ratings, { thumb: 1, quality: 4.5 });
});
