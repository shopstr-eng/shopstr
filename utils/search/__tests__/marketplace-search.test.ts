import { nip19 } from "nostr-tools";
import { productMatchesMarketplaceSearch } from "../marketplace-search";
import { ProductData } from "@/utils/parsers/product-parser-functions";

describe("productMatchesMarketplaceSearch", () => {
  const baseProduct: ProductData = {
    id: "product-1",
    pubkey:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    createdAt: 0,
    title: "Handmade Coffee Mug",
    summary: "Stoneware mug for espresso and tea.",
    publishedAt: "",
    images: ["image.jpg"],
    categories: ["Home"],
    location: "Online",
    price: 25,
    currency: "USD",
    totalCost: 25,
    d: "coffee-mug",
  };

  it("returns true when search term is empty", () => {
    expect(productMatchesMarketplaceSearch(baseProduct, "")).toBe(true);
  });

  it("matches against the product title", () => {
    expect(productMatchesMarketplaceSearch(baseProduct, "coffee")).toBe(true);
  });

  it("matches against the product summary", () => {
    expect(productMatchesMarketplaceSearch(baseProduct, "espresso")).toBe(
      true
    );
  });

  it("matches against the exact product price", () => {
    expect(productMatchesMarketplaceSearch(baseProduct, "25")).toBe(true);
  });

  it("matches a valid naddr for the product", () => {
    const naddr = nip19.naddrEncode({
      identifier: baseProduct.d!,
      pubkey: baseProduct.pubkey,
      kind: 30402,
    });

    expect(productMatchesMarketplaceSearch(baseProduct, naddr)).toBe(true);
  });

  it("matches a valid npub for the product pubkey", () => {
    const npub = nip19.npubEncode(baseProduct.pubkey);

    expect(productMatchesMarketplaceSearch(baseProduct, npub)).toBe(true);
  });

  it("returns false for malformed search regex input", () => {
    expect(productMatchesMarketplaceSearch(baseProduct, "[")).toBe(false);
  });

  it("returns false when product title is missing", () => {
    expect(
      productMatchesMarketplaceSearch({ ...baseProduct, title: "" }, "coffee")
    ).toBe(false);
  });

  it("returns false for a different naddr", () => {
    const naddr = nip19.naddrEncode({
      identifier: "different-product",
      pubkey: baseProduct.pubkey,
      kind: 30402,
    });

    expect(productMatchesMarketplaceSearch(baseProduct, naddr)).toBe(false);
  });

  it("returns false for a different npub", () => {
    const npub = nip19.npubEncode(
      "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
    );

    expect(productMatchesMarketplaceSearch(baseProduct, npub)).toBe(false);
  });
});

