import { fetchCachedEvents } from "@/utils/db/db-service";
import {
  DISPUTE_EVENT_KIND,
  parseDisputeEvent,
} from "@/utils/nostr/dispute-records";
import type { NostrEvent } from "@/utils/nostr/nostr-manager";

function getDTag(event: NostrEvent): string | undefined {
  return event.tags.find((tag) => tag[0] === "d")?.[1];
}

export async function fetchCachedDisputeEvent(
  orderId: string
): Promise<NostrEvent | null> {
  const events = await fetchCachedEvents(DISPUTE_EVENT_KIND, { limit: 100 });
  const matching = events.filter((event) => getDTag(event) === orderId);
  if (matching.length === 0) return null;

  const newest = matching.reduce((latest, event) =>
    (event.created_at ?? 0) > (latest.created_at ?? 0) ? event : latest
  );

  return parseDisputeEvent(newest) ? newest : null;
}
