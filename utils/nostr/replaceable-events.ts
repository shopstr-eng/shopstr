export interface ReplaceableEventLike {
  id: string;
  created_at: number;
}

export function compareReplaceableEvents(
  a: ReplaceableEventLike,
  b: ReplaceableEventLike
): number {
  if (a.created_at !== b.created_at) {
    return b.created_at - a.created_at;
  }

  if (a.id === b.id) {
    return 0;
  }

  return a.id < b.id ? -1 : 1;
}

export function selectPreferredReplaceableEvent<T extends ReplaceableEventLike>(
  candidate: T,
  current: T
): T {
  return compareReplaceableEvents(candidate, current) <= 0
    ? candidate
    : current;
}

export function pickPreferredReplaceableEvent<T extends ReplaceableEventLike>(
  events: readonly T[]
): T | null {
  let preferred: T | null = null;

  for (const event of events) {
    preferred = preferred
      ? selectPreferredReplaceableEvent(event, preferred)
      : event;
  }

  return preferred;
}
