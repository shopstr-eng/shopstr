import type { NostrEvent } from "./types.js";

export function getDTag(event: NostrEvent): string | undefined {
  return event.tags?.find((tag) => tag[0] === "d")?.[1];
}

export function getParameterizedReplaceableCoordinate(
  event: NostrEvent
): string | undefined {
  const dTag = getDTag(event);
  if (!dTag) return;
  return `${event.kind}:${event.pubkey}:${dTag}`;
}

export function mergeAndDeduplicateProducts(
  events: readonly NostrEvent[]
): NostrEvent[] {
  const byCoordinate = new Map<string, NostrEvent>();

  for (const event of events) {
    const coordinate =
      event.kind === 30402
        ? getParameterizedReplaceableCoordinate(event) ?? event.id
        : event.id;
    const existing = byCoordinate.get(coordinate);
    if (!existing || event.created_at > existing.created_at) {
      byCoordinate.set(coordinate, event);
    }
  }

  const byId = new Map<string, NostrEvent>();
  for (const event of byCoordinate.values()) {
    if (!byId.has(event.id)) {
      byId.set(event.id, event);
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => b.created_at - a.created_at
  );
}
