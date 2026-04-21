import { nip19 } from "nostr-tools";

import { NostrEvent } from "@/utils/types/types";

type DecodedListingNaddr = {
  identifier: string;
  pubkey: string;
  kind: number;
};

export function getListingRouteIdentifier(
  productId: string | string[] | undefined
): string {
  return Array.isArray(productId) ? productId[0] || "" : productId || "";
}

export function decodeListingNaddr(
  identifier: string
): DecodedListingNaddr | null {
  if (!identifier.startsWith("naddr1")) {
    return null;
  }

  try {
    const decoded = nip19.decode(identifier);
    if (decoded.type !== "naddr") {
      return null;
    }

    return {
      identifier: decoded.data.identifier,
      pubkey: decoded.data.pubkey,
      kind: decoded.data.kind,
    };
  } catch {
    return null;
  }
}

export function eventMatchesListingIdentifier(
  event: NostrEvent,
  identifier: string
): boolean {
  if (!identifier) {
    return false;
  }

  if (event.id === identifier) {
    return true;
  }

  const dTag = event.tags.find((tag: string[]) => tag[0] === "d")?.[1];
  if (dTag === identifier) {
    return true;
  }

  const decoded = decodeListingNaddr(identifier);
  if (!decoded || !dTag) {
    return false;
  }

  return (
    decoded.identifier === dTag &&
    decoded.pubkey === event.pubkey &&
    decoded.kind === event.kind
  );
}
