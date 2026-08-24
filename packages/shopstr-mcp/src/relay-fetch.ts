import type { SubscribeManyParams } from "nostr-tools/abstract-pool";

import { sortEventsNewestFirst } from "./dedup.js";
import type { NostrManager } from "./nostr-manager.js";
import type { NostrEvent, NostrFilter, RelayFetchMeta } from "./types.js";

export type RelayFetchClient = Pick<NostrManager, "fetch">;

export type RelayFetchResult = {
  events: NostrEvent[];
  eventCountsByRelay: Record<string, number>;
  eventCountsByRelayAndFilter: Record<string, number[]>;
  oldestEventTimestampsByRelayAndFilter: Record<string, Array<number | null>>;
  meta: RelayFetchMeta;
};

export function eventMatchesFilter(
  event: NostrEvent,
  filter: NostrFilter
): boolean {
  if (filter.ids && !matchesPrefix(event.id, filter.ids)) return false;
  if (filter.authors && !matchesPrefix(event.pubkey, filter.authors)) {
    return false;
  }
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (filter.since !== undefined && event.created_at < filter.since) {
    return false;
  }
  if (filter.until !== undefined && event.created_at > filter.until) {
    return false;
  }

  for (const [key, values] of Object.entries(filter)) {
    if (!key.startsWith("#") || !Array.isArray(values)) continue;
    const tagName = key.slice(1);
    const tagValues = values.filter(
      (value): value is string => typeof value === "string"
    );
    if (
      !event.tags.some(
        (tag) => tag[0] === tagName && tagValues.includes(tag[1] ?? "")
      )
    ) {
      return false;
    }
  }

  return true;
}

function matchesPrefix(value: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

export function getNewestSaturatedFilterBoundary(
  result: RelayFetchResult,
  requestedLimit: number,
  filterIndexes?: readonly number[]
): number | undefined {
  const includedFilters = filterIndexes && new Set(filterIndexes);
  let boundary: number | undefined;

  for (const [relay, counts] of Object.entries(
    result.eventCountsByRelayAndFilter
  )) {
    const oldestTimestamps =
      result.oldestEventTimestampsByRelayAndFilter[relay] ?? [];
    counts.forEach((count, filterIndex) => {
      if (includedFilters && !includedFilters.has(filterIndex)) return;
      const oldestTimestamp = oldestTimestamps[filterIndex];
      if (count < requestedLimit || oldestTimestamp == null) return;
      boundary =
        boundary === undefined
          ? oldestTimestamp
          : Math.max(boundary, oldestTimestamp);
    });
  }

  return boundary;
}

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
  const eventCountsByRelay: Record<string, number> = {};
  const eventCountsByRelayAndFilter: Record<string, number[]> = {};
  const oldestEventTimestampsByRelayAndFilter: Record<
    string,
    Array<number | null>
  > = {};
  const relaysSucceeded: string[] = [];
  const relaysFailed: Array<{ url: string; error: string }> = [];

  settled.forEach((result, index) => {
    const relay = relays[index] ?? "unknown";
    if (result.status === "fulfilled") {
      relaysSucceeded.push(result.value.relay);
      eventCountsByRelay[result.value.relay] = result.value.events.length;
      const matchingEventsByFilter = filters.map((filter) =>
        result.value.events.filter((event) => eventMatchesFilter(event, filter))
      );
      eventCountsByRelayAndFilter[result.value.relay] =
        matchingEventsByFilter.map((matchingEvents) => matchingEvents.length);
      oldestEventTimestampsByRelayAndFilter[result.value.relay] =
        matchingEventsByFilter.map((matchingEvents, filterIndex) => {
          if (matchingEvents.length === 0) return null;
          const limit = filters[filterIndex]?.limit;
          if (
            limit !== undefined &&
            limit > 0 &&
            matchingEvents.length >= limit
          ) {
            return sortEventsNewestFirst(matchingEvents)[limit - 1]!.created_at;
          }
          return Math.min(...matchingEvents.map((event) => event.created_at));
        });
      events.push(...result.value.events);
    } else {
      eventCountsByRelay[relay] = 0;
      eventCountsByRelayAndFilter[relay] = filters.map(() => 0);
      oldestEventTimestampsByRelayAndFilter[relay] = filters.map(() => null);
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
    eventCountsByRelay,
    eventCountsByRelayAndFilter,
    oldestEventTimestampsByRelayAndFilter,
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
