import {
  productSatisfiesCategoryFilter,
  productSatisfiesLocationFilter,
  productSatisfiesSearchFilter,
  productSatisfiesAllFilters,
} from "../product-filter-helpers";
import { ProductData } from "../product-parser-functions";

describe("product-filter-helpers", () => {
  const mockProduct: ProductData = {
    id: "test-id",
    pubkey: "test-pubkey",
    createdAt: 12345678,
    title: "Eco Friendly Water Bottle",
    summary: "A sustainable way to stay hydrated.",
    publishedAt: "2023-01-01",
    images: ["img1.jpg"],
    categories: ["Outdoors", "Sustainable"],
    location: "San Francisco",
    price: 25.0,
    currency: "USD",
    totalCost: 25.0,
    d: "bottle-identifier",
  };

  describe("productSatisfiesCategoryFilter", () => {
    it("should return true if no categories are selected", () => {
      expect(productSatisfiesCategoryFilter(mockProduct, new Set())).toBe(true);
    });

    it("should return true if product matches a selected category (case-insensitive)", () => {
      expect(productSatisfiesCategoryFilter(mockProduct, new Set(["outdoors"]))).toBe(true);
    });

    it("should return true if product matches any of the selected categories", () => {
      expect(productSatisfiesCategoryFilter(mockProduct, new Set(["Gadgets", "Sustainable"]))).toBe(true);
    });

    it("should return false if product matches none of the selected categories", () => {
      expect(productSatisfiesCategoryFilter(mockProduct, new Set(["Electronics"]))).toBe(false);
    });

    it("should handle special regex characters in category names correctly", () => {
      const productWithSpecialCategory = { 
        ...mockProduct, 
        categories: ["A.B", "C*D", "E(F)"] 
      };
      expect(productSatisfiesCategoryFilter(productWithSpecialCategory, new Set(["A.B"]))).toBe(true);
      expect(productSatisfiesCategoryFilter(productWithSpecialCategory, new Set(["C*D"]))).toBe(true);
      expect(productSatisfiesCategoryFilter(productWithSpecialCategory, new Set(["E(F)"]))).toBe(true);
    });
  });

  describe("productSatisfiesLocationFilter", () => {
    it("should return true if no location is selected", () => {
      expect(productSatisfiesLocationFilter(mockProduct, "")).toBe(true);
    });

    it("should return true if location matches", () => {
      expect(productSatisfiesLocationFilter(mockProduct, "San Francisco")).toBe(true);
    });

    it("should return false if location does not match", () => {
      expect(productSatisfiesLocationFilter(mockProduct, "New York")).toBe(false);
    });
  });

  describe("productSatisfiesSearchFilter", () => {
    it("should return true if search is empty", () => {
      expect(productSatisfiesSearchFilter(mockProduct, "  ")).toBe(true);
    });

    it("should match text in title (case-insensitive)", () => {
      expect(productSatisfiesSearchFilter(mockProduct, "bottle")).toBe(true);
      expect(productSatisfiesSearchFilter(mockProduct, "ECO")).toBe(true);
    });

    it("should match text in summary", () => {
      expect(productSatisfiesSearchFilter(mockProduct, "hydrated")).toBe(true);
    });

    it("should match by exact numeric price", () => {
      expect(productSatisfiesSearchFilter(mockProduct, "25")).toBe(true);
    });

    it("should return false if price is not an exact match", () => {
      expect(productSatisfiesSearchFilter(mockProduct, "25.0001")).toBe(false);
      expect(productSatisfiesSearchFilter(mockProduct, "24.9999")).toBe(false);
      expect(productSatisfiesSearchFilter(mockProduct, "25.01")).toBe(false);
    });

    it("should return false if no match found", () => {
      expect(productSatisfiesSearchFilter(mockProduct, "smartphone")).toBe(false);
    });

    it("should handle regex special characters in search", () => {
      const productWithSpecialChars = { ...mockProduct, title: "Phone (v2) [Refurbished]" };
      expect(productSatisfiesSearchFilter(productWithSpecialChars, "(v2)")).toBe(true);
      expect(productSatisfiesSearchFilter(productWithSpecialChars, "[Refurbished]")).toBe(true);
    });

    it("should still use plain-text matching for non-bech32 searches containing npub/naddr text", () => {
      const productWithNostrTerms = {
        ...mockProduct,
        title: "npub guide",
        summary: "how to read an naddr reference",
      };
      expect(productSatisfiesSearchFilter(productWithNostrTerms, "npub guide")).toBe(true);
      expect(productSatisfiesSearchFilter(productWithNostrTerms, "naddr reference")).toBe(true);
    });

    // Note: Nip-19 decoding (naddr/npub) is handled by nostr-tools. 
    // In a full integration test we would use real naddr strings.
    // Here we're mainly testing that the logic reaches the decode block.
    it("should return false for invalid naddr/npub strings instead of crashing", () => {
      expect(productSatisfiesSearchFilter(mockProduct, "naddr1invalid")).toBe(false);
      expect(productSatisfiesSearchFilter(mockProduct, "npub1invalid")).toBe(false);
    });
  });

  describe("productSatisfiesAllFilters", () => {
    it("should return true if all filters match", () => {
      const filters = {
        selectedCategories: new Set(["Outdoors"]),
        selectedLocation: "San Francisco",
        selectedSearch: "bottle",
      };
      expect(productSatisfiesAllFilters(mockProduct, filters)).toBe(true);
    });

    it("should return false if any filter fails", () => {
      const filters = {
        selectedCategories: new Set(["Outdoors"]),
        selectedLocation: "New York", // Fails
        selectedSearch: "bottle",
      };
      expect(productSatisfiesAllFilters(mockProduct, filters)).toBe(false);
    });
  });
});
