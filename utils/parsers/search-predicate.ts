import { nip19 } from "nostr-tools";
import { ProductData } from "@/utils/parsers/product-parser-functions";

export function productSatisfiesCategoryFilter(
  productData: ProductData,
  selectedCategories: Set<string>
): boolean {
  if (selectedCategories.size === 0) return true;
  return Array.from(selectedCategories).some((selectedCategory) => {
    const re = new RegExp(selectedCategory, "gi");
    return productData?.categories?.some((category) => {
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
  if (!selectedSearch) return true;
  if (!productData.title) return false;

  if (selectedSearch.includes("naddr")) {
    try {
      const parsedNaddr = nip19.decode(selectedSearch);
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

  if (selectedSearch.includes("npub")) {
    try {
      const parsedNpub = nip19.decode(selectedSearch);
      if (parsedNpub.type === "npub") {
        return parsedNpub.data === productData.pubkey;
      }
      return false;
    } catch {
      return false;
    }
  }

  try {
    const re = new RegExp(selectedSearch, "gi");

    const titleMatch = productData.title.match(re);
    if (titleMatch && titleMatch.length > 0) return true;

    if (productData.summary) {
      const summaryMatch = productData.summary.match(re);
      if (summaryMatch && summaryMatch.length > 0) return true;
    }

    const numericSearch = parseFloat(selectedSearch);
    if (!isNaN(numericSearch) && productData.price === numericSearch) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function productSatisfiesAllFilters(
  productData: ProductData,
  selectedCategories: Set<string>,
  selectedLocation: string,
  selectedSearch: string
): boolean {
  return (
    productSatisfiesCategoryFilter(productData, selectedCategories) &&
    productSatisfiesLocationFilter(productData, selectedLocation) &&
    productSatisfiesSearchFilter(productData, selectedSearch)
  );
}
