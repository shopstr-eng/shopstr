import { nip19 } from "nostr-tools";
import type { ProductData } from "@/utils/parsers/product-parser-functions";
import {
  productSatisfiesAllFilters,
  productSatisfiesCategoryFilter,
  productSatisfiesLocationFilter,
  productSatisfiesSearchFilter,
} from "../listing-filters";

const makeProduct = (overrides: Partial<ProductData> = {}): ProductData => ({
  id: "product-1",
  pubkey:
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  createdAt: 1,
  title: "Test Product",
  summary: "A test summary",
  publishedAt: "",
  images: ["https://example.com/image.png"],
  categories: ["electronics"],
  location: "US",
  price: 10,
  currency: "USD",
  totalCost: 10,
  d: "listing-1",
  ...overrides,
});

describe("productSatisfiesSearchFilter", () => {
  it("returns true for empty and whitespace-only search", () => {
    expect(productSatisfiesSearchFilter(makeProduct(), "")).toBe(true);
    expect(productSatisfiesSearchFilter(makeProduct(), "   ")).toBe(true);
  });

  it("returns false when the product title is missing", () => {
    expect(
      productSatisfiesSearchFilter(makeProduct({ title: "" }), "anything")
    ).toBe(false);
  });

  it("matches title case-insensitively", () => {
    const product = makeProduct({ title: "Bitcoin Wallet" });

    expect(productSatisfiesSearchFilter(product, "bitcoin")).toBe(true);
    expect(productSatisfiesSearchFilter(product, "WALLET")).toBe(true);
    expect(productSatisfiesSearchFilter(product, "lightning")).toBe(false);
  });

  it("matches summary when the title does not match", () => {
    const product = makeProduct({
      title: "Gadget",
      summary: "Runs on solar power",
    });

    expect(productSatisfiesSearchFilter(product, "solar")).toBe(true);
  });

  it("matches by exact price when search is numeric", () => {
    const product = makeProduct({ price: 42 });

    expect(productSatisfiesSearchFilter(product, "42")).toBe(true);
    expect(productSatisfiesSearchFilter(product, "43")).toBe(false);
  });

  it("escapes regex special characters so c++ is treated literally", () => {
    const product = makeProduct({ title: "C++ Guide" });

    expect(productSatisfiesSearchFilter(product, "c++")).toBe(true);
    expect(productSatisfiesSearchFilter(product, "C++")).toBe(true);
  });

  it("returns false for invalid naddr1 strings", () => {
    expect(
      productSatisfiesSearchFilter(makeProduct(), "naddr1invalidgarbage")
    ).toBe(false);
  });

  it("returns false for invalid npub1 strings", () => {
    expect(
      productSatisfiesSearchFilter(makeProduct(), "npub1invalidgarbage")
    ).toBe(false);
  });

  it("matches a valid naddr against the product d-tag and pubkey", () => {
    const product = makeProduct({
      pubkey:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      d: "mint-condition-jacket",
    });

    const naddr = nip19.naddrEncode({
      identifier: product.d!,
      pubkey: product.pubkey,
      kind: 30402,
    });

    expect(productSatisfiesSearchFilter(product, naddr)).toBe(true);
    expect(
      productSatisfiesSearchFilter(makeProduct({ d: "different-d" }), naddr)
    ).toBe(false);
  });

  it("matches a valid npub against the product pubkey", () => {
    const product = makeProduct({
      pubkey:
        "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    });

    const npub = nip19.npubEncode(product.pubkey);

    expect(productSatisfiesSearchFilter(product, npub)).toBe(true);
    expect(
      productSatisfiesSearchFilter(
        makeProduct({
          pubkey:
            "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        }),
        npub
      )
    ).toBe(false);
  });
});

describe("productSatisfiesCategoryFilter", () => {
  it("returns true when no categories are selected", () => {
    expect(productSatisfiesCategoryFilter(makeProduct(), new Set())).toBe(true);
  });

  it("matches when the product category is in the selected set", () => {
    const product = makeProduct({ categories: ["clothing", "vintage"] });

    expect(productSatisfiesCategoryFilter(product, new Set(["vintage"]))).toBe(
      true
    );
  });

  it("returns false when the product has none of the selected categories", () => {
    const product = makeProduct({ categories: ["electronics"] });

    expect(
      productSatisfiesCategoryFilter(product, new Set(["clothing"]))
    ).toBe(false);
  });

  it("matches categories case-insensitively", () => {
    const product = makeProduct({ categories: ["Electronics"] });

    expect(
      productSatisfiesCategoryFilter(product, new Set(["electronics"]))
    ).toBe(true);
  });
});

describe("productSatisfiesLocationFilter", () => {
  it("returns true when no location is selected", () => {
    expect(productSatisfiesLocationFilter(makeProduct(), "")).toBe(true);
  });

  it("matches exact location", () => {
    const product = makeProduct({ location: "EU" });

    expect(productSatisfiesLocationFilter(product, "EU")).toBe(true);
    expect(productSatisfiesLocationFilter(product, "US")).toBe(false);
  });
});

describe("productSatisfiesAllFilters", () => {
  it("returns true when all filters pass", () => {
    const product = makeProduct({
      title: "Vintage Jacket",
      categories: ["clothing"],
      location: "EU",
    });

    expect(
      productSatisfiesAllFilters(product, {
        selectedSearch: "jacket",
        selectedCategories: new Set(["clothing"]),
        selectedLocation: "EU",
      })
    ).toBe(true);
  });

  it("returns false when any filter fails", () => {
    const product = makeProduct({
      title: "Vintage Jacket",
      categories: ["clothing"],
      location: "EU",
    });

    expect(
      productSatisfiesAllFilters(product, {
        selectedSearch: "jacket",
        selectedCategories: new Set(["electronics"]),
        selectedLocation: "EU",
      })
    ).toBe(false);
  });
});
