import { nip19 } from "nostr-tools";
import { ProductData } from "./product-parser-functions";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Checks if a product satisfies the category filter.
 * @param productData - The product to check.
 * @param selectedCategories - Set of selected category names.
 * @returns boolean
 */
export const productSatisfiesCategoryFilter = (
  productData: ProductData,
  selectedCategories: Set<string>
) => {
  if (selectedCategories.size === 0) return true;
  return Array.from(selectedCategories).some((selectedCategory) => {
    const re = new RegExp(escapeRegExp(selectedCategory), "gi");
    return productData?.categories?.some((category) => {
      const match = category.match(re);
      return match && match.length > 0;
    });
  });
};

/**
 * Checks if a product satisfies the location filter.
 * @param productData - The product to check.
 * @param selectedLocation - The selected location string.
 * @returns boolean
 */
export const productSatisfiesLocationFilter = (
  productData: ProductData,
  selectedLocation: string
) => {
  return !selectedLocation || productData.location === selectedLocation;
};

/**
 * Checks if a product satisfies the search filter.
 * Supports Nip-19 addresses (naddr, npub) and text-based search in title/summary.
 * Also supports numeric price matching.
 * @param productData - The product to check.
 * @param selectedSearch - The search query string.
 * @returns boolean
 */
export const productSatisfiesSearchFilter = (
  productData: ProductData,
  selectedSearch: string
) => {
  const normalizedSearch = selectedSearch.trim();

  if (!normalizedSearch) return true;
  if (!productData.title) return false;

  // Handle Nip-19 naddr search
  if (normalizedSearch.includes("naddr")) {
    try {
      const parsedNaddr = nip19.decode(normalizedSearch);
      if (parsedNaddr.type === "naddr") {
        return (
          productData.d === parsedNaddr.data.identifier &&
          productData.pubkey === parsedNaddr.data.pubkey
        );
      }
      return false;
    } catch {
      return false;
    }
  }

  // Handle Nip-19 npub search
  if (normalizedSearch.includes("npub")) {
    try {
      const parsedNpub = nip19.decode(normalizedSearch);
      if (parsedNpub.type === "npub") {
        return parsedNpub.data === productData.pubkey;
      }
      return false;
    } catch {
      return false;
    }
  }

  try {
    const re = new RegExp(escapeRegExp(normalizedSearch), "i");

    // Match in title
    const titleMatch = productData.title.match(re);
    if (titleMatch && titleMatch.length > 0) return true;

    // Match in summary
    if (productData.summary) {
      const summaryMatch = productData.summary.match(re);
      if (summaryMatch && summaryMatch.length > 0) return true;
    }

    // Match numeric price
    const numericSearch = parseFloat(normalizedSearch);
    if (!isNaN(numericSearch) && Math.abs(productData.price - numericSearch) < 0.001) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
};

/**
 * Orchestrates all individual filters for a product.
 */
export const productSatisfiesAllFilters = (
  productData: ProductData,
  filters: {
    selectedCategories: Set<string>;
    selectedLocation: string;
    selectedSearch: string;
  }
) => {
  return (
    productSatisfiesCategoryFilter(productData, filters.selectedCategories) &&
    productSatisfiesLocationFilter(productData, filters.selectedLocation) &&
    productSatisfiesSearchFilter(productData, filters.selectedSearch)
  );
};
