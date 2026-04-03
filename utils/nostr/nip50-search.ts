import {
  NostrFilter,
  NostrManager,
  NostrEvent,
} from "@/utils/nostr/nostr-manager";

export const NIP50_SEARCH_RELAY = "wss://relay.nostr.band";

type Nip50SearchFilter = NostrFilter & {
  search: string;
  limit: number;
};

/**
 * Queries a NIP-50 capable relay for kind 30402 listing events.
 */
export async function searchListingsNip50(
  nostr: NostrManager,
  query: string,
  relayUrl: string = NIP50_SEARCH_RELAY
): Promise<NostrEvent[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const filter: Nip50SearchFilter = {
    kinds: [30402],
    search: trimmedQuery,
    limit: 100,
  };

  try {
    return await nostr.fetch([filter], {}, [relayUrl]);
  } catch (error) {
    console.error("NIP-50 search failed:", error);
    return [];
  }
}

/**
 * Merges local and remote listing events and deduplicates by listing identity.
 * For kind 30402, identity is pubkey:d-tag; otherwise identity is event id.
 */
export function mergeAndDeduplicateProducts(
  localProducts: NostrEvent[],
  remoteProducts: NostrEvent[]
): NostrEvent[] {
  const getEventKey = (event: NostrEvent): string => {
    if (event.kind === 30402) {
      const dTag = event.tags?.find((tag: string[]) => tag[0] === "d")?.[1];
      if (dTag) return `${event.pubkey}:${dTag}`;
    }
    return event.id;
  };

  const mergedMap = new Map<string, NostrEvent>();

  for (const event of localProducts) {
    if (event?.id) {
      mergedMap.set(getEventKey(event), event);
    }
  }

  for (const event of remoteProducts) {
    if (!event?.id) continue;

    const key = getEventKey(event);
    const existing = mergedMap.get(key);
    if (!existing || event.created_at >= existing.created_at) {
      mergedMap.set(key, event);
    }
  }

  return Array.from(mergedMap.values());
}
