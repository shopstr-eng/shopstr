import type { MemoryCache } from "../../cache.js";
import type { verifyNip05Claim } from "../../nip05.js";
import type { RelayFetchClient } from "../../relay-fetch.js";

export type CoreToolContext = {
  nostr: RelayFetchClient;
  relays: string[];
  nip50SearchRelays?: string[];
  timeoutMs: number;
  cache: MemoryCache;
  categoryCache: MemoryCache;
  nip05Cache?: MemoryCache;
  maxConcurrentRequests: number;
  nip05Verifier?: typeof verifyNip05Claim;
};
