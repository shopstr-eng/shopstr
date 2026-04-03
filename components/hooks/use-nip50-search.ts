import { useContext, useEffect, useRef, useState } from "react";
import { NostrContext } from "@/components/utility-components/nostr-context-provider";
import {
  searchListingsNip50,
  NIP50_SEARCH_RELAY,
} from "@/utils/nostr/nip50-search";
import { NostrEvent } from "@/utils/types/types";
import { cacheEventsToDatabase } from "@/utils/db/db-client";

function shouldSkipNip50Search(query: string): boolean {
  const normalized = query.trim().toLowerCase();
  return (
    !normalized ||
    normalized.length < 3 ||
    normalized.startsWith("npub") ||
    normalized.startsWith("naddr")
  );
}

export function useNip50Search(query: string, debounceMs = 400) {
  const { nostr } = useContext(NostrContext);

  const [results, setResults] = useState<NostrEvent[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    const trimmedQuery = query.trim();
    const requestId = ++requestIdRef.current;

    if (shouldSkipNip50Search(trimmedQuery) || !nostr) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    timerRef.current = setTimeout(async () => {
      const events = await searchListingsNip50(
        nostr,
        trimmedQuery,
        NIP50_SEARCH_RELAY
      );

      if (requestId !== requestIdRef.current) return;

      setResults(events);
      setIsSearching(false);

      const validProducts = events.filter(
        (event) => event.id && event.sig && event.pubkey && event.kind === 30402
      );

      if (validProducts.length > 0) {
        cacheEventsToDatabase(validProducts).catch((error) => {
          console.error("Failed to cache NIP-50 search events:", error);
        });
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [query, nostr, debounceMs]);

  return {
    results,
    isSearching,
  };
}
