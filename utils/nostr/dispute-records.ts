import type { EventTemplate } from "nostr-tools";
import { verifyEvent } from "nostr-tools";
import { NostrManager, type NostrEvent } from "@/utils/nostr/nostr-manager";
import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { finalizeAndSendNostrEvent } from "@/utils/nostr/nostr-helper-functions";

// NOTE: kind 30009 collides with NIP-58 Badge Definitions; 30407 is
// unassigned in the parameterized-replaceable range and matches the
// numbering already used by the neighboring 30405/30406 custom kinds.
export const DISPUTE_EVENT_KIND = 30407;

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
const DISPUTE_EVENT_STATUSES = new Set<DisputeEventStatus>([
  "open",
  "resolved:buyer",
  "resolved:seller",
]);

type OrderParticipants = {
  buyerPubkey: string | null;
  sellerPubkey: string | null;
};

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

// Publishes a kind 30407 replaceable "dispute opened" event so the arbiter
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
    requireDurableCache: true,
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

export function isDisputeTransitionAuthorAuthorized(
  event: NostrEvent,
  expectedArbiterPubkey?: string
): boolean {
  const parsed = parseDisputeEvent(event);
  if (!parsed) return false;
  if (expectedArbiterPubkey && parsed.arbiterPubkey !== expectedArbiterPubkey) {
    return false;
  }

  if (parsed.status === "open") {
    return (
      event.pubkey === parsed.buyerPubkey ||
      event.pubkey === parsed.sellerPubkey
    );
  }

  return event.pubkey === parsed.arbiterPubkey;
}

// Fetches all open kind 30407 dispute events tagging arbiterPubkey,
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

  const eventsByOrderId = new Map<string, NostrEvent[]>();
  for (const event of [...relayEvents, ...cachedEvents]) {
    const orderId = getDTag(event);
    const parsed = parseDisputeEvent(event);
    if (
      !verifyEvent(event) ||
      !orderId ||
      !parsed ||
      !isDisputeTransitionAuthorAuthorized(event, arbiterPubkey)
    ) {
      continue;
    }
    const existing = eventsByOrderId.get(orderId) ?? [];
    existing.push(event);
    eventsByOrderId.set(orderId, existing);
  }

  const openEvents: NostrEvent[] = [];
  for (const orderEvents of eventsByOrderId.values()) {
    const authorizedResolutions = orderEvents.filter(
      (event) => parseDisputeEvent(event)?.status !== "open"
    );
    if (authorizedResolutions.length > 0) continue;

    const newestOpenByAuthor = new Map<string, NostrEvent>();
    for (const event of orderEvents) {
      const parsed = parseDisputeEvent(event);
      if (parsed?.status !== "open") {
        continue;
      }
      const existing = newestOpenByAuthor.get(event.pubkey);
      if (!existing || event.created_at > existing.created_at) {
        newestOpenByAuthor.set(event.pubkey, event);
      }
    }
    openEvents.push(...newestOpenByAuthor.values());
  }

  return openEvents.sort((a, b) => b.created_at - a.created_at);
}

// Fetches the role-authorized state for an order. A resolution signed by the
// configured arbiter is final regardless of later participant timestamps.
export async function fetchDisputeEvent(params: {
  nostr: NostrManager;
  orderId: string;
  timeoutMs?: number;
  orderParticipants?: OrderParticipants;
  arbiterPubkey?: string;
}): Promise<NostrEvent | null> {
  const { nostr, orderId, timeoutMs, orderParticipants, arbiterPubkey } =
    params;

  const events = await nostr.fetch(
    [{ kinds: [DISPUTE_EVENT_KIND], "#d": [orderId] }],
    undefined,
    undefined,
    timeoutMs
  );
  if (events.length === 0) return null;

  if (orderParticipants) {
    return selectAuthoritativeDisputeEvent(
      events.filter(verifyEvent),
      orderParticipants,
      arbiterPubkey
    );
  }

  const authorized = events
    .filter(verifyEvent)
    .filter((event) =>
      isDisputeTransitionAuthorAuthorized(event, arbiterPubkey)
    );
  const resolutions = authorized.filter(
    (event) => parseDisputeEvent(event)?.status !== "open"
  );
  const candidates = resolutions.length > 0 ? resolutions : authorized;
  return candidates.sort((a, b) => b.created_at - a.created_at)[0] ?? null;
}

// Fetches every kind 30407 dispute-event candidate for a given orderId from
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
  for (const event of events.filter(verifyEvent)) {
    const existing = newestByAuthor.get(event.pubkey);
    if (!existing || (event.created_at ?? 0) > (existing.created_at ?? 0)) {
      newestByAuthor.set(event.pubkey, event);
    }
  }

  return Array.from(newestByAuthor.values());
}

// Picks the dispute event that should actually be acted on out of a set of
// candidates for the same orderId. The buyer/seller tags must match the
// authoritative order record, and event.pubkey must be one of those same
// participants; role tags alone are attacker-controlled and are not
// authorship proof.
export function selectAuthoritativeDisputeEvent(
  candidates: NostrEvent[],
  orderParticipants: OrderParticipants,
  expectedArbiterPubkey?: string
): NostrEvent | null {
  const { buyerPubkey, sellerPubkey } = orderParticipants;
  if (!buyerPubkey || !sellerPubkey) return null;

  const authorized = candidates.filter((event) => {
    const parsed = parseDisputeEvent(event);
    if (!parsed) return false;
    if (parsed.buyerPubkey !== buyerPubkey) return false;
    if (parsed.sellerPubkey !== sellerPubkey) return false;
    if (
      expectedArbiterPubkey &&
      parsed.arbiterPubkey !== expectedArbiterPubkey
    ) {
      return false;
    }

    if (parsed.status === "open") {
      return event.pubkey === buyerPubkey || event.pubkey === sellerPubkey;
    }

    return event.pubkey === parsed.arbiterPubkey;
  });

  // A participant cannot reopen a dispute after the arbiter has ruled, even
  // by publishing an event with an artificially far-future created_at.
  const resolutions = authorized.filter(
    (event) => parseDisputeEvent(event)?.status !== "open"
  );
  const currentState = resolutions.length > 0 ? resolutions : authorized;

  return currentState.sort((a, b) => b.created_at - a.created_at)[0] ?? null;
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
  if (!DISPUTE_EVENT_STATUSES.has(status as DisputeEventStatus)) {
    return null;
  }

  return {
    orderId,
    reason: event.content,
    buyerPubkey,
    sellerPubkey,
    arbiterPubkey,
    status: status as DisputeEventStatus,
    createdAt: event.created_at,
  };
}
