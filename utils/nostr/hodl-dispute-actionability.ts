import { getHodlEscrowOrderDisputeContext } from "@/utils/db/db-service";
import type { ParsedHodlDisputeEvent } from "@/utils/nostr/hodl-escrow-records";

/**
 * Decides who filed a hodl escrow dispute and whether the arbiter portal
 * should treat it as actionable yet.
 *
 * Same reasoning as server-hodl-escrow-authorization.ts: a dispute event's
 * `authorPubkey` proves only which key signed it, never that the signer is
 * the order's buyer or seller. This module is the one place that compares it
 * against the commitment row to answer "who is this, and can the arbiter act
 * on it right now?" — a display/discovery question, not a money-moving one.
 * It does not authorize a release; resolve-hodl-dispute.ts's
 * authorizeHodlReleaseEventForOrder is unrelated and untouched by this file.
 */

/**
 * How long a seller must wait, after the buyer's payment is accepted, before
 * their own dispute becomes actionable by the arbiter.
 *
 * Per Gautam: holds shouldn't stay open for days, so this is intentionally
 * short rather than modeled on a multi-day chargeback-style window. A seller
 * dispute exists to escalate "the buyer won't confirm receipt", and a buyer
 * who is genuinely unresponsive is unresponsive within hours, not days. Four
 * hours also gives a legitimately slow buyer (asleep, at work) a real window
 * to confirm before the seller can escalate, rather than the two of them
 * racing the instant the HTLC locks.
 */
export const SELLER_DISPUTE_TIMEOUT_SECONDS = 4 * 60 * 60;

export type HodlDisputeActionabilityFailureReason =
  /** No commitment row exists for this payment hash. */
  | "no_such_order"
  /** The event's author is neither the order's buyer nor its seller. */
  | "unknown_disputer"
  /**
   * The disputer is the seller, but the order's payment has never been
   * accepted — there are no held funds yet for an arbiter to release either
   * way, so this is an invalid state rather than a timing one.
   */
  | "no_accepted_at";

/**
 * The only way this module reports failure. Same "throw beats a value a
 * caller can forget to check" reasoning as HodlAuthorizationError.
 */
export class HodlDisputeActionabilityError extends Error {
  readonly reason: HodlDisputeActionabilityFailureReason;
  readonly paymentHash: string;
  /** The key that signed the rejected dispute event, for logging. */
  readonly authorPubkey: string;

  constructor(params: {
    reason: HodlDisputeActionabilityFailureReason;
    paymentHash: string;
    authorPubkey: string;
    message: string;
  }) {
    super(params.message);
    this.name = "HodlDisputeActionabilityError";
    this.reason = params.reason;
    this.paymentHash = params.paymentHash;
    this.authorPubkey = params.authorPubkey;
  }
}

export type HodlDisputeActionability = {
  role: "buyer" | "seller";
  actionable: boolean;
  /** Present only when role is "seller" and actionable is false. */
  remainingSeconds?: number;
};

// Hex case is not identity, same as server-hodl-escrow-authorization.ts's
// pubkeysMatch. Shape is checked too, so a degenerate empty-string match can
// never pass.
const NOSTR_PUBKEY_HEX = /^[0-9a-f]{64}$/i;

function pubkeysMatch(author: string, committed: string): boolean {
  if (!NOSTR_PUBKEY_HEX.test(author) || !NOSTR_PUBKEY_HEX.test(committed)) {
    return false;
  }
  return author.toLowerCase() === committed.toLowerCase();
}

/**
 * Evaluates whether a dispute event is actionable by the arbiter right now.
 *
 * Buyer disputes are always actionable: a buyer disputing means "I paid and
 * something is wrong", and there is no waiting period attached to that claim.
 * Seller disputes exist to escalate buyer non-responsiveness, so they only
 * become actionable once {@link SELLER_DISPUTE_TIMEOUT_SECONDS} has elapsed
 * since the buyer's payment was accepted — "too early" is a legitimate,
 * displayable state (`actionable: false` with `remainingSeconds`), not an
 * error.
 *
 * @param nowSeconds defaults to the current time; overridable for
 * deterministic tests, same pattern as isMcpRequestProofFresh.
 * @throws {HodlDisputeActionabilityError} for `no_such_order`,
 * `unknown_disputer`, or `no_accepted_at` — none of which are timing states,
 * all of which mean the event does not belong to a legitimate party or a
 * legitimate moment in the order's lifecycle.
 */
export async function evaluateHodlDisputeActionability(
  paymentHash: string,
  event: ParsedHodlDisputeEvent,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<HodlDisputeActionability> {
  const normalizedHash = paymentHash.toLowerCase();

  const order = await getHodlEscrowOrderDisputeContext(normalizedHash);
  if (!order) {
    throw new HodlDisputeActionabilityError({
      reason: "no_such_order",
      paymentHash: normalizedHash,
      authorPubkey: event.authorPubkey,
      message: `No hodl escrow commitment exists for order ${normalizedHash}`,
    });
  }

  let role: "buyer" | "seller";
  if (pubkeysMatch(event.authorPubkey, order.buyerNostrPubkey)) {
    role = "buyer";
  } else if (pubkeysMatch(event.authorPubkey, order.sellerNostrPubkey)) {
    role = "seller";
  } else {
    throw new HodlDisputeActionabilityError({
      reason: "unknown_disputer",
      paymentHash: normalizedHash,
      authorPubkey: event.authorPubkey,
      message: `Dispute event for order ${normalizedHash} was not signed by either party to the order`,
    });
  }

  if (role === "buyer") {
    return { role: "buyer", actionable: true };
  }

  if (!order.acceptedAt) {
    throw new HodlDisputeActionabilityError({
      reason: "no_accepted_at",
      paymentHash: normalizedHash,
      authorPubkey: event.authorPubkey,
      message: `Seller dispute for order ${normalizedHash} was filed before the buyer's payment was ever accepted`,
    });
  }

  // Epoch-vs-epoch on both sides: getTime() is UTC milliseconds and
  // nowSeconds derives from Date.now(), so no zone enters the subtraction.
  // That holds only while accepted_at is TIMESTAMPTZ — as a plain TIMESTAMP
  // the Date arriving here is already shifted by the reading process's UTC
  // offset, and this arithmetic would faithfully compare a wrong instant.
  const acceptedAtSeconds = Math.floor(order.acceptedAt.getTime() / 1000);
  const elapsedSeconds = nowSeconds - acceptedAtSeconds;

  if (elapsedSeconds >= SELLER_DISPUTE_TIMEOUT_SECONDS) {
    return { role: "seller", actionable: true };
  }

  return {
    role: "seller",
    actionable: false,
    remainingSeconds: Math.max(
      0,
      SELLER_DISPUTE_TIMEOUT_SECONDS - elapsedSeconds
    ),
  };
}
