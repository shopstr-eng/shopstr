import { nip19 } from "nostr-tools";
import { ProductData } from "@/utils/parsers/product-parser-functions";

export function productMatchesMarketplaceSearch(
  product: ProductData,
  searchTerm: string
) {
  if (!searchTerm) return true;
  if (!product.title) return false;

  if (searchTerm.includes("naddr")) {
    try {
      const parsedNaddr = nip19.decode(searchTerm);
      if (parsedNaddr.type === "naddr") {
        return (
          product.d === parsedNaddr.data.identifier &&
          product.pubkey === parsedNaddr.data.pubkey
        );
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  if (searchTerm.includes("npub")) {
    try {
      const parsedNpub = nip19.decode(searchTerm);
      if (parsedNpub.type === "npub") {
        return parsedNpub.data === product.pubkey;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  try {
    const re = new RegExp(searchTerm, "gi");

    const titleMatch = product.title.match(re);
    if (titleMatch && titleMatch.length > 0) return true;

    if (product.summary) {
      const summaryMatch = product.summary.match(re);
      if (summaryMatch && summaryMatch.length > 0) return true;
    }

    const numericSearch = parseFloat(searchTerm);
    if (!isNaN(numericSearch) && product.price === numericSearch) {
      return true;
    }

    return false;
  } catch (_) {
    return false;
  }
}

