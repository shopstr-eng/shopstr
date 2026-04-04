import {
  NostrFilter,
  NostrManager,
  NostrSub,
  NostrEvent,
} from "@/utils/nostr/nostr-manager";

export const NIP50_SEARCH_RELAY = "wss://search.nos.today";
export const NIP50_SEARCH_RELAY_FALLBACK = "wss://antiprimal.net/";
export const NIP50_SEARCH_RELAYS = [
  NIP50_SEARCH_RELAY,
  NIP50_SEARCH_RELAY_FALLBACK,
];
export const NIP50_SEARCH_TIMEOUT_MS = 15000;
export const NIP50_EOSE_GRACE_MS = 1000;

type Nip50SearchFilter = NostrFilter & {
  search: string;
  limit: number;
};

type Nip50SearchOptions = {
  relayUrls?: string[];
  hardTimeoutMs?: number;
  eoseGraceMs?: number;
  signal?: AbortSignal;
  onUpdate?: (events: NostrEvent[]) => void;
};

function getEventKey(event: NostrEvent): string {
  if (event.kind === 30402) {
    const dTag = event.tags?.find((tag: string[]) => tag[0] === "d")?.[1];
    if (dTag) return `${event.pubkey}:${dTag}`;
  }
  return event.id;
}

function isAbortError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError"
  );
}

function makeAbortError(): Error {
  const error = new Error("NIP-50 search aborted");
  error.name = "AbortError";
  return error;
}

async function searchListingsOnRelay(
  nostr: NostrManager,
  filter: Nip50SearchFilter,
  relayUrl: string,
  hardTimeoutMs: number,
  eoseGraceMs: number,
  signal?: AbortSignal,
  onEvent?: (event: NostrEvent) => void
): Promise<NostrEvent[]> {
  return await new Promise((resolve, reject) => {
    let settled = false;
    let sub: NostrSub | null = null;
    let hardTimeout: ReturnType<typeof setTimeout> | null = null;
    let eoseTimeout: ReturnType<typeof setTimeout> | null = null;
    const collectedEvents = new Map<string, NostrEvent>();

    const closeSub = () => {
      if (sub) {
        void sub.close();
        sub = null;
      }
    };

    const cleanup = () => {
      if (hardTimeout) {
        clearTimeout(hardTimeout);
        hardTimeout = null;
      }
      if (eoseTimeout) {
        clearTimeout(eoseTimeout);
        eoseTimeout = null;
      }
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      if (sub) {
        void sub.close();
        sub = null;
      }
    };

    const resolveWithEvents = () => {
      if (settled) return;
      settled = true;
      cleanup();
      closeSub();
      resolve(
        Array.from(collectedEvents.values()).sort(
          (a, b) => b.created_at - a.created_at
        )
      ); 
    };

    const rejectWithError = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      closeSub();
      reject(error);
    };

    const onAbort = () => {
      rejectWithError(makeAbortError());
    };

    if (signal?.aborted) {
      rejectWithError(makeAbortError());
      return;
    }

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    hardTimeout = setTimeout(() => {
      resolveWithEvents();
    }, hardTimeoutMs);

    void nostr
      .subscribe(
        [filter],
        {
          onevent: (event: NostrEvent) => {
            if (!event?.id || event.kind !== 30402) return;
            const existing = collectedEvents.get(event.id);
            if (!existing || event.created_at >= existing.created_at) {
              collectedEvents.set(event.id, event);
              onEvent?.(event);
            }
          },
          oneose: () => {
            if (eoseTimeout) {
              clearTimeout(eoseTimeout);
            }
            eoseTimeout = setTimeout(() => {
              resolveWithEvents();
            }, eoseGraceMs);
          },
        },
        [relayUrl]
      )
      .then((subscription) => {
        sub = subscription;

        if (settled) {
          closeSub();
          return;
        }

        if (signal?.aborted) {
          onAbort();
        }
      })
      .catch((error) => {
        rejectWithError(error);
      });
  });
}

/**
 * Queries NIP-50 capable relays for kind 30402 listing events.
 */
export async function searchListingsNip50(
  nostr: NostrManager,
  query: string,
  relayOrOptions: string | Nip50SearchOptions = NIP50_SEARCH_RELAY
): Promise<NostrEvent[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const relayUrls =
    typeof relayOrOptions === "string"
      ? [relayOrOptions]
      : relayOrOptions.relayUrls && relayOrOptions.relayUrls.length > 0
      ? relayOrOptions.relayUrls
      : NIP50_SEARCH_RELAYS;

  const hardTimeoutMs =
    typeof relayOrOptions === "string"
      ? NIP50_SEARCH_TIMEOUT_MS
      : relayOrOptions.hardTimeoutMs ?? NIP50_SEARCH_TIMEOUT_MS;

  const eoseGraceMs =
    typeof relayOrOptions === "string"
      ? NIP50_EOSE_GRACE_MS
      : relayOrOptions.eoseGraceMs ?? NIP50_EOSE_GRACE_MS;

  const signal =
    typeof relayOrOptions === "string" ? undefined : relayOrOptions.signal;

  const onUpdate =
    typeof relayOrOptions === "string" ? undefined : relayOrOptions.onUpdate;

  const filter: Nip50SearchFilter = {
    kinds: [30402],
    search: trimmedQuery,
    limit: 100,
  };

  const aggregatedEvents = new Map<string, NostrEvent>();
  const upsertAggregatedEvent = (event: NostrEvent) => {
    const key = getEventKey(event);
    const existing = aggregatedEvents.get(key);
    if (!existing || event.created_at >= existing.created_at) {
      aggregatedEvents.set(key, event);
      onUpdate?.(
        Array.from(aggregatedEvents.values()).sort(
          (a, b) => b.created_at - a.created_at
        )
      );
    }
  };

  const relayResults = await Promise.all(
    relayUrls.map(async (relayUrl) => {
      try {
        const events = await searchListingsOnRelay(
          nostr,
          filter,
          relayUrl,
          hardTimeoutMs,
          eoseGraceMs,
          signal,
          upsertAggregatedEvent
        );
        return { relayUrl, events };
      } catch (error) {
        return { relayUrl, error };
      }
    })
  );

  const abortResult = relayResults.find(
    (result) => "error" in result && isAbortError(result.error)
  );
  if (abortResult && "error" in abortResult) {
    throw abortResult.error;
  }

  relayResults.forEach((result) => {
    if ("error" in result) {
      console.error(`NIP-50 search failed on relay ${result.relayUrl}:`, result.error);
    }
  });

  const allEvents: NostrEvent[] = relayResults
    .flatMap((result) => ("events" in result ? result.events : []))
    .filter((event): event is NostrEvent => !!event);

  const finalEvents = mergeAndDeduplicateProducts(
    Array.from(aggregatedEvents.values()),
    allEvents
  );

  return finalEvents.sort((a, b) => b.created_at - a.created_at);
}

/**
 * Merges local and remote listing events and deduplicates by listing identity.
 * For kind 30402, identity is pubkey:d-tag; otherwise identity is event id.
 */
export function mergeAndDeduplicateProducts(
  localProducts: NostrEvent[],
  remoteProducts: NostrEvent[]
): NostrEvent[] {
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
