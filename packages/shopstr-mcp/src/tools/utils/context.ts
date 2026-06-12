import type { MemoryCache } from "../../cache.js";
import type { RelayFetchClient } from "../../relay-fetch.js";

export type CoreToolContext = {
  nostr: RelayFetchClient;
  relays: string[];
  timeoutMs: number;
  cache: MemoryCache;
};
