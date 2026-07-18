import { verifyEvent } from "nostr-tools";
import { fetchCachedEvents } from "@/utils/db/db-service";
import {
  DISPUTE_EVENT_KIND,
  parseDisputeEvent,
} from "@/utils/nostr/dispute-records";
import type { NostrEvent } from "@/utils/nostr/nostr-manager";

function getDTag(event: NostrEvent): string | undefined {
  return event.tags.find((tag) => tag[0] === "d")?.[1];
}

// Fetches every cached kind 30407 dispute-event candidate for a given
// orderId, deduplicated by author (newest per author). Signatures are
// re-verified here rather than trusted from the cache write path, since a
// forged event and a legitimate one can otherwise be indistinguishable once
// stored. Returns all candidates so the caller can pick the authoritative
// one (see selectAuthoritativeDisputeEvent) instead of blindly trusting
// whichever is newest overall.
export async function fetchCachedDisputeEvents(
  orderId: string
): Promise<NostrEvent[]> {
  const events = await fetchCachedEvents(DISPUTE_EVENT_KIND, { limit: 100 });
  const matching = events.filter(
    (event) =>
      getDTag(event) === orderId &&
      verifyEvent(event) &&
      parseDisputeEvent(event) !== null
  );

  const newestByAuthor = new Map<string, NostrEvent>();
  for (const event of matching) {
    const existing = newestByAuthor.get(event.pubkey);
    if (!existing || (event.created_at ?? 0) > (existing.created_at ?? 0)) {
      newestByAuthor.set(event.pubkey, event);
    }
  }

  return Array.from(newestByAuthor.values());
}
