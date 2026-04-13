import {
  productSatisfiesSearchFilter,
  productSatisfiesCategoryFilter,
  productSatisfiesLocationFilter,
  productSatisfiesAllFilters,
} from "../listing-filters";
import { ProductData } from "@/utils/parsers/product-parser-functions";

const makeProduct = (overrides: Partial<ProductData> = {}): ProductData => ({
  id: "abc123",
  pubkey: "deadbeef",
  createdAt: 0,
  title: "Test Product",
  summary: "A test summary",
  publishedAt: "",
  images: ["https://example.com/img.png"],
  categories: ["electronics"],
  location: "US",
  price: 10,
  currency: "USD",
  totalCost: 10,
  ...overrides,
});

// ── productSatisfiesSearchFilter ─────────────────────────────────────────────

describe("productSatisfiesSearchFilter", () => {
  it("returns true for empty search", () => {
    expect(productSatisfiesSearchFilter(makeProduct(), "")).toBe(true);
    expect(productSatisfiesSearchFilter(makeProduct(), "   ")).toBe(true);
  });

  it("returns false when product has no title", () => {
    expect(
      productSatisfiesSearchFilter(makeProduct({ title: "" }), "anything")
    ).toBe(false);
  });

  it("matches title case-insensitively", () => {
    const p = makeProduct({ title: "Bitcoin Wallet" });
    expect(productSatisfiesSearchFilter(p, "bitcoin")).toBe(true);
    expect(productSatisfiesSearchFilter(p, "WALLET")).toBe(true);
    expect(productSatisfiesSearchFilter(p, "lightning")).toBe(false);
  });

  it("matches summary when title does not match", () => {
    const p = makeProduct({ title: "Gadget", summary: "runs on solar power" });
    expect(productSatisfiesSearchFilter(p, "solar")).toBe(true);
  });

  it("matches by exact price when search is numeric", () => {
    const p = makeProduct({ price: 42 });
    expect(productSatisfiesSearchFilter(p, "42")).toBe(true);
    expect(productSatisfiesSearchFilter(p, "43")).toBe(false);
  });

  it("escapes regex special chars so c++ is a literal search", () => {
    const p = makeProduct({ title: "C++ Guide" });
    expect(productSatisfiesSearchFilter(p, "c++")).toBe(true);
    expect(productSatisfiesSearchFilter(p, "C++")).toBe(true);
  });

  it("returns false for invalid naddr1 strings", () => {
    const p = makeProduct();
    expect(productSatisfiesSearchFilter(p, "naddr1invalidgarbage")).toBe(false);
  });

  it("returns false for invalid npub1 strings", () => {
    const p = makeProduct();
    expect(productSatisfiesSearchFilter(p, "npub1invalidgarbage")).toBe(false);
  });
});

// ── productSatisfiesCategoryFilter ──────────────────────────────────────────

describe("productSatisfiesCategoryFilter", () => {
  it("returns true when no categories are selected", () => {
    expect(productSatisfiesCategoryFilter(makeProduct(), new Set())).toBe(true);
  });

  it("matches when product category is in the selected set", () => {
    const p = makeProduct({ categories: ["clothing", "vintage"] });
    expect(productSatisfiesCategoryFilter(p, new Set(["vintage"]))).toBe(true);
  });

  it("returns false when product has none of the selected categories", () => {
    const p = makeProduct({ categories: ["electronics"] });
    expect(productSatisfiesCategoryFilter(p, new Set(["clothing"]))).toBe(
      false
    );
  });

  it("is case-insensitive", () => {
    const p = makeProduct({ categories: ["Electronics"] });
    expect(productSatisfiesCategoryFilter(p, new Set(["electronics"]))).toBe(
      true
    );
  });
});

// ── productSatisfiesLocationFilter ──────────────────────────────────────────

describe("productSatisfiesLocationFilter", () => {
  it("returns true when no location is selected", () => {
    expect(productSatisfiesLocationFilter(makeProduct(), "")).toBe(true);
  });

  it("matches exact location", () => {
    const p = makeProduct({ location: "EU" });
    expect(productSatisfiesLocationFilter(p, "EU")).toBe(true);
    expect(productSatisfiesLocationFilter(p, "US")).toBe(false);
  });
});

// ── productSatisfiesAllFilters ───────────────────────────────────────────────

describe("productSatisfiesAllFilters", () => {
  it("returns true when all filters pass", () => {
    const p = makeProduct({
      title: "Vintage Jacket",
      categories: ["clothing"],
      location: "EU",
    });
    expect(
      productSatisfiesAllFilters(p, {
        selectedSearch: "jacket",
        selectedCategories: new Set(["clothing"]),
        selectedLocation: "EU",
      })
    ).toBe(true);
  });

  it("returns false when any one filter fails", () => {
    const p = makeProduct({
      title: "Vintage Jacket",
      categories: ["clothing"],
      location: "EU",
    });
    expect(
      productSatisfiesAllFilters(p, {
        selectedSearch: "jacket",
        selectedCategories: new Set(["electronics"]), // fails
        selectedLocation: "EU",
      })
    ).toBe(false);
  });
});
