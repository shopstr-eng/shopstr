import type { SubscribeManyParams } from "nostr-tools/abstract-pool";

import type { NostrEvent, NostrFilter, RelayFetchMeta } from "./types.js";

export type RelayFetchClient = {
  fetch: (
    filters: NostrFilter[],
    params?: SubscribeManyParams,
    relayUrls?: string[],
    options?: { timeoutMs?: number }
  ) => Promise<NostrEvent[]>;
};

export type RelayFetchResult = {
  events: NostrEvent[];
  meta: RelayFetchMeta;
};

export async function fetchFromRelays(
  client: RelayFetchClient,
  relays: string[],
  filters: NostrFilter[],
  options: {
    timeoutMs: number;
    params?: SubscribeManyParams;
  }
): Promise<RelayFetchResult> {
  const startedAt = Date.now();
  const settled = await Promise.allSettled(
    relays.map(async (relay) => {
      const events = await client.fetch(
        filters,
        { ...(options.params ?? {}) },
        [relay],
        { timeoutMs: options.timeoutMs }
      );
      return { relay, events };
    })
  );

  const events: NostrEvent[] = [];
  const relaysSucceeded: string[] = [];
  const relaysFailed: Array<{ url: string; error: string }> = [];

  settled.forEach((result, index) => {
    const relay = relays[index] ?? "unknown";
    if (result.status === "fulfilled") {
      relaysSucceeded.push(result.value.relay);
      events.push(...result.value.events);
    } else {
      relaysFailed.push({
        url: relay,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
    }
  });

  return {
    events,
    meta: {
      relaysQueried: relays,
      relaysSucceeded,
      relaysFailed,
      degraded: relaysFailed.length > 0,
      coverage:
        relays.length === 0 ? 0 : relaysSucceeded.length / relays.length,
      responseTimeMs: Date.now() - startedAt,
      eventCount: events.length,
    },
  };
}
