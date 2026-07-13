import type { EventTemplate } from "nostr-tools";
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

function getDTag(event: NostrEvent): string | undefined {
  return event.tags.find((tag) => tag[0] === "d")?.[1];
}

// Fetches all open kind 30009 dispute events tagging arbiterPubkey,
// deduplicated by orderId (the d tag) keeping the newest per orderId, sorted
// newest first.
export async function fetchDisputeEvents(params: {
  nostr: NostrManager;
  arbiterPubkey: string;
}): Promise<NostrEvent[]> {
  const { nostr, arbiterPubkey } = params;

  const events = await nostr.fetch([
    { kinds: [DISPUTE_EVENT_KIND], "#p": [arbiterPubkey] },
  ]);

  const newestByOrderId = new Map<string, NostrEvent>();
  for (const event of events) {
    const orderId = getDTag(event);
    if (!orderId) continue;
    const existing = newestByOrderId.get(orderId);
    if (!existing || (event.created_at ?? 0) > (existing.created_at ?? 0)) {
      newestByOrderId.set(orderId, event);
    }
  }

  return Array.from(newestByOrderId.values())
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
