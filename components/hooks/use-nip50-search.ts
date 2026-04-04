import { useContext, useEffect, useRef, useState } from "react";
import { NostrContext } from "@/components/utility-components/nostr-context-provider";
import {
  NIP50_EOSE_GRACE_MS,
  NIP50_SEARCH_RELAYS,
  NIP50_SEARCH_TIMEOUT_MS,
  searchListingsNip50,
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
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

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
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const events = await searchListingsNip50(nostr, trimmedQuery, {
          relayUrls: NIP50_SEARCH_RELAYS,
          hardTimeoutMs: NIP50_SEARCH_TIMEOUT_MS,
          eoseGraceMs: NIP50_EOSE_GRACE_MS,
          signal: abortController.signal,
          onUpdate: (streamedEvents) => {
            if (
              requestId !== requestIdRef.current ||
              abortController.signal.aborted
            ) {
              return;
            }

            setResults(streamedEvents);
          },
        });

        if (
          requestId !== requestIdRef.current ||
          abortController.signal.aborted
        ) {
          return;
        }

        setResults(events);
        setIsSearching(false);

        const validProducts = events.filter(
          (event) =>
            event.id && event.sig && event.pubkey && event.kind === 30402
        );

        if (validProducts.length > 0) {
          cacheEventsToDatabase(validProducts).catch((error) => {
            console.error("Failed to cache NIP-50 search events:", error);
          });
        }
      } catch (error) {
        if (requestId !== requestIdRef.current) return;

        if (
          !error ||
          typeof error !== "object" ||
          (error as { name?: string }).name !== "AbortError"
        ) {
          console.error("NIP-50 search hook failed:", error);
          setResults([]);
          setIsSearching(false);
        }
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
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
