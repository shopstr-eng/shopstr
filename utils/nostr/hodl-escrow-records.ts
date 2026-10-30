import type { EventTemplate } from "nostr-tools";
import { verifyEvent } from "nostr-tools";
import {
  NostrManager,
  type NostrEvent,
  type NostrFilter,
} from "@/utils/nostr/nostr-manager";
import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { finalizeAndSendNostrEvent } from "@/utils/nostr/nostr-helper-functions";
import { sendGiftWrappedMessageEvent } from "@/utils/nostr/gift-wrap";
import {
  HODL_ESCROW_GIFT_WRAP_KIND,
  MAX_GIFT_WRAP_CANDIDATES,
  unwrapHodlEscrowRumors,
  wrapHodlEscrowRumor,
  type GiftWrapDecryptor,
} from "@/utils/nostr/hodl-escrow-gift-wrap";

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
// Relay read failures
// ---------------------------------------------------------------------------

/**
 * Why a relay read could not be completed.
 *
 * A single-member union rather than a bare string, mirroring
 * `HodlAuthorizationFailureReason` in
 * utils/nostr/server-hodl-escrow-authorization.ts: a caller branching on
 * `reason` keeps compiling — and keeps failing exhaustiveness checks in the
 * right places — when a second failure mode is added here later.
 */
export type HodlRelayFailureReason = "relay_connection_failure";

/**
 * Raised when relays could not be reached at all, as distinct from relays
 * answering with no matching events.
 *
 * The distinction is the whole point of this class. "Nobody published a
 * confirmation for this order" and "we could not ask" are indistinguishable
 * once both collapse to an empty array, and the endpoints downstream turn the
 * former into a 403: a caller that could not be checked would be told it was
 * checked and refused. Fetches therefore throw this rather than returning
 * `[]`, so the endpoint can answer "retry" instead of "denied".
 *
 * Thrown, not returned, for the same reason
 * {@link HodlAuthorizationError} throws: a caller that forgets to inspect a
 * returned value still proceeds to authorize against a list it never
 * populated, whereas a caller that forgets to catch does not.
 */
export class HodlRelayUnavailableError extends Error {
  readonly reason: HodlRelayFailureReason;

  constructor(params: { reason: HodlRelayFailureReason; message: string }) {
    super(params.message);
    this.name = "HodlRelayUnavailableError";
    this.reason = params.reason;
  }
}

/**
 * Runs one relay query, converting a failed read into
 * {@link HodlRelayUnavailableError}.
 *
 * `description` names the lookup and nothing else. No pubkey, payment hash, or
 * filter contents go into the message: these strings reach server logs, and
 * the escrow endpoints' `describeFailure` treats any 64-hex run that is not
 * the request's own payment hash as a secret to redact — so an interpolated
 * identifier would arrive as `[redacted]` and buy nothing anyway.
 *
 */
async function fetchHodlEvents(params: {
  nostr: NostrManager;
  filter: NostrFilter;
  timeoutMs?: number;
  description: string;
}): Promise<NostrEvent[]> {
  const { nostr, filter, timeoutMs, description } = params;

  try {
    const result = await nostr.fetchWithStatus(
      [filter],
      undefined,
      undefined,
      timeoutMs
    );
    if (!result.complete) throw new Error("Incomplete relay lookup");
    return result.events;
  } catch {
    // The underlying error is deliberately not chained on: it comes from relay
    // transport code that has no contract about what it puts in a message, and
    // this one travels into logs.
    throw new HodlRelayUnavailableError({
      reason: "relay_connection_failure",
      message: `Could not reach relays to ${description}`,
    });
  }
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
 * republishing under the same `d` tag can only re-assert the confirmation,
 * never retract it into some "unconfirmed" state.
 *
 * The content is always empty, and there is no parameter that could fill it.
 * This event is world-readable — it has to be, because settle-hodl-invoice.ts
 * reads it off relays and authorizes it against the order's committed buyer —
 * so anything written here is published in the clear next to the payment hash
 * and the buyer's own pubkey. Nothing about a confirmation needs saying in
 * public; the settle path reads the `d` tag and the signature and nothing
 * else. A note that a buyer genuinely wants the seller to see belongs in the
 * gift-wrapped order DM thread the two of them already share.
 */
export function createHodlConfirmEventTemplate(params: {
  paymentHash: string;
  createdAt?: number;
}): EventTemplate {
  const { paymentHash, createdAt = Math.floor(Date.now() / 1000) } = params;

  const orderId = normalizeOrderId(paymentHash);
  if (!orderId) {
    throw new Error(
      "paymentHash must be 32 bytes of hex (64 characters) to be used as a hodl escrow d tag"
    );
  }

  return {
    kind: HODL_CONFIRM_EVENT_KIND,
    tags: [["d", orderId]],
    content: "",
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
  nostr: NostrManager;
  signer: NostrSigner;
}): Promise<void> {
  const { paymentHash, nostr, signer } = params;

  const event = createHodlConfirmEventTemplate({ paymentHash });

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
 *
 * The content is always empty, and there is no parameter that could fill it.
 * Like the confirmation, this event has to stay world-readable so
 * resolve-hodl-dispute.ts can authorize it against the order's committed
 * arbiter — which means free-text reasoning written here would publish the
 * arbiter's account of somebody's dispute in the clear, next to the payment
 * hash and both parties' pubkeys. The `decision` tag is the whole of what the
 * server needs, and it is the whole of what this event says.
 */
export function createHodlReleaseEventTemplate(params: {
  paymentHash: string;
  decision: HodlReleaseDecision;
  buyerPubkey?: string;
  sellerPubkey?: string;
  createdAt?: number;
}): EventTemplate {
  const {
    paymentHash,
    decision,
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
    content: "",
    created_at: createdAt,
  };
}

// Publishes an arbiter ruling. Same relay-only storage tradeoff as
// publishHodlConfirmEvent above.
export async function publishHodlReleaseEvent(params: {
  paymentHash: string;
  decision: HodlReleaseDecision;
  buyerPubkey?: string;
  sellerPubkey?: string;
  nostr: NostrManager;
  signer: NostrSigner;
}): Promise<void> {
  const { paymentHash, decision, buyerPubkey, sellerPubkey, nostr, signer } =
    params;

  const event = createHodlReleaseEventTemplate({
    paymentHash,
    decision,
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

/**
 * Publishes a dispute as a NIP-59 gift wrap addressed to the arbiter.
 *
 * The kind 30410 built above is never signed and never published in the
 * clear. It becomes the *rumor* inside a kind 13 seal inside a kind 1059
 * wrap, so what reaches relays is one event from a throwaway key with a `p`
 * tag for the arbiter and an opaque NIP-44 blob. The payment hash, the
 * disputing party's identity and the free-text reason are all inside that
 * blob.
 *
 * That matters because the plaintext version was a permanent public record
 * that a specific pubkey was fighting over a specific hold invoice. Both
 * halves of that are linkable: the payment hash is on the buyer's and
 * seller's own order DM, and the author pubkey is their Nostr identity. The
 * only parties who need to read a dispute are the arbiter — who is the
 * recipient — and the resolve endpoint, which reads it with the arbiter's own
 * key (see server-hodl-arbiter-decryptor.ts). Nobody else has any business
 * knowing the order was disputed at all.
 *
 * The seal is signed with the disputer's real identity key, so unwrapping
 * yields a pubkey backed by a signature rather than a bare claim. That is the
 * same standard of proof the public event's own signature gave, and it is
 * still only a starting point: evaluateHodlDisputeActionability decides
 * whether that key is a party to the order, and this function is not a
 * substitute for it.
 *
 * Unlike the confirm and release publishes, this one requires a durable
 * cache: kind 1059 IS in CACHEABLE_EVENT_KINDS, so a wrap that misses relays
 * is still recoverable, and a dispute is the one message in this flow whose
 * loss cannot be retried by anyone but the person who raised it.
 */
export async function publishHodlDisputeEvent(params: {
  paymentHash: string;
  arbiterPubkey: string;
  disputerPubkey: string;
  description?: string;
  nostr: NostrManager;
  signer: NostrSigner;
}): Promise<void> {
  const {
    paymentHash,
    arbiterPubkey,
    disputerPubkey,
    description,
    nostr,
    signer,
  } = params;

  if (typeof disputerPubkey !== "string" || disputerPubkey.length === 0) {
    throw new Error("disputerPubkey is required to publish a dispute event");
  }

  const template = createHodlDisputeEventTemplate({
    paymentHash,
    arbiterPubkey,
    ...(description === undefined ? {} : { description }),
  });

  const giftWrap = await wrapHodlEscrowRumor({
    template,
    authorPubkey: disputerPubkey,
    recipientPubkey: arbiterPubkey,
    signer,
  });

  await sendGiftWrappedMessageEvent(nostr, giftWrap, signer, {
    waitForRelayPublish: true,
    requireDurableCache: true,
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
 * Fetches every well-formed dispute rumor relays hold for an arbiter, by
 * unwrapping the gift wraps addressed to them.
 *
 * `decryptor` is a required parameter with no default, and that is the point:
 * disputes are NIP-59 wraps now, so a caller that cannot decrypt them cannot
 * read them, and there is no code path that quietly falls back to reading a
 * plaintext dispute off a relay. The arbiter's browser passes its signer; the
 * resolve endpoint passes an adapter over ARBITER_NOSTR_PRIVKEY.
 *
 * This is read-only discovery, not authorization, and nothing here decides
 * anything about money. Decrypting a wrap proves only that it was addressed
 * to this key, and the seal signature proves only who sealed it — anyone may
 * gift wrap a dispute rumor to the arbiter for any payment hash they have
 * seen, and it is entirely expected for this to return such entries without
 * erroring. A caller that wants to act on a dispute must still put the
 * author through {@link evaluateHodlDisputeActionability} against the order's
 * committed buyer/seller, exactly as before.
 *
 * @throws {HodlRelayUnavailableError} when relays could not be reached. An
 * empty array means relays answered and held nothing.
 */
export async function fetchHodlDisputeEvents(params: {
  nostr: NostrManager;
  arbiterPubkey: string;
  decryptor: GiftWrapDecryptor;
  timeoutMs?: number;
}): Promise<ParsedHodlDisputeEvent[]> {
  const { nostr, arbiterPubkey, decryptor, timeoutMs } = params;

  if (typeof arbiterPubkey !== "string" || arbiterPubkey.length === 0) {
    return [];
  }

  // Page backwards; unrelated recent messages must not hide an older dispute.
  // Keep the boundary second in the next page because timestamps are not unique.
  const rumors: NostrEvent[] = [];
  const seen = new Set<string>();
  let until: number | undefined;
  let limit = MAX_GIFT_WRAP_CANDIDATES;
  const deadline = Date.now() + (timeoutMs ?? 30_000);
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0 || seen.size > 10_000) {
      throw new HodlRelayUnavailableError({
        reason: "relay_connection_failure",
        message: "Dispute lookup could not be completed. Please retry.",
      });
    }
    const events = await fetchHodlEvents({
      nostr,
      filter: {
        kinds: [HODL_ESCROW_GIFT_WRAP_KIND],
        "#p": [arbiterPubkey],
        limit,
        ...(until === undefined ? {} : { until }),
      },
      timeoutMs: remaining,
      description: "look up disputes for this arbiter",
    });
    const fresh = events.filter((event) => !seen.has(event.id));
    for (const event of fresh) seen.add(event.id);
    rumors.push(
      ...(await unwrapHodlEscrowRumors({
        events: fresh,
        recipientPubkey: arbiterPubkey,
        decryptor,
        maxCandidates: fresh.length,
      }))
    );
    if (events.length < limit) break;
    const oldest = Math.min(...events.map((event) => event.created_at));
    if (!Number.isFinite(oldest) || (until !== undefined && oldest > until)) {
      throw new HodlRelayUnavailableError({
        reason: "relay_connection_failure",
        message: "Relay returned an invalid dispute page",
      });
    }
    if (oldest === until || fresh.length === 0) {
      if (limit >= 10_000)
        throw new HodlRelayUnavailableError({
          reason: "relay_connection_failure",
          message: "Relay dispute page is too large",
        });
      limit *= 2;
    } else {
      until = oldest;
      limit = MAX_GIFT_WRAP_CANDIDATES;
    }
  }

  const disputes: ParsedHodlDisputeEvent[] = [];
  for (const rumor of rumors) {
    // No verifyEvent here, and none is missing: a rumor is unsigned by
    // design. Its author was established by the seal signature that
    // unwrapHodlEscrowRumors verified, plus the rumor.pubkey === seal.pubkey
    // check that binds the two together.
    const parsed = parseHodlDisputeEvent(rumor);
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
 *
 * @throws {HodlRelayUnavailableError} when relays could not be reached. An
 * empty array therefore means relays answered and held no confirmation — the
 * one reading on which a caller may go on to refuse a settlement.
 */
export async function fetchHodlConfirmEvents(params: {
  nostr: NostrManager;
  paymentHash: string;
  timeoutMs?: number;
}): Promise<ParsedHodlConfirmEvent[]> {
  const { nostr, paymentHash, timeoutMs } = params;

  const orderId = normalizeOrderId(paymentHash);
  if (!orderId) return [];

  const events = await fetchHodlEvents({
    nostr,
    filter: { kinds: [HODL_CONFIRM_EVENT_KIND], "#d": [orderId] },
    timeoutMs,
    description: "look up buyer confirmations for this order",
  });

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
 *
 * @throws {HodlRelayUnavailableError} when relays could not be reached. An
 * empty array therefore means relays answered and held no ruling — the one
 * reading on which a caller may go on to refuse a resolution.
 */
export async function fetchHodlReleaseEvents(params: {
  nostr: NostrManager;
  paymentHash: string;
  timeoutMs?: number;
}): Promise<ParsedHodlReleaseEvent[]> {
  const { nostr, paymentHash, timeoutMs } = params;

  const orderId = normalizeOrderId(paymentHash);
  if (!orderId) return [];

  const events = await fetchHodlEvents({
    nostr,
    filter: { kinds: [HODL_RELEASE_EVENT_KIND], "#d": [orderId] },
    timeoutMs,
    description: "look up arbiter rulings for this order",
  });

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
