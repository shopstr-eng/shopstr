import type { EventTemplate } from "nostr-tools";
import { verifyEvent } from "nostr-tools";
import { NostrManager, type NostrEvent } from "@/utils/nostr/nostr-manager";
import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { finalizeAndSendNostrEvent } from "@/utils/nostr/nostr-helper-functions";

// NOTE: 30408 and 30409 are the next two unassigned slots in the
// parameterized-replaceable range after DISPUTE_EVENT_KIND (30407), continuing
// the 30405/30406/30407 run of custom Shopstr kinds.
//
// The two message types get separate kinds rather than one kind with a
// "type" tag so that a relay filter on kind alone already separates buyer
// confirmations from arbiter rulings: an event of one kind can never be
// mistaken for the other by a filter that forgot to check a tag.
export const HODL_CONFIRM_EVENT_KIND = 30408;
export const HODL_RELEASE_EVENT_KIND = 30409;
// Next free slot after 30409, continuing the same run. One shared kind for
// both buyer- and seller-raised disputes — see createHodlDisputeEventTemplate
// for why there is no separate kind, or tag, per role.
export const HODL_DISPUTE_EVENT_KIND = 30410;

// The `d` tag on both kinds is the hold invoice's payment hash, which is
// 32 bytes of hex. Shape is checked here rather than imported from
// utils/lightning/payment-hash.ts so this module stays independent of the
// Lightning provider layer — nothing in this file may reach into it.
const PAYMENT_HASH_HEX = /^[0-9a-f]{64}$/i;

export interface ParsedHodlConfirmEvent {
  /** The `d` tag: the hold invoice's payment hash, lowercased. */
  orderId: string;
  /**
   * The pubkey that signed this event, and nothing more.
   *
   * Deliberately NOT named `buyerPubkey`. Nostr guarantees only that this key
   * signed the event; it says nothing about whether that key is the buyer on
   * the order. Anyone can generate a keypair and publish a confirmation for
   * any payment hash they have seen. Establishing that this pubkey is in fact
   * the order's buyer requires comparing it against a record written at order
   * creation — which does not exist yet, and is not this module's job.
   */
  authorPubkey: string;
  /** Optional free-text note from the signer. May be empty. */
  note: string;
  createdAt: number;
}

export type HodlReleaseDecision = "release:buyer" | "release:seller";

const HODL_RELEASE_DECISIONS = new Set<HodlReleaseDecision>([
  "release:buyer",
  "release:seller",
]);

export interface ParsedHodlReleaseEvent {
  /** The `d` tag: the hold invoice's payment hash, lowercased. */
  orderId: string;
  /** Machine-readable ruling, so a later step can branch on it. */
  decision: HodlReleaseDecision;
  /**
   * The pubkey that signed this event. Same caveat as
   * {@link ParsedHodlConfirmEvent.authorPubkey}: being able to sign a ruling
   * is not the same as being the arbiter. Nothing here checks it against
   * a configured arbiter key.
   */
  authorPubkey: string;
  /** The arbiter's human-readable reasoning. May be empty. */
  reasoning: string;
  createdAt: number;
}

/**
 * Normalizes a payment hash into the `d`-tag / relay-filter form, or returns
 * null if it is not 32 bytes of hex.
 *
 * Lowercasing matters: relay `#d` filters are exact string matches, so a
 * mixed-case payment hash would query for events that were published under a
 * different key and silently return nothing.
 */
function normalizeOrderId(paymentHash: unknown): string | null {
  if (typeof paymentHash !== "string" || !PAYMENT_HASH_HEX.test(paymentHash)) {
    return null;
  }
  return paymentHash.toLowerCase();
}

function getDTag(event: NostrEvent): string | undefined {
  if (!Array.isArray(event.tags)) return undefined;
  return event.tags.find((tag) => tag[0] === "d")?.[1];
}

// ---------------------------------------------------------------------------
// 1. Buyer confirmation (kind 30408)
// ---------------------------------------------------------------------------

/**
 * Builds the "I received the goods" event, signed by whoever publishes it.
 *
 * The event carries no `p` tag and no field naming a buyer. Adding one would
 * be worse than useless: a role tag is written by the event's own author, so
 * a `["p", <someone>, "", "buyer"]` marker proves nothing and invites a later
 * reader to treat it as though it did. The signer's identity is the event's
 * `pubkey`, full stop.
 *
 * There is no `status` tag either — the existence of the event is the
 * confirmation. That keeps the parameterized-replaceable semantics honest:
 * republishing under the same `d` tag can only refresh the note, never
 * retract the confirmation into some "unconfirmed" state.
 */
export function createHodlConfirmEventTemplate(params: {
  paymentHash: string;
  note?: string;
  createdAt?: number;
}): EventTemplate {
  const {
    paymentHash,
    note = "",
    createdAt = Math.floor(Date.now() / 1000),
  } = params;

  const orderId = normalizeOrderId(paymentHash);
  if (!orderId) {
    throw new Error(
      "paymentHash must be 32 bytes of hex (64 characters) to be used as a hodl escrow d tag"
    );
  }

  return {
    kind: HODL_CONFIRM_EVENT_KIND,
    tags: [["d", orderId]],
    content: note,
    created_at: createdAt,
  };
}

// Publishes the buyer's confirmation. Unlike publishDisputeEvent, this waits
// for the relay publish and does not require a durable database cache: kinds
// 30408/30409 are not in CACHEABLE_EVENT_KINDS, so relays are the only place
// these events are stored, and a fire-and-forget publish could drop a
// confirmation with nothing left to recover it from. (The non-strict cache
// attempt inside finalizeAndSendNostrEvent will log a failure for these kinds
// until they are added to the cache policy; it does not block the publish.)
export async function publishHodlConfirmEvent(params: {
  paymentHash: string;
  note?: string;
  nostr: NostrManager;
  signer: NostrSigner;
}): Promise<void> {
  const { paymentHash, note, nostr, signer } = params;

  const event = createHodlConfirmEventTemplate({
    paymentHash,
    ...(note === undefined ? {} : { note }),
  });

  await finalizeAndSendNostrEvent(signer, nostr, event, {
    waitForRelayPublish: true,
    requireDurableCache: false,
  });
}

/**
 * Parses a candidate confirmation event, or returns null if it is not one.
 *
 * Returns `authorPubkey` and never a role-named field, so no caller can
 * mistake this for an answer to "did the buyer confirm?". It answers only
 * "is this a well-formed confirmation event, and who signed it?".
 */
export function parseHodlConfirmEvent(
  event: NostrEvent
): ParsedHodlConfirmEvent | null {
  if (!event || event.kind !== HODL_CONFIRM_EVENT_KIND) return null;
  if (typeof event.pubkey !== "string" || event.pubkey.length === 0) {
    return null;
  }
  if (typeof event.created_at !== "number") return null;

  const orderId = normalizeOrderId(getDTag(event));
  if (!orderId) return null;

  return {
    orderId,
    authorPubkey: event.pubkey,
    note: typeof event.content === "string" ? event.content : "",
    createdAt: event.created_at,
  };
}

// ---------------------------------------------------------------------------
// 2. Arbiter release decision (kind 30409)
// ---------------------------------------------------------------------------

/**
 * Builds an arbiter's ruling on a held invoice.
 *
 * `buyerPubkey`/`sellerPubkey` become bare `p` tags purely so the parties can
 * find the ruling by filtering `#p` on their own key. They carry no role
 * marker and {@link parseHodlReleaseEvent} deliberately does not return them,
 * because they are author-controlled strings: an event tagging a pubkey as
 * "buyer" is only that author's claim about who the buyer is.
 */
export function createHodlReleaseEventTemplate(params: {
  paymentHash: string;
  decision: HodlReleaseDecision;
  reasoning?: string;
  buyerPubkey?: string;
  sellerPubkey?: string;
  createdAt?: number;
}): EventTemplate {
  const {
    paymentHash,
    decision,
    reasoning = "",
    buyerPubkey,
    sellerPubkey,
    createdAt = Math.floor(Date.now() / 1000),
  } = params;

  const orderId = normalizeOrderId(paymentHash);
  if (!orderId) {
    throw new Error(
      "paymentHash must be 32 bytes of hex (64 characters) to be used as a hodl escrow d tag"
    );
  }
  if (!HODL_RELEASE_DECISIONS.has(decision)) {
    throw new Error(
      `decision must be one of ${Array.from(HODL_RELEASE_DECISIONS).join(", ")}`
    );
  }

  const tags: string[][] = [
    ["d", orderId],
    ["decision", decision],
  ];
  if (buyerPubkey) tags.push(["p", buyerPubkey]);
  if (sellerPubkey) tags.push(["p", sellerPubkey]);

  return {
    kind: HODL_RELEASE_EVENT_KIND,
    tags,
    content: reasoning,
    created_at: createdAt,
  };
}

// Publishes an arbiter ruling. Same relay-only storage tradeoff as
// publishHodlConfirmEvent above.
export async function publishHodlReleaseEvent(params: {
  paymentHash: string;
  decision: HodlReleaseDecision;
  reasoning?: string;
  buyerPubkey?: string;
  sellerPubkey?: string;
  nostr: NostrManager;
  signer: NostrSigner;
}): Promise<void> {
  const {
    paymentHash,
    decision,
    reasoning,
    buyerPubkey,
    sellerPubkey,
    nostr,
    signer,
  } = params;

  const event = createHodlReleaseEventTemplate({
    paymentHash,
    decision,
    ...(reasoning === undefined ? {} : { reasoning }),
    ...(buyerPubkey === undefined ? {} : { buyerPubkey }),
    ...(sellerPubkey === undefined ? {} : { sellerPubkey }),
  });

  await finalizeAndSendNostrEvent(signer, nostr, event, {
    waitForRelayPublish: true,
    requireDurableCache: false,
  });
}

/**
 * Parses a candidate arbiter ruling, or returns null if it is not one.
 *
 * An unrecognized `decision` value is a rejection rather than a default: a
 * ruling that cannot be read unambiguously must not resolve to some fallback
 * direction for the money to travel.
 */
export function parseHodlReleaseEvent(
  event: NostrEvent
): ParsedHodlReleaseEvent | null {
  if (!event || event.kind !== HODL_RELEASE_EVENT_KIND) return null;
  if (typeof event.pubkey !== "string" || event.pubkey.length === 0) {
    return null;
  }
  if (typeof event.created_at !== "number") return null;

  const orderId = normalizeOrderId(getDTag(event));
  if (!orderId) return null;

  const decision = event.tags.find((tag) => tag[0] === "decision")?.[1];
  if (
    !decision ||
    !HODL_RELEASE_DECISIONS.has(decision as HodlReleaseDecision)
  ) {
    return null;
  }

  return {
    orderId,
    decision: decision as HodlReleaseDecision,
    authorPubkey: event.pubkey,
    reasoning: typeof event.content === "string" ? event.content : "",
    createdAt: event.created_at,
  };
}

// ---------------------------------------------------------------------------
// 3. Dispute raised (kind 30410)
// ---------------------------------------------------------------------------

export interface ParsedHodlDisputeEvent {
  /** The `d` tag: the hold invoice's payment hash, lowercased. */
  orderId: string;
  /**
   * The pubkey that signed this event, and nothing more. Same caveat as
   * {@link ParsedHodlConfirmEvent.authorPubkey}: this says only who signed,
   * never whether that key is the order's buyer or seller.
   *
   * There is deliberately no `raisedBy` / `role` field anywhere on this type.
   * Whether the dispute was raised by the buyer or the seller is not encoded
   * in the event at all — the event is one shared kind that either party may
   * publish, with no role tag — and is only ever decided later, by a caller
   * comparing this pubkey against the order's stored `buyer_nostr_pubkey` /
   * `seller_nostr_pubkey`. Adding a role tag here would just hand a forger a
   * free "I am the buyer" claim; do not add one.
   */
  authorPubkey: string;
  /** Free-text description of the issue. May be empty. */
  description: string;
  createdAt: number;
}

/**
 * Builds the "I am disputing this order" event, signed by whoever publishes
 * it — buyer or seller, indistinguishably as far as this function is
 * concerned.
 *
 * `arbiterPubkey` becomes a bare `p` tag purely so the arbiter can discover
 * the dispute by filtering `#p` on their own key, exactly as
 * {@link createHodlReleaseEventTemplate}'s `p` tags exist for discovery and
 * not as evidence. There is no `d`-tag role suffix, no second `p` tag for
 * "who this is against", and no field anywhere naming a buyer or a seller.
 */
export function createHodlDisputeEventTemplate(params: {
  paymentHash: string;
  arbiterPubkey: string;
  description?: string;
  createdAt?: number;
}): EventTemplate {
  const {
    paymentHash,
    arbiterPubkey,
    description = "",
    createdAt = Math.floor(Date.now() / 1000),
  } = params;

  const orderId = normalizeOrderId(paymentHash);
  if (!orderId) {
    throw new Error(
      "paymentHash must be 32 bytes of hex (64 characters) to be used as a hodl escrow d tag"
    );
  }
  if (typeof arbiterPubkey !== "string" || arbiterPubkey.length === 0) {
    throw new Error("arbiterPubkey is required to publish a dispute event");
  }

  return {
    kind: HODL_DISPUTE_EVENT_KIND,
    tags: [
      ["d", orderId],
      ["p", arbiterPubkey],
    ],
    content: description,
    created_at: createdAt,
  };
}

// Publishes a dispute. Same relay-only storage tradeoff as
// publishHodlConfirmEvent above: kind 30410 is not in CACHEABLE_EVENT_KINDS,
// so this waits for the relay publish rather than firing and forgetting.
export async function publishHodlDisputeEvent(params: {
  paymentHash: string;
  arbiterPubkey: string;
  description?: string;
  nostr: NostrManager;
  signer: NostrSigner;
}): Promise<void> {
  const { paymentHash, arbiterPubkey, description, nostr, signer } = params;

  const event = createHodlDisputeEventTemplate({
    paymentHash,
    arbiterPubkey,
    ...(description === undefined ? {} : { description }),
  });

  await finalizeAndSendNostrEvent(signer, nostr, event, {
    waitForRelayPublish: true,
    requireDurableCache: false,
  });
}

/**
 * Parses a candidate dispute event, or returns null if it is not one.
 *
 * Returns `authorPubkey` and never a role-named field, for the same reason
 * documented on {@link ParsedHodlDisputeEvent.authorPubkey}: this answers only
 * "is this a well-formed dispute, and who signed it?", never "was this raised
 * by the buyer or the seller?". Any `p` tags on the raw event — the arbiter
 * tag this module writes, or a forged extra one — are not surfaced here.
 */
export function parseHodlDisputeEvent(
  event: NostrEvent
): ParsedHodlDisputeEvent | null {
  if (!event || event.kind !== HODL_DISPUTE_EVENT_KIND) return null;
  if (typeof event.pubkey !== "string" || event.pubkey.length === 0) {
    return null;
  }
  if (typeof event.created_at !== "number") return null;

  const orderId = normalizeOrderId(getDTag(event));
  if (!orderId) return null;

  return {
    orderId,
    authorPubkey: event.pubkey,
    description: typeof event.content === "string" ? event.content : "",
    createdAt: event.created_at,
  };
}

/**
 * Fetches every well-formed dispute event relays hold for an arbiter.
 *
 * This is read-only discovery for the arbiter's own dashboard, not
 * authorization, and nothing here decides anything about money: the results
 * may include garbage or forged entries — anyone can publish a kind 30410
 * event tagging any arbiter pubkey they like — and it is entirely expected
 * for this to return them without erroring. A caller that wants to act on a
 * dispute must still authorize the party raising it against the order's
 * committed buyer/seller, the same way {@link fetchHodlConfirmEvents}'
 * results require {@link authorizeHodlConfirmEventForOrder} before anything
 * downstream may trust them.
 */
export async function fetchHodlDisputeEvents(params: {
  nostr: NostrManager;
  arbiterPubkey: string;
  timeoutMs?: number;
}): Promise<ParsedHodlDisputeEvent[]> {
  const { nostr, arbiterPubkey, timeoutMs } = params;

  if (typeof arbiterPubkey !== "string" || arbiterPubkey.length === 0) {
    return [];
  }

  const events = await nostr
    .fetch(
      [{ kinds: [HODL_DISPUTE_EVENT_KIND], "#p": [arbiterPubkey] }],
      undefined,
      undefined,
      timeoutMs
    )
    .catch(() => [] as NostrEvent[]);

  const disputes: ParsedHodlDisputeEvent[] = [];
  for (const event of events) {
    if (!verifyEvent(event)) continue;

    const parsed = parseHodlDisputeEvent(event);
    if (!parsed) continue;

    disputes.push(parsed);
  }

  return disputes.sort((a, b) => b.createdAt - a.createdAt);
}

// ---------------------------------------------------------------------------
// 4. Seller-side lookup
// ---------------------------------------------------------------------------

/**
 * Fetches every well-formed confirmation event relays hold for a payment hash.
 *
 * Read-only, and a UI signal only. Finding a match here means "somebody
 * published a confirmation for this order", NOT "the buyer confirmed" — the
 * results are keyed by `authorPubkey` precisely so a caller has to decide for
 * itself which author, if any, it has grounds to believe. Nothing downstream
 * of this function is entitled to settle an invoice on the strength of a
 * non-empty result.
 *
 * Candidates are deduplicated per author (newest wins) rather than collapsed
 * to a single newest-overall event: an unrelated pubkey publishing with a
 * later timestamp would otherwise hide the genuine buyer's event from the
 * caller entirely.
 */
export async function fetchHodlConfirmEvents(params: {
  nostr: NostrManager;
  paymentHash: string;
  timeoutMs?: number;
}): Promise<ParsedHodlConfirmEvent[]> {
  const { nostr, paymentHash, timeoutMs } = params;

  const orderId = normalizeOrderId(paymentHash);
  if (!orderId) return [];

  const events = await nostr
    .fetch(
      [{ kinds: [HODL_CONFIRM_EVENT_KIND], "#d": [orderId] }],
      undefined,
      undefined,
      timeoutMs
    )
    .catch(() => [] as NostrEvent[]);

  const newestByAuthor = new Map<string, ParsedHodlConfirmEvent>();
  for (const event of events) {
    if (!verifyEvent(event)) continue;

    const parsed = parseHodlConfirmEvent(event);
    // Relays are not obliged to honour the filter; re-check the d tag rather
    // than trusting that everything returned belongs to this order.
    if (!parsed || parsed.orderId !== orderId) continue;

    const existing = newestByAuthor.get(parsed.authorPubkey);
    if (!existing || parsed.createdAt > existing.createdAt) {
      newestByAuthor.set(parsed.authorPubkey, parsed);
    }
  }

  return Array.from(newestByAuthor.values()).sort(
    (a, b) => b.createdAt - a.createdAt
  );
}

/**
 * Fetches every well-formed arbiter ruling relays hold for a payment hash.
 *
 * Same read-only, non-authoritative contract as {@link fetchHodlConfirmEvents}:
 * a result here means "somebody published a kind 30409 ruling for this
 * order", not "the arbiter ruled" — anyone can sign one. Callers must run
 * each candidate through {@link authorizeHodlReleaseEventForOrder} before
 * acting on it.
 *
 * Deduplicated per author, newest wins, for the same reason as
 * {@link fetchHodlConfirmEvents}: collapsing to a single newest-overall event
 * would let an unrelated pubkey's later timestamp hide the genuine arbiter's
 * ruling from the caller entirely.
 */
export async function fetchHodlReleaseEvents(params: {
  nostr: NostrManager;
  paymentHash: string;
  timeoutMs?: number;
}): Promise<ParsedHodlReleaseEvent[]> {
  const { nostr, paymentHash, timeoutMs } = params;

  const orderId = normalizeOrderId(paymentHash);
  if (!orderId) return [];

  const events = await nostr
    .fetch(
      [{ kinds: [HODL_RELEASE_EVENT_KIND], "#d": [orderId] }],
      undefined,
      undefined,
      timeoutMs
    )
    .catch(() => [] as NostrEvent[]);

  const newestByAuthor = new Map<string, ParsedHodlReleaseEvent>();
  for (const event of events) {
    if (!verifyEvent(event)) continue;

    const parsed = parseHodlReleaseEvent(event);
    // Relays are not obliged to honour the filter; re-check the d tag rather
    // than trusting that everything returned belongs to this order.
    if (!parsed || parsed.orderId !== orderId) continue;

    const existing = newestByAuthor.get(parsed.authorPubkey);
    if (!existing || parsed.createdAt > existing.createdAt) {
      newestByAuthor.set(parsed.authorPubkey, parsed);
    }
  }

  return Array.from(newestByAuthor.values()).sort(
    (a, b) => b.createdAt - a.createdAt
  );
}
