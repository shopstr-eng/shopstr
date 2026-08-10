import type { NostrEvent, NostrFilter } from "../../types.js";
import { REVIEW_KIND } from "./common.js";

export function hasTag(event: NostrEvent, key: string, value: string): boolean {
  return event.tags.some((tag) => tag[0] === key && tag[1] === value);
}

export function hasProductAddress(
  event: NostrEvent,
  productAddress: string
): boolean {
  return (
    hasTag(event, "d", `a:${productAddress}`) ||
    hasTag(event, "d", productAddress) ||
    hasTag(event, "a", productAddress)
  );
}

export function hasCanonicalProductAddress(
  event: NostrEvent,
  productAddress: string
): boolean {
  return hasTag(event, "a", productAddress);
}

export function reviewMatchConfidence(
  event: NostrEvent,
  productAddresses: readonly string[]
): "exact" | "legacy_fallback" {
  return productAddresses.some((address) =>
    hasCanonicalProductAddress(event, address)
  )
    ? "exact"
    : "legacy_fallback";
}

export function confidenceField(
  confidence: "exact" | "legacy_fallback"
): "legacy_fallback" | undefined {
  return confidence === "legacy_fallback" ? confidence : undefined;
}

export function eventReferencesSeller(
  event: NostrEvent,
  sellerPubkey: string
): boolean {
  return event.tags.some((tag) => {
    const [key, value] = tag;
    return (
      typeof value === "string" &&
      (key === "d" || key === "a") &&
      value.includes(sellerPubkey)
    );
  });
}

export function createReviewFilter(fields: Partial<NostrFilter>): NostrFilter {
  return {
    kinds: [REVIEW_KIND],
    limit: 500,
    ...fields,
  };
}
