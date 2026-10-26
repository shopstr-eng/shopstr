import type { NostrEvent } from "../types/types";

export const PRODUCT_KIND = 30402;
export const DELETION_KIND = 5;

export type ProductDeletionTargets = {
  eventIds: string[];
  dTags: string[];
};

export type ProductTombstone = {
  pubkey: string;
  targetType: "event" | "address";
  target: string;
  deletedAt: number;
};

export function getProductDTag(event: NostrEvent): string | undefined {
  return event.tags.find((tag) => tag[0] === "d")?.[1];
}

export function buildProductAddress(pubkey: string, dTag: string): string {
  return `${PRODUCT_KIND}:${pubkey}:${dTag}`;
}

/**
 * Extracts which listings a kind-5 event asks to delete. Only the deletion
 * author's own listings can be targeted: `a` tags must carry the author's
 * pubkey, and `e` ids are always matched against the author's rows by the
 * caller. Deletions that declare other kinds via `k` (wallet events, gift
 * wraps, ...) are ignored.
 */
export function extractProductDeletionTargets(
  event: NostrEvent
): ProductDeletionTargets {
  const empty: ProductDeletionTargets = { eventIds: [], dTags: [] };
  if (event.kind !== DELETION_KIND) return empty;

  const declaredKinds = event.tags
    .filter((tag) => tag[0] === "k" && tag[1])
    .map((tag) => tag[1]);
  if (
    declaredKinds.length > 0 &&
    !declaredKinds.includes(String(PRODUCT_KIND))
  ) {
    return empty;
  }

  const eventIds = new Set<string>();
  const dTags = new Set<string>();

  for (const tag of event.tags) {
    if (tag[0] === "e" && tag[1]) {
      eventIds.add(tag[1]);
    } else if (tag[0] === "a" && tag[1]) {
      const [kind, pubkey, ...rest] = tag[1].split(":");
      const dTag = rest.join(":");
      if (kind === String(PRODUCT_KIND) && pubkey === event.pubkey && dTag) {
        dTags.add(dTag);
      }
    }
  }

  return { eventIds: [...eventIds], dTags: [...dTags] };
}

/**
 * Returns true when a tombstone covers the product: either its exact event id
 * was deleted, or its address was deleted at/after the version's created_at.
 * A newer re-listing of the same address is not covered.
 */
export function isProductTombstoned(
  event: NostrEvent,
  tombstones: ProductTombstone[]
): boolean {
  const dTag = getProductDTag(event);
  const address = dTag ? buildProductAddress(event.pubkey, dTag) : null;

  return tombstones.some((tombstone) => {
    if (tombstone.pubkey !== event.pubkey) return false;
    if (tombstone.targetType === "event") return tombstone.target === event.id;
    return (
      address !== null &&
      tombstone.target === address &&
      tombstone.deletedAt >= Number(event.created_at)
    );
  });
}
