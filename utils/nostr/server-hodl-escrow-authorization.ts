import { getHodlEscrowOrderParties } from "@/utils/db/db-service";
import type {
  HodlReleaseDecision,
  ParsedHodlConfirmEvent,
  ParsedHodlReleaseEvent,
} from "@/utils/nostr/hodl-escrow-records";

/**
 * Decides whether a parsed hodl escrow event was signed by the party the order
 * was committed to, and refuses by throwing when it was not.
 *
 * A signature proves only which key signed an event. Anyone can generate a
 * keypair and publish a well-formed confirmation for any payment hash they
 * have seen, so "a valid confirm event exists for this order" is not an answer
 * to "did the buyer confirm?". The only thing that separates the two is the
 * commitment row, written server-side at order creation before any such event
 * could exist. These functions are the one place that comparison happens.
 *
 * Server-only: it reads the commitment table. Nothing in a browser bundle may
 * import this module.
 */

// Hex case is not identity — the same 32 bytes can arrive as either case — so
// comparison lowercases both sides. Shape is checked too, so that a degenerate
// value (an empty string on both sides, say) can never compare equal and pass
// for a match.
const NOSTR_PUBKEY_HEX = /^[0-9a-f]{64}$/i;

export type HodlAuthorizationFailureReason =
  /** No commitment row exists for this payment hash. */
  | "no_such_order"
  /** The event is about a different order than the one being authorized. */
  | "order_mismatch"
  /** The event's author is not the party this order committed to. */
  | "pubkey_mismatch";

/**
 * The only way these functions report failure.
 *
 * Deliberately not a `false`/`null`/`{ authorized: boolean }` return: a caller
 * that forgets to check a returned value still proceeds to settle, whereas a
 * caller that forgets to catch a throw does not. The failure mode of the
 * mistake is what makes it safe, not the diligence of the caller.
 */
export class HodlAuthorizationError extends Error {
  readonly reason: HodlAuthorizationFailureReason;
  readonly paymentHash: string;
  /** The key that signed the rejected event, for logging. */
  readonly authorPubkey: string;

  constructor(params: {
    reason: HodlAuthorizationFailureReason;
    paymentHash: string;
    authorPubkey: string;
    message: string;
  }) {
    super(params.message);
    this.name = "HodlAuthorizationError";
    this.reason = params.reason;
    this.paymentHash = params.paymentHash;
    this.authorPubkey = params.authorPubkey;
  }
}

// Brands. The symbols are declared, never exported and never assigned, so no
// code outside this module can build a value of these types by hand — the only
// way to hold one is to have called an authorize function that returned
// normally. That turns "settle without authorizing" from a review miss into a
// compile error, once the settle path takes these types as its parameters.
declare const authorizedHodlConfirmation: unique symbol;
declare const authorizedHodlRelease: unique symbol;

/**
 * A buyer confirmation that has been matched against its order's committed
 * buyer. The parties are carried through from the commitment row rather than
 * from the event, so a later step reads them from the database's answer and
 * never from author-controlled tags.
 */
export type AuthorizedHodlConfirmation = {
  readonly [authorizedHodlConfirmation]: true;
  readonly paymentHash: string;
  readonly buyerNostrPubkey: string;
  readonly sellerNostrPubkey: string;
  readonly arbiterNostrPubkey: string;
  readonly confirmedAt: number;
};

/** An arbiter ruling that has been matched against its order's arbiter. */
export type AuthorizedHodlRelease = {
  readonly [authorizedHodlRelease]: true;
  readonly paymentHash: string;
  readonly decision: HodlReleaseDecision;
  readonly buyerNostrPubkey: string;
  readonly sellerNostrPubkey: string;
  readonly arbiterNostrPubkey: string;
  readonly decidedAt: number;
};

function pubkeysMatch(author: string, committed: string): boolean {
  if (!NOSTR_PUBKEY_HEX.test(author) || !NOSTR_PUBKEY_HEX.test(committed)) {
    return false;
  }
  return author.toLowerCase() === committed.toLowerCase();
}

/**
 * Shared prelude: normalizes the payment hash, checks the event is actually
 * about that order, and loads the commitment.
 *
 * The order check is not redundant with the pubkey check that follows it.
 * Authorizing order A's event against order B's row would compare the right
 * signature against the wrong commitment, and where the same person is buyer
 * on both, it would pass — releasing B's money on a confirmation that was only
 * ever given for A.
 */
async function loadCommittedParties(
  paymentHash: string,
  event: { orderId: string; authorPubkey: string }
) {
  const orderId = paymentHash.toLowerCase();

  if (event.orderId !== orderId) {
    throw new HodlAuthorizationError({
      reason: "order_mismatch",
      paymentHash: orderId,
      authorPubkey: event.authorPubkey,
      message: `Hodl escrow event is for order ${event.orderId}, not ${orderId}`,
    });
  }

  const order = await getHodlEscrowOrderParties(orderId);
  if (!order) {
    throw new HodlAuthorizationError({
      reason: "no_such_order",
      paymentHash: orderId,
      authorPubkey: event.authorPubkey,
      message: `No hodl escrow commitment exists for order ${orderId}`,
    });
  }

  return { orderId, order };
}

/**
 * Authorizes a buyer confirmation against the buyer committed at order
 * creation, or throws {@link HodlAuthorizationError}.
 *
 * The anchor is the row's `buyer_nostr_pubkey`, which was written from the
 * NIP-98-authenticated identity at checkout. There is no parameter for it, so
 * a caller cannot supply, default, or omit the value being compared against.
 */
export async function authorizeHodlConfirmEventForOrder(
  paymentHash: string,
  event: ParsedHodlConfirmEvent
): Promise<AuthorizedHodlConfirmation> {
  const { orderId, order } = await loadCommittedParties(paymentHash, event);

  if (!pubkeysMatch(event.authorPubkey, order.buyerNostrPubkey)) {
    // The expected pubkey stays out of the message: which key bought a given
    // order is not something a failed attempt is entitled to learn.
    throw new HodlAuthorizationError({
      reason: "pubkey_mismatch",
      paymentHash: orderId,
      authorPubkey: event.authorPubkey,
      message: `Hodl confirm event for order ${orderId} was not signed by the order's buyer`,
    });
  }

  return {
    paymentHash: orderId,
    buyerNostrPubkey: order.buyerNostrPubkey,
    sellerNostrPubkey: order.sellerNostrPubkey,
    arbiterNostrPubkey: order.arbiterNostrPubkey,
    confirmedAt: event.createdAt,
  } as AuthorizedHodlConfirmation;
}

/**
 * Authorizes an arbiter ruling against the arbiter committed at order
 * creation, or throws {@link HodlAuthorizationError}.
 *
 * Anchored on the row's `arbiter_nostr_pubkey` rather than on the current
 * ARBITER_NOSTR_PUBKEY value. The column was written from that env var when
 * the order was created, and pinning it to the row means rotating the
 * configured arbiter cannot hand a new key authority over money that was
 * escrowed under the old one.
 */
export async function authorizeHodlReleaseEventForOrder(
  paymentHash: string,
  event: ParsedHodlReleaseEvent
): Promise<AuthorizedHodlRelease> {
  const { orderId, order } = await loadCommittedParties(paymentHash, event);

  if (!pubkeysMatch(event.authorPubkey, order.arbiterNostrPubkey)) {
    throw new HodlAuthorizationError({
      reason: "pubkey_mismatch",
      paymentHash: orderId,
      authorPubkey: event.authorPubkey,
      message: `Hodl release event for order ${orderId} was not signed by the order's arbiter`,
    });
  }

  return {
    paymentHash: orderId,
    // Carried from the authorized event so the settle path branches on a
    // ruling that has been checked, not on a raw parse result.
    decision: event.decision,
    buyerNostrPubkey: order.buyerNostrPubkey,
    sellerNostrPubkey: order.sellerNostrPubkey,
    arbiterNostrPubkey: order.arbiterNostrPubkey,
    decidedAt: event.createdAt,
  } as AuthorizedHodlRelease;
}
