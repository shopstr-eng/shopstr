import { Filter } from "nostr-tools";
import { cacheEventsToDatabase } from "@/utils/db/db-client";
import { NostrEvent } from "@/utils/types/types";
import {
  NostrFilter,
  NostrManager,
  NostrSub,
} from "@/utils/nostr/nostr-manager";

type EditProductContext = (
  productEvents: NostrEvent[],
  isLoading: boolean
) => void;

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function getEventKey(event: NostrEvent): string {
  if (event.kind === 30402) {
    const dTag = event.tags?.find((tag: string[]) => tag[0] === "d")?.[1];
    if (dTag) return `${event.pubkey}:${dTag}`;
  }
  return event.id;
}

function isValidProductRelayEvent(
  event: NostrEvent | null | undefined
): event is NostrEvent {
  return (
    !!event?.id &&
    !!event.sig &&
    !!event.pubkey &&
    (event.kind === 30402 || event.kind === 1)
  );
}

async function fetchRelayEvents(
  nostr: NostrManager,
  filters: NostrFilter[],
  relays: string[],
  signal?: AbortSignal
): Promise<NostrEvent[]> {
  if (signal?.aborted) return [];

  return new Promise<NostrEvent[]>((resolve, reject) => {
    const fetchedEvents: NostrEvent[] = [];
    let sub: NostrSub | undefined;
    let didCloseSub = false;
    let didSettle = false;

    const closeSubIfNeeded = async () => {
      if (!sub || didCloseSub) return;
      didCloseSub = true;
      await sub.close();
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", handleAbort);
    };

    const resolveOnce = async () => {
      if (didSettle) return;
      didSettle = true;
      cleanup();
      await closeSubIfNeeded().catch(console.error);
      resolve(fetchedEvents);
    };

    const rejectOnce = async (error: unknown) => {
      if (didSettle) return;
      didSettle = true;
      cleanup();
      await closeSubIfNeeded().catch(console.error);
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    function handleAbort() {
      resolveOnce().catch(console.error);
    }

    const timeoutId = setTimeout(() => {
      resolveOnce().catch(console.error);
    }, 60000);

    signal?.addEventListener("abort", handleAbort, { once: true });

    nostr
      .subscribe(
        filters,
        {
          onevent: (event: NostrEvent) => {
            fetchedEvents.push(event);
          },
          oneose: () => {
            resolveOnce().catch(console.error);
          },
        },
        relays
      )
      .then((createdSub) => {
        sub = createdSub;
        if (didSettle || signal?.aborted) {
          closeSubIfNeeded().catch(console.error);
        }
      })
      .catch((error) => {
        if (signal?.aborted) {
          resolveOnce().catch(console.error);
          return;
        }
        rejectOnce(error).catch(console.error);
      });
  });
}

export const fetchAllPostsAbortable = async (
  nostr: NostrManager,
  relays: string[],
  editProductContext: EditProductContext,
  signal?: AbortSignal
): Promise<{
  productEvents: NostrEvent[];
  profileSetFromProducts: Set<string>;
}> => {
  return new Promise(async function (resolve, reject) {
    try {
      const BATCH_SIZE = 500;
      const profileSetFromProducts: Set<string> = new Set();
      const dbProductsMap = new Map<string, NostrEvent>();

      const resolveIfAborted = (): boolean => {
        if (!signal?.aborted) return false;
        resolve({
          productEvents: Array.from(dbProductsMap.values()),
          profileSetFromProducts,
        });
        return true;
      };

      if (resolveIfAborted()) return;

      // Cascading DB fetch: load batches one at a time, displaying each as it arrives
      let offset = 0;
      let keepFetching = true;
      while (keepFetching) {
        try {
          const requestUrl = `/api/db/fetch-products?limit=${BATCH_SIZE}&offset=${offset}`;
          const response = signal
            ? await fetch(requestUrl, { signal })
            : await fetch(requestUrl);
          if (resolveIfAborted()) return;
          if (!response.ok) break;

          const batch: NostrEvent[] = await response.json();
          if (resolveIfAborted()) return;
          if (!batch.length) break;

          for (const event of batch) {
            if (resolveIfAborted()) return;
            if (event && event.id) {
              const key = getEventKey(event);
              const existing = dbProductsMap.get(key);
              if (!existing || event.created_at > existing.created_at) {
                dbProductsMap.set(key, event);
              }
              if (event.pubkey) profileSetFromProducts.add(event.pubkey);
            }
          }

          if (resolveIfAborted()) return;
          editProductContext(Array.from(dbProductsMap.values()), true);

          if (batch.length < BATCH_SIZE) break;
          offset += BATCH_SIZE;
        } catch (error) {
          if (isAbortError(error) || signal?.aborted) {
            resolve({
              productEvents: Array.from(dbProductsMap.values()),
              profileSetFromProducts,
            });
            return;
          }
          console.error("Failed to fetch products batch from database:", error);
          break;
        }
      }

      if (resolveIfAborted()) return;

      const filter: Filter = {
        kinds: [30402],
        "#t": ["MilkMarket", "FREEMILK"],
      };

      const specificPubkeyFilter: Filter = {
        kinds: [30402],
        authors: [
          "99cefa645b00817373239aebb96d2d1990244994e5e565566c82c04b8dc65b54",
        ],
      };

      const zapsnagFilter: Filter = {
        kinds: [1],
        "#t": ["milk-market-zapsnag"],
      };

      const fetchedEvents = await fetchRelayEvents(
        nostr,
        [filter, specificPubkeyFilter, zapsnagFilter],
        relays,
        signal
      );
      if (resolveIfAborted()) return;

      if (!fetchedEvents.length) {
        console.error("No products found with filter: ", filter);
      }

      // Cache valid product events to database
      const validProductEvents = fetchedEvents.filter(isValidProductRelayEvent);
      if (validProductEvents.length > 0) {
        cacheEventsToDatabase(validProductEvents).catch((error) =>
          console.error("Failed to cache products to database:", error)
        );
      }

      // Merge relay events on top of the accumulated DB products
      for (const event of fetchedEvents) {
        if (resolveIfAborted()) return;
        if (!isValidProductRelayEvent(event)) continue;
        const key = getEventKey(event);
        const existing = dbProductsMap.get(key);
        if (!existing || event.created_at >= existing.created_at) {
          dbProductsMap.set(key, event);
        }
        profileSetFromProducts.add(event.pubkey);
      }

      const mergedProductArray = Array.from(dbProductsMap.values());

      if (resolveIfAborted()) return;
      editProductContext(mergedProductArray, false);

      resolve({
        productEvents: mergedProductArray,
        profileSetFromProducts,
      });
    } catch (error) {
      reject(error);
    }
  });
};
