import { nip19 } from "nostr-tools";
import type { ProductData } from "@/utils/parsers/product-parser-functions";

export interface ListingFilters {
  selectedCategories: Set<string>;
  selectedLocation: string;
  selectedSearch: string;
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function productSatisfiesCategoryFilter(
  productData: ProductData,
  selectedCategories: Set<string>
): boolean {
  if (selectedCategories.size === 0) return true;

  return Array.from(selectedCategories).some((selectedCategory) => {
    const re = new RegExp(escapeRegExp(selectedCategory), "gi");

    return productData.categories?.some((category) => {
      const match = category.match(re);
      return match && match.length > 0;
    });
  });
}

export function productSatisfiesLocationFilter(
  productData: ProductData,
  selectedLocation: string
): boolean {
  return !selectedLocation || productData.location === selectedLocation;
}

export function productSatisfiesSearchFilter(
  productData: ProductData,
  selectedSearch: string
): boolean {
  const normalizedSearch = selectedSearch.trim();

  if (!normalizedSearch) return true;
  if (!productData.title) return false;

  if (normalizedSearch.includes("naddr1")) {
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

  if (normalizedSearch.includes("npub1")) {
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

    if (productData.title.match(re)) return true;
    if (productData.summary && productData.summary.match(re)) return true;

    const numericSearch = parseFloat(normalizedSearch);
    if (!Number.isNaN(numericSearch) && productData.price === numericSearch) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function productSatisfiesPriceFilter(
  productData: ProductData
): boolean {
  return Number(productData.price) >= 1;
}

export function productSatisfiesAllFilters(
  productData: ProductData,
  filters: ListingFilters
): boolean {
  return (
    productSatisfiesPriceFilter(productData) &&
    productSatisfiesCategoryFilter(productData, filters.selectedCategories) &&
    productSatisfiesLocationFilter(productData, filters.selectedLocation) &&
    productSatisfiesSearchFilter(productData, filters.selectedSearch)
  );
}
