const STORAGE_KEY = "cashu_requested_deletion_event_ids";
const MAX_TRACKED = 2000;

function readSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeSet(set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    let arr = Array.from(set);
    if (arr.length > MAX_TRACKED) {
      arr = arr.slice(arr.length - MAX_TRACKED);
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // Quota or serialization failures are best-effort — we'd rather skip the
    // persist than crash the boot flow.
  }
}

export function getRequestedDeletionIds(): Set<string> {
  return readSet();
}

export function markEventsRequestedForDeletion(eventIds: string[]): void {
  if (!eventIds || eventIds.length === 0) return;
  const set = readSet();
  let mutated = false;
  for (const id of eventIds) {
    if (!set.has(id)) {
      set.add(id);
      mutated = true;
    }
  }
  if (mutated) writeSet(set);
}

export function filterUnrequestedEventIds(eventIds: string[]): string[] {
  if (!eventIds || eventIds.length === 0) return [];
  const set = readSet();
  return eventIds.filter((id) => !set.has(id));
}
