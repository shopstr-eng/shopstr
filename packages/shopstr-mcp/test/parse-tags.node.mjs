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
        ["image", "https://example.com/shirt.png", "800x600", "1"],
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
  assert.deepEqual(product.images, [
    { url: "https://example.com/shirt.png", dimensions: "800x600", order: 1 },
  ]);
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

test("caps images at 10 and parses dimensions and sorting order", () => {
  const tags = [];
  for (let i = 0; i < 25; i++) {
    tags.push(["image", `https://example.com/${i}.png`, `${i}x${i}`, `${i}`]);
  }
  const product = parseProductEvent(event({ tags }));

  assert.equal(product.images.length, 10);
  assert.equal(product.images[0].url, "https://example.com/0.png");
  assert.equal(product.images[0].dimensions, "0x0");
  assert.equal(product.images[0].order, 0);
  assert.equal(product.images[9].url, "https://example.com/9.png");
});

test("caps categories at 20", () => {
  const tags = [];
  for (let i = 0; i < 30; i++) {
    tags.push(["t", `category-${i}`]);
  }
  const product = parseProductEvent(event({ tags }));

  assert.equal(product.categories.length, 20);
});

test("parses Gamma subscription frequency from price tag 4th element", () => {
  const product = parseProductEvent(
    event({
      tags: [
        ["d", "sub-product"],
        ["title", "Monthly Box"],
        ["price", "10", "USD", "M"],
      ],
    })
  );

  assert.equal(product.subscription.enabled, true);
  assert.deepEqual(product.subscription.frequencies, ["M"]);
});

test("falls back to legacy subscription tags when no Gamma frequency", () => {
  const product = parseProductEvent(
    event({
      tags: [
        ["d", "legacy-sub"],
        ["title", "Legacy Sub"],
        ["price", "10", "USD"],
        ["subscription", "true"],
        ["subscription_frequency", "weekly", "monthly"],
      ],
    })
  );

  assert.equal(product.subscription.enabled, true);
  assert.deepEqual(product.subscription.frequencies, ["weekly", "monthly"]);
});

test("defaults product type to simple/digital when missing", () => {
  const product = parseProductEvent(
    event({
      tags: [
        ["d", "basic-product"],
        ["title", "Basic Item"],
      ],
    })
  );

  assert.equal(product.productType, "simple");
  assert.equal(product.productFormat, "digital");
});

test("parses Gamma product type tag", () => {
  const product = parseProductEvent(
    event({
      tags: [
        ["d", "physical-product"],
        ["title", "T-Shirt"],
        ["type", "variable", "physical"],
      ],
    })
  );

  assert.equal(product.productType, "variable");
  assert.equal(product.productFormat, "physical");
});

test("extracts structured shipping_option with extra cost", () => {
  const product = parseProductEvent(
    event({
      tags: [
        ["d", "shipped-product"],
        ["title", "Shipped Item"],
        ["shipping_option", `30406:${hex("a")}:standard-shipping`, "5"],
        ["shipping_option", `30406:${hex("a")}:express-shipping`],
        ["shipping_option", `30406:${hex("a")}:bad-shipping`, "-1"],
      ],
    })
  );

  assert.equal(product.shippingOptions.length, 3);
  assert.equal(
    product.shippingOptions[0].reference,
    `30406:${hex("a")}:standard-shipping`
  );
  assert.equal(product.shippingOptions[0].extraCost, 5);
  assert.equal(product.shippingOptions[1].extraCost, undefined);
  assert.equal(product.shippingOptions[2].extraCost, undefined);
});

test("defaults visibility to on-sale when tag is absent", () => {
  const product = parseProductEvent(
    event({
      tags: [
        ["d", "on-sale-product"],
        ["title", "On Sale"],
      ],
    })
  );

  assert.equal(product.visibility, "on-sale");
});

test("parses Gamma visibility tags", () => {
  const hiddenProduct = parseProductEvent(
    event({
      tags: [
        ["d", "hidden-product"],
        ["title", "Hidden"],
        ["visibility", "hidden"],
      ],
    })
  );
  const preorderProduct = parseProductEvent(
    event({
      tags: [
        ["d", "preorder-product"],
        ["title", "Preorder"],
        ["visibility", "pre-order"],
      ],
    })
  );

  assert.equal(hiddenProduct.visibility, "hidden");
  assert.equal(preorderProduct.visibility, "pre-order");
});

test("parses Gamma stock tag with fallback to legacy quantity", () => {
  const gammaProduct = parseProductEvent(
    event({
      tags: [
        ["d", "stocked"],
        ["title", "Stocked Item"],
        ["stock", "25"],
        ["quantity", "10"],
      ],
    })
  );
  assert.equal(gammaProduct.stock, 25);
  assert.equal(gammaProduct.quantity, 10);

  const invalidStockProduct = parseProductEvent(
    event({
      tags: [
        ["d", "invalid-stock"],
        ["title", "Invalid Stock Item"],
        ["stock", "1.5"],
        ["quantity", "-2"],
      ],
    })
  );
  assert.equal(invalidStockProduct.stock, undefined);
  assert.equal(invalidStockProduct.quantity, undefined);

  const legacyProduct = parseProductEvent(
    event({
      tags: [
        ["d", "legacy-qty"],
        ["title", "Legacy Item"],
        ["quantity", "15"],
      ],
    })
  );
  assert.equal(legacyProduct.stock, 15);
  assert.equal(legacyProduct.quantity, 15);
});
