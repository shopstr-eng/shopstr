import { nip19 } from "nostr-tools";
import { ProductData } from "../product-parser-functions";
import {
  productSatisfiesCategoryFilter,
  productSatisfiesLocationFilter,
  productSatisfiesSearchFilter,
  productSatisfiesAllFilters,
} from "../search-predicate";

const baseProduct: ProductData = {
  id: "test-id-1",
  pubkey: "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
  createdAt: 1672531200,
  title: "Vintage Camera",
  summary: "A great vintage film camera in excellent condition",
  publishedAt: "1672531200",
  images: ["https://example.com/camera.jpg"],
  categories: ["Electronics", "Collectibles"],
  location: "New York",
  price: 250,
  currency: "USD",
  totalCost: 250,
  d: "unique-product-dtag",
};

describe("productSatisfiesCategoryFilter", () => {
  it("should return true when no categories are selected", () => {
    const result = productSatisfiesCategoryFilter(baseProduct, new Set());
    expect(result).toBe(true);
  });

  it("should return true when a selected category matches (case-insensitive)", () => {
    const result = productSatisfiesCategoryFilter(
      baseProduct,
      new Set(["electronics"])
    );
    expect(result).toBe(true);
  });

  it("should return true when any selected category matches", () => {
    const result = productSatisfiesCategoryFilter(
      baseProduct,
      new Set(["Food", "Collectibles"])
    );
    expect(result).toBe(true);
  });

  it("should return false when no selected categories match", () => {
    const result = productSatisfiesCategoryFilter(
      baseProduct,
      new Set(["Clothing", "Shoes"])
    );
    expect(result).toBe(false);
  });

  it("should handle products with no categories", () => {
    const product = { ...baseProduct, categories: [] };
    const result = productSatisfiesCategoryFilter(
      product,
      new Set(["Electronics"])
    );
    expect(result).toBe(false);
  });
});

describe("productSatisfiesLocationFilter", () => {
  it("should return true when no location is selected", () => {
    const result = productSatisfiesLocationFilter(baseProduct, "");
    expect(result).toBe(true);
  });

  it("should return true when the location matches exactly", () => {
    const result = productSatisfiesLocationFilter(baseProduct, "New York");
    expect(result).toBe(true);
  });

  it("should return false when the location does not match", () => {
    const result = productSatisfiesLocationFilter(baseProduct, "Los Angeles");
    expect(result).toBe(false);
  });
});

describe("productSatisfiesSearchFilter", () => {
  it("should return true when search is empty", () => {
    const result = productSatisfiesSearchFilter(baseProduct, "");
    expect(result).toBe(true);
  });

  it("should return false when product has no title", () => {
    const product = { ...baseProduct, title: "" };
    const result = productSatisfiesSearchFilter(product, "camera");
    expect(result).toBe(false);
  });

  it("should match title case-insensitively", () => {
    expect(productSatisfiesSearchFilter(baseProduct, "vintage")).toBe(true);
    expect(productSatisfiesSearchFilter(baseProduct, "CAMERA")).toBe(true);
    expect(productSatisfiesSearchFilter(baseProduct, "Vintage Camera")).toBe(
      true
    );
  });

  it("should match summary case-insensitively", () => {
    expect(productSatisfiesSearchFilter(baseProduct, "excellent")).toBe(true);
    expect(productSatisfiesSearchFilter(baseProduct, "film")).toBe(true);
  });

  it("should not match unrelated search terms", () => {
    expect(productSatisfiesSearchFilter(baseProduct, "smartphone")).toBe(false);
  });

  it("should match exact numeric price", () => {
    expect(productSatisfiesSearchFilter(baseProduct, "250")).toBe(true);
  });

  it("should not match different numeric price", () => {
    expect(productSatisfiesSearchFilter(baseProduct, "300")).toBe(false);
  });

  it("should decode and match a valid npub using nostr-tools nip19", () => {
    const npub = nip19.npubEncode(baseProduct.pubkey);
    const result = productSatisfiesSearchFilter(baseProduct, npub);
    expect(result).toBe(true);
  });

  it("should return false for a valid npub that does not match the product pubkey", () => {
    const differentPubkey =
      "1111111111111111111111111111111111111111111111111111111111111111";
    const npub = nip19.npubEncode(differentPubkey);
    const result = productSatisfiesSearchFilter(baseProduct, npub);
    expect(result).toBe(false);
  });

  it("should decode and match a valid naddr using nostr-tools nip19", () => {
    const naddr = nip19.naddrEncode({
      identifier: baseProduct.d!,
      pubkey: baseProduct.pubkey,
      kind: 30402,
    });
    const result = productSatisfiesSearchFilter(baseProduct, naddr);
    expect(result).toBe(true);
  });

  it("should return false for a valid naddr with a different identifier", () => {
    const naddr = nip19.naddrEncode({
      identifier: "different-dtag",
      pubkey: baseProduct.pubkey,
      kind: 30402,
    });
    const result = productSatisfiesSearchFilter(baseProduct, naddr);
    expect(result).toBe(false);
  });

  it("should return false for an invalid npub string", () => {
    const result = productSatisfiesSearchFilter(
      baseProduct,
      "npub1invalidstring"
    );
    expect(result).toBe(false);
  });

  it("should return false for an invalid naddr string", () => {
    const result = productSatisfiesSearchFilter(
      baseProduct,
      "naddr1invalidstring"
    );
    expect(result).toBe(false);
  });

  it("should return false for regex special characters that cause an error", () => {
    const result = productSatisfiesSearchFilter(baseProduct, "[invalid(regex");
    expect(result).toBe(false);
  });
});

describe("productSatisfiesAllFilters", () => {
  it("should return true when all filters pass", () => {
    const result = productSatisfiesAllFilters(
      baseProduct,
      new Set(["Electronics"]),
      "New York",
      "Camera"
    );
    expect(result).toBe(true);
  });

  it("should return false when category filter fails", () => {
    const result = productSatisfiesAllFilters(
      baseProduct,
      new Set(["Clothing"]),
      "New York",
      "Camera"
    );
    expect(result).toBe(false);
  });

  it("should return false when location filter fails", () => {
    const result = productSatisfiesAllFilters(
      baseProduct,
      new Set(["Electronics"]),
      "Los Angeles",
      "Camera"
    );
    expect(result).toBe(false);
  });

  it("should return false when search filter fails", () => {
    const result = productSatisfiesAllFilters(
      baseProduct,
      new Set(["Electronics"]),
      "New York",
      "smartphone"
    );
    expect(result).toBe(false);
  });

  it("should return true when all filters are empty (no filtering)", () => {
    const result = productSatisfiesAllFilters(baseProduct, new Set(), "", "");
    expect(result).toBe(true);
  });
});
