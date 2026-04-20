import { nip19 } from "nostr-tools";
import { ProductData } from "@/utils/parsers/product-parser-functions";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function productMatchesMarketplaceSearch(
  product: ProductData,
  searchTerm: string
) {
  const normalizedSearch = searchTerm.trim();

  if (!normalizedSearch) return true;
  if (!product.title) return false;

  if (normalizedSearch.includes("naddr")) {
    try {
      const parsedNaddr = nip19.decode(normalizedSearch);
      if (parsedNaddr.type === "naddr") {
        return (
          product.d === parsedNaddr.data.identifier &&
          product.pubkey === parsedNaddr.data.pubkey
        );
      }
      return false;
    } catch {
      return false;
    }
  }

  if (normalizedSearch.includes("npub")) {
    try {
      const parsedNpub = nip19.decode(normalizedSearch);
      if (parsedNpub.type === "npub") {
        return parsedNpub.data === product.pubkey;
      }
      return false;
    } catch {
      return false;
    }
  }

  try {
    const re = new RegExp(escapeRegExp(normalizedSearch), "i");

    const titleMatch = product.title.match(re);
    if (titleMatch && titleMatch.length > 0) return true;

    if (product.summary) {
      const summaryMatch = product.summary.match(re);
      if (summaryMatch && summaryMatch.length > 0) return true;
    }

    const numericSearch = parseFloat(normalizedSearch);
    if (!isNaN(numericSearch) && product.price === numericSearch) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
