import type { Event } from "nostr-tools";

export const CACHEABLE_EVENT_KINDS: ReadonlySet<number> = new Set([
  0, 3, 5, 13, 1059, 1111, 4550, 7375, 7376, 10002, 10063, 17375, 24242, 30019,
  30023, 30402, 30405, 31555, 31989, 31990, 34550,
]);

export const CACHE_EVENTS_MAX_BATCH_SIZE = 500;

export function isCacheableKind(kind: unknown): boolean {
  return typeof kind === "number" && CACHEABLE_EVENT_KINDS.has(kind);
}

export function isCacheableEventShape(event: unknown): event is Event {
  return (
    !!event &&
    typeof event === "object" &&
    isCacheableKind((event as { kind?: unknown }).kind)
  );
}
