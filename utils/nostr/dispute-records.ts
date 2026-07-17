import type { EventTemplate } from "nostr-tools";
import { verifyEvent } from "nostr-tools";
import { NostrManager, type NostrEvent } from "@/utils/nostr/nostr-manager";
import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { finalizeAndSendNostrEvent } from "@/utils/nostr/nostr-helper-functions";

export const DISPUTE_EVENT_KIND = 30009;

export interface ParsedDisputeEvent {
  orderId: string;
  reason: string;
  buyerPubkey: string;
  sellerPubkey: string;
  arbiterPubkey: string;
  status: string;
  createdAt: number;
}

export type DisputeEventStatus = "open" | "resolved:buyer" | "resolved:seller";

export function createDisputeEventTemplate(params: {
  orderId: string;
  reason: string;
  buyerPubkey: string;
  sellerPubkey: string;
  arbiterPubkey: string;
  status?: DisputeEventStatus;
  createdAt?: number;
}): EventTemplate {
  const {
    orderId,
    reason,
    buyerPubkey,
    sellerPubkey,
    arbiterPubkey,
    status = "open",
    createdAt = Math.floor(Date.now() / 1000),
  } = params;

  return {
    kind: DISPUTE_EVENT_KIND,
    tags: [
      ["d", orderId],
      ["p", buyerPubkey, "", "buyer"],
      ["p", sellerPubkey, "", "seller"],
      ["p", arbiterPubkey, "", "arbiter"],
      ["status", status],
    ],
    content: reason,
    created_at: createdAt,
  };
}

// Publishes a kind 30009 replaceable "dispute opened" event so the arbiter
// can discover open disputes without needing read access to either party's
// self-encrypted escrow record. Role markers (4th tag element) are used
// instead of relying on p-tag order, so parsing survives future tag
// reordering. Content is the reason string in the clear — dispute reasons
// are relay-visible to anyone filtering by #p; this is an accepted
// tradeoff, not a bug.
export async function publishDisputeEvent(params: {
  orderId: string;
  reason: string;
  nostr: NostrManager;
  signer: NostrSigner;
  buyerPubkey: string;
  sellerPubkey: string;
  arbiterPubkey: string;
}): Promise<void> {
  const {
    orderId,
    reason,
    nostr,
    signer,
    buyerPubkey,
    sellerPubkey,
    arbiterPubkey,
  } = params;

  const event = createDisputeEventTemplate({
    orderId,
    reason,
    buyerPubkey,
    sellerPubkey,
    arbiterPubkey,
    status: "open",
  });

  await finalizeAndSendNostrEvent(signer, nostr, event, {
    waitForRelayPublish: false,
  });
}

function isNostrEvent(value: unknown): value is NostrEvent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<NostrEvent>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.pubkey === "string" &&
    typeof candidate.created_at === "number" &&
    candidate.kind === DISPUTE_EVENT_KIND &&
    Array.isArray(candidate.tags) &&
    typeof candidate.content === "string" &&
    typeof candidate.sig === "string"
  );
}

async function fetchCachedDisputeEvents(
  arbiterPubkey: string
): Promise<NostrEvent[]> {
  try {
    const response = await fetch(
      `/api/db/fetch-disputes?arbiterPubkey=${encodeURIComponent(
        arbiterPubkey
      )}`
    );
    if (!response.ok) return [];
    const events = await response.json();
    return Array.isArray(events)
      ? events.filter(isNostrEvent).filter(verifyEvent)
      : [];
  } catch {
    return [];
  }
}

function getDTag(event: NostrEvent): string | undefined {
  return event.tags.find((tag) => tag[0] === "d")?.[1];
}

// Fetches all open kind 30009 dispute events tagging arbiterPubkey,
// deduplicated by (orderId, author) keeping the newest per author, sorted
// newest first. Deduplication is scoped per-author (not globally per
// orderId) so a forged event from a different pubkey can't silently
// supersede a legitimate party's event for the same order in the map --
// each author's claim for an orderId is kept independent, and it's up to
// downstream consumers (e.g. the arbiter ruling endpoint) to validate which
// claim is authoritative before acting on it.
export async function fetchDisputeEvents(params: {
  nostr: NostrManager;
  arbiterPubkey: string;
}): Promise<NostrEvent[]> {
  const { nostr, arbiterPubkey } = params;

  const [relayEvents, cachedEvents] = await Promise.all([
    nostr
      .fetch([{ kinds: [DISPUTE_EVENT_KIND], "#p": [arbiterPubkey] }])
      .catch(() => [] as NostrEvent[]),
    fetchCachedDisputeEvents(arbiterPubkey),
  ]);

  const newestByOrderIdAndAuthor = new Map<string, NostrEvent>();
  for (const event of [...relayEvents, ...cachedEvents]) {
    const orderId = getDTag(event);
    if (!orderId) continue;
    const key = `${orderId}::${event.pubkey}`;
    const existing = newestByOrderIdAndAuthor.get(key);
    if (!existing || (event.created_at ?? 0) > (existing.created_at ?? 0)) {
      newestByOrderIdAndAuthor.set(key, event);
    }
  }

  return Array.from(newestByOrderIdAndAuthor.values())
    .filter((event) => parseDisputeEvent(event)?.status === "open")
    .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
}

// Fetches the single newest kind 30009 dispute event for a given orderId.
export async function fetchDisputeEvent(params: {
  nostr: NostrManager;
  orderId: string;
  timeoutMs?: number;
}): Promise<NostrEvent | null> {
  const { nostr, orderId, timeoutMs } = params;

  const events = await nostr.fetch(
    [{ kinds: [DISPUTE_EVENT_KIND], "#d": [orderId] }],
    undefined,
    undefined,
    timeoutMs
  );
  if (events.length === 0) return null;

  return events.reduce((newest, event) =>
    (event.created_at ?? 0) > (newest.created_at ?? 0) ? event : newest
  );
}

// Fetches every kind 30009 dispute-event candidate for a given orderId from
// relays, deduplicated by author (newest per author). Unlike
// fetchDisputeEvent, this does not collapse candidates down to a single
// "newest overall" event -- a forged event from an unrelated pubkey with a
// later timestamp would otherwise be indistinguishable from the real one.
// Callers that need to act on the dispute (e.g. paying out a ruling) should
// pick the authoritative candidate via selectAuthoritativeDisputeEvent
// instead of trusting whichever one happens to be newest.
export async function fetchDisputeEventCandidates(params: {
  nostr: NostrManager;
  orderId: string;
  timeoutMs?: number;
}): Promise<NostrEvent[]> {
  const { nostr, orderId, timeoutMs } = params;

  const events = await nostr.fetch(
    [{ kinds: [DISPUTE_EVENT_KIND], "#d": [orderId] }],
    undefined,
    undefined,
    timeoutMs
  );

  const newestByAuthor = new Map<string, NostrEvent>();
  for (const event of events) {
    const existing = newestByAuthor.get(event.pubkey);
    if (!existing || (event.created_at ?? 0) > (existing.created_at ?? 0)) {
      newestByAuthor.set(event.pubkey, event);
    }
  }

  return Array.from(newestByAuthor.values());
}

// Picks the dispute event that should actually be acted on out of a set of
// candidates for the same orderId, cross-checked against the authoritative
// buyer/seller pubkeys recorded for the order (independent of anything in
// the dispute event's own tags, which an attacker fully controls for events
// they sign themselves). If the order record has no known buyer/seller
// (e.g. it was never cached), falls back to newest-overall so legitimate
// disputes for those orders aren't blocked.
export function selectAuthoritativeDisputeEvent(
  candidates: NostrEvent[],
  orderParticipants: { buyerPubkey: string | null; sellerPubkey: string | null }
): NostrEvent | null {
  const sorted = [...candidates].sort(
    (a, b) => (b.created_at ?? 0) - (a.created_at ?? 0)
  );

  const { buyerPubkey, sellerPubkey } = orderParticipants;
  if (!buyerPubkey && !sellerPubkey) {
    return sorted[0] ?? null;
  }

  return (
    sorted.find((event) => {
      const parsed = parseDisputeEvent(event);
      if (!parsed) return false;
      if (buyerPubkey && parsed.buyerPubkey !== buyerPubkey) return false;
      if (sellerPubkey && parsed.sellerPubkey !== sellerPubkey) return false;
      return true;
    }) ?? null
  );
}

export function parseDisputeEvent(
  event: NostrEvent
): ParsedDisputeEvent | null {
  const orderId = getDTag(event);
  const buyerPubkey = event.tags.find(
    (tag) => tag[0] === "p" && tag[3] === "buyer"
  )?.[1];
  const sellerPubkey = event.tags.find(
    (tag) => tag[0] === "p" && tag[3] === "seller"
  )?.[1];
  const arbiterPubkey = event.tags.find(
    (tag) => tag[0] === "p" && tag[3] === "arbiter"
  )?.[1];

  if (!orderId || !buyerPubkey || !sellerPubkey || !arbiterPubkey) {
    return null;
  }

  const status = event.tags.find((tag) => tag[0] === "status")?.[1] ?? "open";

  return {
    orderId,
    reason: event.content,
    buyerPubkey,
    sellerPubkey,
    arbiterPubkey,
    status,
    createdAt: event.created_at,
  };
}
