import { mapWithConcurrency } from "@/utils/concurrency";
import type { NostrEvent } from "@/utils/types/types";

export const PROFILE_CACHE_PUBKEY_LIMIT = 100;
const PROFILE_CACHE_BATCH_CONCURRENCY = 4;

export type ProfileCacheScope = {
  kind: 0 | 30019;
  pubkeys: string[];
};

export type ProfileCacheRead =
  | { mode: "unfiltered" }
  | { mode: "public-listing-authors"; pubkeys: readonly string[] };

export async function fetchCachedProfileEvents(
  kind: ProfileCacheScope["kind"],
  read: ProfileCacheRead = { mode: "unfiltered" }
): Promise<NostrEvent[]> {
  if (read.mode === "unfiltered") {
    const response = await fetch("/api/db/fetch-profiles");
    return response.ok ? response.json() : [];
  }

  const uniquePubkeys = [...new Set(read.pubkeys)];
  const batches: string[][] = [];
  for (
    let index = 0;
    index < uniquePubkeys.length;
    index += PROFILE_CACHE_PUBKEY_LIMIT
  ) {
    batches.push(
      uniquePubkeys.slice(index, index + PROFILE_CACHE_PUBKEY_LIMIT)
    );
  }

  const results = await mapWithConcurrency(
    batches,
    PROFILE_CACHE_BATCH_CONCURRENCY,
    async (batch): Promise<NostrEvent[]> => {
      const query = new URLSearchParams({
        kind: String(kind),
        pubkeys: batch.join(","),
      });
      const response = await fetch(`/api/db/fetch-profiles?${query}`);
      return response.ok ? response.json() : [];
    }
  );

  return results.flat();
}
