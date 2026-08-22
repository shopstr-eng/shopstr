import { Invoice, LightningAddress } from "@getalby/lightning-tools";
import { verifyEvent } from "nostr-tools";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { getDefaultRelays, withBlastr } from "@/utils/nostr/relay-config";
import {
  getLndPaymentClient,
  LndPaymentConfigError,
} from "@/utils/lightning/lnd-payment-client";
import {
  claimHodlEscrowPayoutAttempt,
  discardHodlEscrowPayoutInvoice,
  getHodlEscrowPayoutOrderContext,
  markHodlEscrowPayoutAbandoned,
  markHodlEscrowPayoutFailed,
  markHodlEscrowPayoutPaid,
  recordHodlEscrowPayoutError,
  recordHodlEscrowPayoutInvoice,
} from "@/utils/db/db-service";

/**
 * The second leg of a hold-invoice escrow: getting the settled funds to the
 * seller.
 *
 * Settling a hold invoice releases the buyer's HTLC into the arbiter's own
 * node. The seller is not paid by that — they are owed by it. This module
 * closes the gap: it fetches a fresh invoice from the seller's saved
 * Lightning address, records it, and pays it.
 *
 * Everything here is shaped by one hazard. A payout runs across two systems
 * that fail independently, and the failure that matters is not "the seller
 * was not paid" — a retry fixes that — but "the seller was paid twice", which
 * comes out of platform funds and no retry fixes. So:
 *
 *  1. The invoice is written to the database BEFORE it is paid. A crash
 *     between the two then leaves a record naming exactly the invoice that
 *     might have been paid.
 *  2. Every retry that finds a stored invoice asks that invoice's own verify
 *     endpoint what happened to it. Never its age, never its expiry, never
 *     how long ago the attempt was — an invoice can be both old and genuinely
 *     paid, and treating "old" as "unpaid" is how the double payment happens.
 *  3. "I could not find out" is a third answer, kept distinct from both
 *     "paid" and "unpaid", and it stops the payout rather than resolving it
 *     either way. A payout that cannot be verified waits for a later check.
 *
 * The bounded-retry rule follows from the same place: rather than retry
 * forever in silence, a payout that has burned through
 * {@link MAX_HODL_SELLER_PAYOUT_ATTEMPTS} is marked `abandoned`, which is a
 * state `listHodlEscrowPayoutsNeedingAttention` can find. The money is still
 * owed; what stops is the unattended attempt to send it.
 */

/**
 * How many attempts a payout gets before it is handed to a human.
 *
 * Bounded on purpose. An unbounded retry is indistinguishable, from the
 * outside, from a payout quietly never happening.
 */
export const MAX_HODL_SELLER_PAYOUT_ATTEMPTS = 5;

/** How long to wait on relays for a seller's profile. */
const PROFILE_RELAY_TIMEOUT_MS = 10_000;

/** What a stored payout invoice's real, current state turned out to be. */
export type PayoutInvoiceStatus =
  /** Confirmed paid by the invoice's own verify endpoint. */
  | "paid"
  /** Confirmed never paid AND no longer payable. Safe to replace. */
  | "dead"
  /** Not determinable right now. Not a verdict; do not act on it. */
  | "unknown";

/**
 * Raised by `payPayoutInvoice` before anything was dialled out — the LND
 * payment client itself is not configured (`LND_PAYMENT_MACAROON_HEX` and
 * friends missing or malformed; see
 * {@link file://./lnd-payment-client.ts}'s `LndPaymentConfigError`).
 *
 * Distinct from an ordinary send failure because it is a certainty rather
 * than an ambiguity: nothing was sent, so the payout may be recorded as
 * `failed` and retried, instead of being left `pending` pending verification.
 */
export class HodlSellerPayoutPayerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HodlSellerPayoutPayerUnavailableError";
  }
}

/** The four outside-world operations a payout needs, as one injectable set. */
export interface HodlSellerPayoutDependencies {
  /** The seller's saved Lightning address, or null if they have none. */
  resolveLightningAddress(sellerNostrPubkey: string): Promise<string | null>;
  /** Fetches a fresh invoice from that address. */
  requestPayoutInvoice(params: {
    lightningAddress: string;
    amountSats: number;
    comment?: string;
  }): Promise<{
    paymentRequest: string;
    verifyUrl: string | null;
    amountSats: number;
  }>;
  /** Asks a stored invoice what actually happened to it. */
  checkPayoutInvoiceStatus(params: {
    paymentRequest: string;
    verifyUrl: string | null;
  }): Promise<PayoutInvoiceStatus>;
  /** Sends the payment. */
  payPayoutInvoice(params: {
    paymentRequest: string;
    amountSats: number;
  }): Promise<void>;
}

/**
 * The minimum a payout invoice has to offer for its status to be decidable.
 * Matches `@getalby/lightning-tools`' `Invoice`, narrowed so the rule below
 * can be reasoned about — and tested — without a network.
 */
export interface VerifiablePayoutInvoice {
  /** LUD-21 verify URL, or null when the payee's provider offers none. */
  verify: string | null;
  verifyPayment(): Promise<boolean>;
  hasExpired(): boolean;
}

/**
 * Decides what a stored payout invoice's real state is.
 *
 * The one rule this whole module rests on: an invoice is only ever declared
 * dead when its own verify endpoint says it was not paid AND it can no longer
 * be paid. Every other combination is either `paid` or `unknown`.
 *
 * In particular:
 *
 *  - Expiry alone proves nothing and never produces `dead` on its own. An
 *    invoice can be long expired and have been genuinely paid before it
 *    expired; treating age as evidence of non-payment is precisely the bug
 *    that pays a seller twice.
 *  - An unpaid invoice that has NOT expired is `unknown`, not `dead`: a
 *    payment may be in flight against it right now.
 *  - No verify URL means the question cannot be asked at all, so the answer
 *    is `unknown` forever. That payout waits for a human rather than risking
 *    a second payment — which is the right trade when the alternative is
 *    guessing with someone else's money.
 *  - A verify call that throws is a failure to ask, not an answer.
 */
export async function resolvePayoutInvoiceStatus(
  invoice: VerifiablePayoutInvoice
): Promise<PayoutInvoiceStatus> {
  if (!invoice.verify) return "unknown";

  let paid: boolean;
  try {
    paid = await invoice.verifyPayment();
  } catch {
    return "unknown";
  }

  if (paid) return "paid";
  return invoice.hasExpired() ? "dead" : "unknown";
}

/**
 * Reads a seller's saved Lightning address from their Nostr profile.
 *
 * Same source the plain-Lightning checkout flow uses — kind 0 content's
 * `lud16` — read server-side here rather than taken from a request, because
 * this decides where money goes.
 *
 * Events are signature-verified and re-checked against the author filter:
 * relays are not obliged to honour a filter, and an unverified kind 0 claiming
 * to be the seller's would be an address anybody could nominate.
 */
async function fetchSellerLightningAddress(
  sellerNostrPubkey: string
): Promise<string | null> {
  const nostr = new NostrManager(withBlastr(getDefaultRelays()), {
    connectionTimeout: 10_000,
    keepAliveTime: 60_000,
    gcInterval: 60_000,
  });

  try {
    const events = await nostr.fetch(
      [{ kinds: [0], authors: [sellerNostrPubkey] }],
      undefined,
      undefined,
      PROFILE_RELAY_TIMEOUT_MS
    );

    const newest = events
      .filter(
        (event) => event.pubkey === sellerNostrPubkey && verifyEvent(event)
      )
      .sort((a, b) => b.created_at - a.created_at)[0];
    if (!newest) return null;

    let content: unknown;
    try {
      content = JSON.parse(newest.content);
    } catch {
      return null;
    }
    if (typeof content !== "object" || content === null) return null;

    const { lud16, lnurl } = content as { lud16?: unknown; lnurl?: unknown };
    const address = typeof lud16 === "string" ? lud16 : lnurl;
    if (typeof address !== "string") return null;

    const trimmed = address.trim();
    // An address, not an LNURL bech32 blob: `requestInvoice` below is the
    // LightningAddress path, and handing it something else fails opaquely.
    return trimmed.includes("@") ? trimmed.toLowerCase() : null;
  } finally {
    nostr.close();
  }
}

/**
 * The same mechanism the plain-Lightning checkout in product-invoice-card.tsx
 * uses to pay a seller: `LightningAddress` + `requestInvoice`.
 *
 * `verify` is carried out alongside the payment request because it is the
 * only thing that can answer, later, whether this invoice was paid. Not every
 * LNURL provider supplies one; when it is absent the payout is knowingly
 * unverifiable, which the caller records rather than papers over.
 */
async function requestInvoiceFromLightningAddress(params: {
  lightningAddress: string;
  amountSats: number;
  comment?: string;
}): Promise<{
  paymentRequest: string;
  verifyUrl: string | null;
  amountSats: number;
}> {
  const ln = new LightningAddress(params.lightningAddress);
  await ln.fetch();
  const invoice = await ln.requestInvoice({
    satoshi: params.amountSats,
    comment: params.comment,
  });

  return {
    paymentRequest: invoice.paymentRequest,
    verifyUrl: invoice.verify ?? null,
    amountSats: invoice.satoshi,
  };
}

async function checkStoredInvoiceStatus(params: {
  paymentRequest: string;
  verifyUrl: string | null;
}): Promise<PayoutInvoiceStatus> {
  const invoice = new Invoice({
    pr: params.paymentRequest,
    verify: params.verifyUrl ?? undefined,
  });
  return resolvePayoutInvoiceStatus(invoice);
}

/**
 * Fee ceiling passed to `SendPaymentV2` as `fee_limit_sat`, as a fraction of
 * the amount being forwarded.
 *
 * Routing a payout to an LNURL provider is typically one or two hops from a
 * well-peered node, where real-world fees run well under 1%. A 1% ceiling
 * comfortably covers that without leaving the fee unbounded — an unbounded
 * limit is how a bad route quietly eats into what the seller is owed. The
 * floor keeps a small payout (a few hundred sats) from getting a 0-sat limit,
 * which LND would reject as unroutable before any route was even tried.
 */
const PAYOUT_FEE_LIMIT_FRACTION = 0.01;
const MIN_PAYOUT_FEE_LIMIT_SATS = 10;

function payoutFeeLimitSats(amountSats: number): number {
  return Math.max(
    MIN_PAYOUT_FEE_LIMIT_SATS,
    Math.ceil(amountSats * PAYOUT_FEE_LIMIT_FRACTION)
  );
}

/**
 * Sends a payout over LND via {@link file://./lnd-payment-client.ts}.
 *
 * Three outcomes from `sendPayment`, handled three different ways:
 *
 *  - `succeeded` resolves normally.
 *  - `failed` and `unknown` both throw a plain `Error`. Neither is treated as
 *    the certainty {@link HodlSellerPayoutPayerUnavailableError} represents —
 *    a real send was dialled out, so `payoutToSeller` must leave the row
 *    `pending` with its invoice rather than mark it `failed`. The next
 *    attempt's `checkPayoutInvoiceStatus` — the LNURL provider's own verify
 *    endpoint, unrelated to LND — is what actually decides whether the
 *    invoice is paid, dead, or still unknown; this function does not get to
 *    pre-empt that by guessing from the send outcome alone.
 *  - An {@link LndPaymentConfigError} (missing/malformed
 *    `LND_PAYMENT_MACAROON_HEX` and friends) means nothing was dialled out at
 *    all, so it is re-thrown as {@link HodlSellerPayoutPayerUnavailableError}
 *    — the one case that is safe to record as a plain, retryable `failed`.
 *  - Any other error from `sendPayment` (a real gRPC/connection failure) is
 *    rethrown as-is, which `payoutToSeller` also treats as ambiguous.
 */
async function payWithLnd(params: {
  paymentRequest: string;
  amountSats: number;
}): Promise<void> {
  let outcome;
  try {
    outcome = await getLndPaymentClient().sendPayment({
      paymentRequest: params.paymentRequest,
      feeLimitSat: payoutFeeLimitSats(params.amountSats),
    });
  } catch (error) {
    if (error instanceof LndPaymentConfigError) {
      throw new HodlSellerPayoutPayerUnavailableError(
        `No Lightning payer is configured: ${error.message}`
      );
    }
    throw error;
  }

  if (outcome.status === "succeeded") return;
  if (outcome.status === "failed") {
    throw new Error(`Lightning payment failed: ${outcome.failureReason}`);
  }
  throw new Error(
    "Lightning payment outcome could not be determined before the stream ended"
  );
}

const DEFAULT_DEPENDENCIES: HodlSellerPayoutDependencies = {
  resolveLightningAddress: fetchSellerLightningAddress,
  requestPayoutInvoice: requestInvoiceFromLightningAddress,
  checkPayoutInvoiceStatus: checkStoredInvoiceStatus,
  payPayoutInvoice: payWithLnd,
};

/**
 * How a payout attempt ended.
 *
 * `unverified` is the one that matters most and the one easiest to misread:
 * it does not mean the payout failed. It means this attempt could not
 * establish what happened, so it deliberately did nothing further. The row
 * stays `pending` with its invoice, and a later attempt asks again. Rounding
 * it to either success or failure is what a correct implementation must not
 * do.
 */
export type HodlSellerPayoutStatus =
  /** Paid on this attempt. */
  | "paid"
  /** A previous attempt's payment was confirmed delivered. */
  | "already_paid"
  /** Outcome unknown; no new payment action taken. Check again later. */
  | "unverified"
  /** Another attempt holds the claim right now. */
  | "in_progress"
  /** Nothing was sent, and a later attempt may succeed. */
  | "failed"
  /** Given up on automatically; needs a human. */
  | "abandoned"
  /** No escrow order exists for this payment hash. */
  | "no_order"
  /** The order's invoice has not settled, so there is nothing to forward. */
  | "not_settled";

export type HodlSellerPayoutResult = {
  status: HodlSellerPayoutStatus;
  reason?: string;
};

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  return "unknown error";
}

/**
 * Pays a settled escrow order's seller, safely on any retry.
 *
 * The sequence, in the order it has to happen:
 *
 *  1. Confirm the order exists and has actually settled. Nothing is forwarded
 *     for an order whose funds were never released.
 *  2. Claim the payout. The claim is row-locked, so two concurrent retries
 *     cannot both go on to pay; the loser is told `in_progress`.
 *  3. If an invoice is already stored, ask what really happened to it — every
 *     time, before anything else. Paid ends the payout. Unknown stops the
 *     attempt without touching money. Only a confirmed-dead invoice is
 *     discarded so a replacement can be fetched.
 *  4. Only then: fetch a fresh invoice, store it, and pay it — in that order.
 *
 * Never throws. Every failure is recorded on the payout row and returned, so
 * a caller firing this after settlement cannot turn a payout problem into a
 * settlement error.
 */
export async function payoutToSeller(
  paymentHash: string,
  dependencies: Partial<HodlSellerPayoutDependencies> = {}
): Promise<HodlSellerPayoutResult> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const normalizedHash = paymentHash.toLowerCase();

  const context = await getHodlEscrowPayoutOrderContext(normalizedHash);
  if (!context) {
    return { status: "no_order" };
  }
  // A payout is a consequence of settlement and nothing else. Paying out on
  // an order still `open`, or one `cancelled` back to the buyer, would send
  // money the platform never received.
  if (context.orderStatus !== "settled") {
    return {
      status: "not_settled",
      reason: `Order status is ${context.orderStatus}`,
    };
  }

  const claim = await claimHodlEscrowPayoutAttempt(normalizedHash);
  if (claim.outcome === "in-progress") {
    return {
      status: "in_progress",
      reason: "Another payout attempt is already running for this order",
    };
  }
  if (claim.outcome === "terminal") {
    return claim.status === "paid"
      ? { status: "already_paid" }
      : {
          status: "abandoned",
          reason:
            claim.lastError ??
            "This payout was abandoned and needs manual attention",
        };
  }

  // Step 3. Ahead of the attempt-limit check on purpose: money that has
  // already left must be recognized even on the attempt that gives up, or a
  // successful payout would be filed as abandoned and paid a second time by
  // whoever reconciled it.
  if (claim.invoice !== null) {
    let invoiceStatus: PayoutInvoiceStatus;
    try {
      invoiceStatus = await deps.checkPayoutInvoiceStatus({
        paymentRequest: claim.invoice,
        verifyUrl: claim.verifyUrl,
      });
    } catch (error) {
      // Failing to ask is not an answer of "no".
      invoiceStatus = "unknown";
      console.error(
        `Could not check the payout invoice for order ${normalizedHash}: ${describeError(error)}`
      );
    }

    if (invoiceStatus === "paid") {
      return finishAsPaid(normalizedHash, "already_paid");
    }

    if (invoiceStatus === "unknown") {
      return {
        status: "unverified",
        reason:
          "The stored payout invoice's status could not be confirmed; no " +
          "new payment was attempted",
      };
    }

    // Confirmed unpaid and unpayable. Only now may the record of it go.
    const discardReason =
      "The stored payout invoice expired without being paid";
    try {
      await discardHodlEscrowPayoutInvoice(normalizedHash, discardReason);
    } catch (error) {
      // The invoice is still on the row, so the next attempt re-verifies it
      // and reaches this same point. Requesting a replacement now would leave
      // a dead invoice on the row and a live one unrecorded.
      console.error(
        `Failed to discard the dead payout invoice for order ${normalizedHash}: ${describeError(error)}`
      );
      return { status: "unverified", reason: describeError(error) };
    }
  }

  if (claim.attemptCount > MAX_HODL_SELLER_PAYOUT_ATTEMPTS) {
    const reason =
      `Payout gave up after ${MAX_HODL_SELLER_PAYOUT_ATTEMPTS} attempts; ` +
      `the seller is still owed ${context.amountSats} sats`;
    await safeMark(() => markHodlEscrowPayoutAbandoned(normalizedHash, reason));
    console.error(`Hodl escrow payout abandoned for ${normalizedHash}`);
    return { status: "abandoned", reason };
  }

  let lightningAddress: string | null;
  try {
    lightningAddress = await deps.resolveLightningAddress(
      context.sellerNostrPubkey
    );
  } catch (error) {
    return failPayout(
      normalizedHash,
      `Could not look up the seller's Lightning address: ${describeError(error)}`
    );
  }
  if (!lightningAddress) {
    // Retryable rather than terminal: a seller who adds an address to their
    // profile makes the next attempt work.
    return failPayout(
      normalizedHash,
      "The seller has no Lightning address saved on their Nostr profile"
    );
  }

  let invoice: {
    paymentRequest: string;
    verifyUrl: string | null;
    amountSats: number;
  };
  try {
    invoice = await deps.requestPayoutInvoice({
      lightningAddress,
      amountSats: context.amountSats,
      comment: `Shopstr escrow payout ${normalizedHash.slice(0, 8)}`,
    });
  } catch (error) {
    // Nothing was stored and nothing was sent, so the next attempt starts
    // from a clean slate.
    return failPayout(
      normalizedHash,
      `Could not get an invoice from ${lightningAddress}: ${describeError(error)}`
    );
  }

  // The address is the seller's, but the invoice it handed back is a value
  // from outside. An amount that is not the settled amount is not paid.
  if (invoice.amountSats !== context.amountSats) {
    return failPayout(
      normalizedHash,
      `The invoice from ${lightningAddress} is for ${invoice.amountSats} sats, ` +
        `not the settled ${context.amountSats} sats`
    );
  }

  // Step 4, first half. Before the payment, always.
  let stored: "stored" | "not-stored";
  try {
    stored = await recordHodlEscrowPayoutInvoice(normalizedHash, {
      invoice: invoice.paymentRequest,
      verifyUrl: invoice.verifyUrl,
    });
  } catch (error) {
    // An unrecorded invoice must not be paid: a crash after paying it would
    // leave nothing to check on retry.
    return failPayout(
      normalizedHash,
      `Could not record the payout invoice before paying it: ${describeError(error)}`
    );
  }
  if (stored === "not-stored") {
    // Some other attempt's invoice is the one on the row. Paying this one
    // would send money against an invoice nothing is tracking.
    return {
      status: "unverified",
      reason:
        "Another attempt's payout invoice is already on record; this " +
        "invoice was not paid",
    };
  }

  try {
    await deps.payPayoutInvoice({
      paymentRequest: invoice.paymentRequest,
      amountSats: context.amountSats,
    });
  } catch (error) {
    if (error instanceof HodlSellerPayoutPayerUnavailableError) {
      // A certainty: nothing was dialled out, so this is a plain failure.
      return failPayout(normalizedHash, describeError(error));
    }

    // An ambiguity: a send that threw may still be in flight. The row stays
    // `pending` with the invoice intact, so the next attempt verifies that
    // invoice instead of paying a second one.
    const reason = describeError(error);
    console.error(
      `Payout payment failed for order ${normalizedHash}: ${reason}`
    );
    try {
      await recordHodlEscrowPayoutError(normalizedHash, reason);
    } catch (writeError) {
      console.error(
        `Failed to record the payout error for order ${normalizedHash}: ${describeError(writeError)}`
      );
    }
    return { status: "unverified", reason };
  }

  return finishAsPaid(normalizedHash, "paid");
}

/**
 * Marks a payout delivered, degrading to `unverified` if the write fails.
 *
 * The money is gone and the row disagrees — which is the same shape as a
 * settle whose status write failed, and is handled the same way. Reporting
 * anything terminal here would be a guess; `unverified` sends the next
 * attempt to the invoice's verify endpoint, which finds it paid and
 * reconciles the row without paying again.
 */
async function finishAsPaid(
  paymentHash: string,
  status: "paid" | "already_paid"
): Promise<HodlSellerPayoutResult> {
  try {
    await markHodlEscrowPayoutPaid(paymentHash);
  } catch (error) {
    console.error(
      `Paid the seller for order ${paymentHash} but failed to record it: ${describeError(error)}`
    );
    return { status: "unverified", reason: describeError(error) };
  }
  return { status };
}

/** Records a failure that definitely sent nothing, and reports it. */
async function failPayout(
  paymentHash: string,
  reason: string
): Promise<HodlSellerPayoutResult> {
  console.error(`Hodl escrow payout failed for ${paymentHash}: ${reason}`);
  await safeMark(() => markHodlEscrowPayoutFailed(paymentHash, reason));
  return { status: "failed", reason };
}

/**
 * Runs a status write without letting its failure become the caller's.
 *
 * The payout is already in a reportable state by the time these run; a
 * database that cannot record it does not make the outcome any different, and
 * throwing from here would replace a precise result with a stack trace.
 */
async function safeMark(write: () => Promise<unknown>): Promise<void> {
  try {
    await write();
  } catch (error) {
    console.error(`Failed to record a payout status: ${describeError(error)}`);
  }
}

/**
 * Fires a payout without making the caller wait for it.
 *
 * Deliberately detached. The settle and dispute-resolution endpoints answer a
 * question about the buyer's HTLC — "have the funds been released?" — and by
 * the time they would call this, the answer is already yes and cannot be
 * unmade. Blocking that response on an LNURL round-trip plus a Lightning
 * payment would mean a slow or unreachable seller wallet turns a completed
 * settlement into a 5xx, and the retry that provokes re-runs the whole
 * authorization path for money that has already moved.
 *
 * So settlement reports success immediately, and the payout's own row is
 * where its progress lives — `pending`, `paid`, `failed` or `abandoned`, with
 * `listHodlEscrowPayoutsNeedingAttention` as the query for anything stuck.
 *
 * The trade is that nothing currently re-drives a payout left `pending` or
 * `failed`. A scheduled sweep mirroring `syncAllPendingHodlOrders` is the
 * obvious follow-up and is deliberately not built here; until it exists,
 * those rows are found by the query above rather than retried automatically.
 */
export function schedulePayoutToSeller(paymentHash: string): void {
  void payoutToSeller(paymentHash)
    .then((result) => {
      if (result.status === "paid" || result.status === "already_paid") return;
      console.warn(
        `Hodl escrow payout for ${paymentHash} ended as ${result.status}` +
          (result.reason ? `: ${result.reason}` : "")
      );
    })
    .catch((error: unknown) => {
      console.error(
        `Hodl escrow payout for ${paymentHash} threw: ${describeError(error)}`
      );
    });
}
