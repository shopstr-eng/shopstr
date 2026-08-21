import type { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { getDefaultRelays, withBlastr } from "@/utils/nostr/relay-config";
import {
  fetchHodlDisputeEvents,
  fetchHodlReleaseEvents,
  HodlRelayUnavailableError,
} from "@/utils/nostr/hodl-escrow-records";
import type {
  ParsedHodlDisputeEvent,
  ParsedHodlReleaseEvent,
} from "@/utils/nostr/hodl-escrow-records";
import {
  authorizeHodlReleaseEventForOrder,
  HodlAuthorizationError,
  type AuthorizedHodlRelease,
  type HodlAuthorizationFailureReason,
} from "@/utils/nostr/server-hodl-escrow-authorization";
import {
  evaluateHodlDisputeActionability,
  HodlDisputeActionabilityError,
  type HodlDisputeActionability,
} from "@/utils/nostr/hodl-dispute-actionability";
import {
  getHodlInvoiceProvider,
  HodlInvoiceProviderUnavailableError,
} from "@/utils/lightning/hodl-invoice-provider-registry";
import type { HodlInvoiceProvider } from "@/utils/lightning/hodl-invoice-provider";
import { schedulePayoutToSeller } from "@/utils/lightning/hodl-seller-payout";
import {
  DatabaseUnavailableError,
  getHodlEscrowOrderParties,
  getHodlEscrowSettlementSecret,
  markHodlEscrowOrderCancelled,
  markHodlEscrowOrderSettled,
} from "@/utils/db/db-service";

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };
const HEX_32_BYTE = /^[0-9a-f]{64}$/i;
const RELAY_TIMEOUT_MS = 10_000;

// The entire request, mirroring settle-hodl-invoice.ts: everything else this
// route needs — which arbiter, which ruling, whether to release to the buyer
// or the seller — is looked up server-side from relays and the commitment
// row. There is deliberately no field for an event, a decision, a pubkey, or
// a preimage, because any such field would be a value the caller controls
// being used to decide whether money moves.
//
// Unknown keys are rejected rather than ignored, on the same reasoning as
// settle-hodl-invoice.ts.
type ResolveHodlDisputeRequestBody = {
  /** The hold invoice's payment hash, 32 bytes of hex. */
  paymentHash: string;
};

const ALLOWED_BODY_KEYS = new Set(["paymentHash"]);

function parseRequestBody(body: unknown): ResolveHodlDisputeRequestBody | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  for (const key of Object.keys(body)) {
    if (!ALLOWED_BODY_KEYS.has(key)) return null;
  }

  const value = body as Partial<ResolveHodlDisputeRequestBody>;
  if (
    typeof value.paymentHash !== "string" ||
    !HEX_32_BYTE.test(value.paymentHash)
  ) {
    return null;
  }

  return { paymentHash: value.paymentHash.toLowerCase() };
}

function createServerNostrManager(): NostrManager {
  return new NostrManager(withBlastr(getDefaultRelays()), {
    connectionTimeout: 10_000,
    keepAliveTime: 60_000,
    gcInterval: 60_000,
  });
}

/**
 * Why no candidate could resolve this dispute.
 *
 * `no_release_event` is this route's own: relays returned nothing to
 * authorize, so there is no {@link HodlAuthorizationError} to take a reason
 * from.
 */
type ResolveRejectionReason =
  HodlAuthorizationFailureReason | "no_release_event";

/**
 * Why an authorized ruling was still refused: there was nothing for the
 * arbiter to rule on yet.
 *
 * Both are verdicts in the same sense as {@link ResolveRejectionReason} —
 * reached after relays and the commitment row were consulted — and both are
 * about the dispute rather than about the ruling, which is why they are a
 * separate type from the reasons {@link authorizeAnyRelease} can produce.
 */
type DisputeGateRejectionReason =
  /** No dispute signed by this order's buyer or seller exists at all. */
  | "no_actionable_dispute"
  /** A seller's dispute exists but is still inside its waiting period. */
  | "dispute_not_yet_actionable";

type AuthorizationOutcome =
  | { ok: true; release: AuthorizedHodlRelease }
  | { ok: false; reason: ResolveRejectionReason };

/**
 * Walks the fetched candidates and returns the first that authorizes.
 *
 * Every candidate is a stranger's event until proven otherwise: relays hand
 * back whatever anyone published under this payment hash, so the list is
 * expected to contain forgeries and the loop's job is to find the one event
 * that {@link authorizeHodlReleaseEventForOrder} matches to the committed
 * arbiter. A non-empty list is not a result.
 *
 * Only {@link HodlAuthorizationError} is treated as "this candidate is not
 * the arbiter". Anything else — a database outage inside the authorize call,
 * say — is rethrown, because swallowing it would turn an infrastructure
 * failure into a plain "no valid release" and, on the retry that an arbiter
 * inevitably makes, keep doing so.
 */
async function authorizeAnyRelease(
  paymentHash: string,
  candidates: ParsedHodlReleaseEvent[]
): Promise<AuthorizationOutcome> {
  let reason: ResolveRejectionReason = "no_release_event";

  for (const candidate of candidates) {
    try {
      const release = await authorizeHodlReleaseEventForOrder(
        paymentHash,
        candidate
      );
      return { ok: true, release };
    } catch (error) {
      if (!(error instanceof HodlAuthorizationError)) throw error;

      // `no_such_order` is about the order rather than about this one author,
      // so it outranks whatever a later candidate reports: every candidate
      // will fail the same way, and reporting the last one's pubkey_mismatch
      // would send a caller looking for the wrong problem.
      if (error.reason === "no_such_order") {
        return { ok: false, reason: "no_such_order" };
      }
      reason = error.reason;
    }
  }

  return { ok: false, reason };
}

const REJECTION_RESPONSES: Record<
  ResolveRejectionReason | DisputeGateRejectionReason,
  { status: 403 | 404; error: string }
> = {
  no_such_order: {
    status: 404,
    error: "No escrow order exists for this payment hash",
  },
  no_release_event: {
    status: 403,
    error: "No arbiter ruling has been published for this order",
  },
  pubkey_mismatch: {
    status: 403,
    error: "No ruling for this order was signed by its arbiter",
  },
  order_mismatch: {
    status: 403,
    error: "Ruling events do not belong to this order",
  },
  // Deliberately the same 403 as the two above: an arbiter ruling on an order
  // nobody disputed is refused on the same grounds as a stranger's ruling —
  // the event does not carry the authority to move this money right now.
  no_actionable_dispute: {
    status: 403,
    error: "No party to this order has raised a dispute to resolve",
  },
  dispute_not_yet_actionable: {
    status: 403,
    error:
      "The seller's dispute cannot be resolved until its waiting period has elapsed",
  },
};

/**
 * The "we could not check" answers, kept separate from
 * {@link REJECTION_RESPONSES} for the same reason as in
 * settle-hodl-invoice.ts: every entry above is a verdict reached after relays
 * and the commitment row were consulted, and these two are the absence of a
 * verdict. A relay outage that collapsed into an empty candidate list used to
 * come back as `no_release_event` — telling an arbiter who had already
 * published a ruling that no ruling existed.
 */
const UNAVAILABLE_RESPONSES = {
  database: {
    status: 503 as const,
    error: "Service temporarily unavailable. Please try again.",
    reason: "database_unavailable" as const,
  },
  relay: {
    status: 503 as const,
    error:
      "Could not reach relays to check for an arbiter ruling. Please try again.",
    reason: "relay_unavailable" as const,
  },
  // Same outage, a different question left unanswered. The `reason` is
  // deliberately identical, so a client branching on it sees one relay
  // failure; only the human-readable text says which lookup died.
  disputeRelay: {
    status: 503 as const,
    error:
      "Could not reach relays to check for a dispute on this order. Please try again.",
    reason: "relay_unavailable" as const,
  },
};

// Any 64-character hex run that is not this order's payment hash. In a file
// whose one secret is exactly that shape, an unrecognized 64-hex blob in an
// error message has no business being written to a log.
const HEX_32_BYTE_RUN = /\b[0-9a-f]{64}\b/gi;

/**
 * Renders a failure as a log-safe string with any settlement secret scrubbed.
 * Identical contract to settle-hodl-invoice.ts's `describeFailure` — see
 * there for why the error object itself is never handed to `console.error`
 * and why every 64-hex run other than `paymentHash` is redacted rather than
 * only a value this call happens to hold.
 */
function describeFailure(error: unknown, paymentHash: string): string {
  const rendered =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === "string"
        ? error
        : "unknown error";

  return rendered.replace(HEX_32_BYTE_RUN, (match) =>
    match.toLowerCase() === paymentHash.toLowerCase() ? match : "[redacted]"
  );
}

type DisputeGateOutcome =
  | { ok: true }
  | { ok: false; reason: "no_actionable_dispute" }
  | {
      ok: false;
      reason: "dispute_not_yet_actionable";
      /** How much longer the arbiter must wait, for the response body. */
      remainingSeconds: number;
    };

/**
 * Requires that a legitimate, actionable dispute exists before an authorized
 * ruling is allowed to move money.
 *
 * An authorized ruling proves the order's committed arbiter signed it. It
 * does not prove there was anything to rule on. Without this gate an arbiter
 * key — compromised, or simply firing early — could settle an order nobody
 * disputed, or resolve a seller's dispute the instant it was raised, before
 * the buyer had any window in which to confirm receipt. That window is the
 * whole point of hodl-dispute-actionability.ts's
 * SELLER_DISPUTE_TIMEOUT_SECONDS, which until this gate existed was computed
 * by a function no server path called.
 *
 * Candidates are treated exactly like release candidates: relays hand back
 * whatever anyone published, so forgeries are expected and filtered rather
 * than errored on. `unknown_disputer` — signed by neither the committed buyer
 * nor the committed seller — is the ordinary case for a stranger's event, and
 * `no_accepted_at` is a seller disputing an order whose funds were never
 * held; neither is grounds for refusing to look at the rest of the list.
 *
 * @throws {HodlRelayUnavailableError} relays could not be reached.
 * @throws {DatabaseUnavailableError} the commitment row could not be read.
 * @throws {HodlDisputeActionabilityError} with reason `no_such_order` only.
 */
async function requireActionableDispute(
  release: AuthorizedHodlRelease
): Promise<DisputeGateOutcome> {
  const { paymentHash, arbiterNostrPubkey } = release;

  // The arbiter comes from the commitment row by way of the authorized
  // release, never from the request — the same anchor the ruling itself was
  // just checked against.
  let candidates: ParsedHodlDisputeEvent[];
  const nostr = createServerNostrManager();
  try {
    candidates = await fetchHodlDisputeEvents({
      nostr,
      arbiterPubkey: arbiterNostrPubkey,
      timeoutMs: RELAY_TIMEOUT_MS,
    });
  } finally {
    nostr.close();
  }

  // Set only by seller disputes still inside the window, and kept at the
  // smallest such value: with several pending, the soonest is the one that
  // answers "how much longer until I can act?".
  let soonestRemainingSeconds: number | null = null;

  for (const candidate of candidates) {
    // fetchHodlDisputeEvents filters on the arbiter's `p` tag, not on `d`, so
    // its results span every order this arbiter handles. Unlike the release
    // fetch, narrowing to this order is the caller's job — and skipping it
    // would let a dispute on some unrelated order unlock this one.
    if (candidate.orderId !== paymentHash) continue;

    let actionability: HodlDisputeActionability;
    try {
      actionability = await evaluateHodlDisputeActionability(
        paymentHash,
        candidate
      );
    } catch (error) {
      if (!(error instanceof HodlDisputeActionabilityError)) throw error;
      // `no_such_order` is about the order rather than about this one author,
      // same reasoning as in authorizeAnyRelease: the row that authorized the
      // ruling moments ago has since gone, every remaining candidate would
      // fail identically, and answering "nobody disputed this" on the
      // strength of a row nobody could read would be a verdict about an
      // unanswered question.
      if (error.reason === "no_such_order") throw error;
      continue;
    }

    // Buyer disputes report actionable immediately; seller disputes only once
    // their window has elapsed. Either way this is the one result that lets
    // money move.
    if (actionability.actionable) return { ok: true };

    const remaining = actionability.remainingSeconds ?? 0;
    if (
      soonestRemainingSeconds === null ||
      remaining < soonestRemainingSeconds
    ) {
      soonestRemainingSeconds = remaining;
    }
  }

  if (soonestRemainingSeconds === null) {
    return { ok: false, reason: "no_actionable_dispute" };
  }

  return {
    ok: false,
    reason: "dispute_not_yet_actionable",
    remainingSeconds: soonestRemainingSeconds,
  };
}

type ResolutionOutcome =
  | { ok: true; status: "settled" | "cancelled" }
  | {
      ok: false;
      status: 500 | 502 | 503;
      error: string;
      /** Only set on the 503 paths; see {@link UNAVAILABLE_RESPONSES}. */
      reason?: string;
    };

/**
 * Releases funds to the seller on the strength of an authorized
 * `release:seller` ruling.
 *
 * The parameter is the branded {@link AuthorizedHodlRelease}, and that is the
 * entire point of the signature: the only way to obtain one is to have called
 * {@link authorizeHodlReleaseEventForOrder} and had it return rather than
 * throw. The order is read from the release, never from the request.
 */
async function settleForSeller(
  release: AuthorizedHodlRelease,
  provider: HodlInvoiceProvider
): Promise<ResolutionOutcome> {
  const { paymentHash } = release;

  // Loaded as late as possible, and it travels exactly one place: the
  // settleInvoice argument below. Not logged, not returned, not attached to
  // an error, not held past this function.
  let preimage: string | null;
  try {
    preimage = await getHodlEscrowSettlementSecret(paymentHash);
  } catch (error) {
    console.error(
      `Failed to load the settlement secret for order ${paymentHash}: ${describeFailure(error, paymentHash)}`
    );
    // Nothing has moved yet — the provider has not been called — so a database
    // outage here is safely retryable, unlike the write further down.
    if (error instanceof DatabaseUnavailableError) {
      return { ok: false, ...UNAVAILABLE_RESPONSES.database };
    }
    return { ok: false, status: 500, error: "Failed to settle escrow order" };
  }
  if (!preimage) {
    // The row was there a moment ago and `preimage` is NOT NULL, so this is a
    // row deleted mid-request, not a caller error.
    console.error(
      `Hodl escrow order ${paymentHash} has no settlement secret to settle with`
    );
    return { ok: false, status: 500, error: "Failed to settle escrow order" };
  }

  try {
    await provider.settleInvoice(preimage);
  } catch (error) {
    // Status is left exactly as it was. The invoice is still held, and the
    // same ruling will authorize the retry — whereas a row marked `settled`
    // here would strand held funds behind a record saying they had already
    // been released.
    console.error(
      `Failed to settle hold invoice for order ${paymentHash}: ${describeFailure(error, paymentHash)}`
    );
    return { ok: false, status: 502, error: "Failed to settle hold invoice" };
  }

  // Only now: the HTLC is settled, so the row can say so.
  try {
    const updated = await markHodlEscrowOrderSettled(paymentHash);
    if (updated === "not-found") {
      console.error(
        `Settled hold invoice for order ${paymentHash} but no commitment row remained to mark settled`
      );
      return {
        ok: false,
        status: 500,
        error: "Invoice settled but the order could not be updated",
      };
    }
  } catch (error) {
    // The money has moved and the row disagrees. Reported as a failure rather
    // than papered over with a 200: settleInvoice is idempotent, so the retry
    // this provokes reconciles the row instead of paying twice.
    console.error(
      `Settled hold invoice for order ${paymentHash} but failed to mark it settled: ${describeFailure(error, paymentHash)}`
    );
    return {
      ok: false,
      status: 500,
      error: "Invoice settled but the order could not be updated",
    };
  }

  return { ok: true, status: "settled" };
}

/**
 * Cancels the hold invoice on the strength of an authorized `release:buyer`
 * ruling, returning funds to the buyer.
 *
 * No preimage is read anywhere in this path — `cancelInvoice` needs only the
 * payment hash, and this function never calls
 * {@link getHodlEscrowSettlementSecret}. There is nothing to redact here that
 * isn't already covered by {@link describeFailure}, but the absence of a
 * secret read is itself the guarantee: a value that is never loaded cannot
 * leak.
 */
async function cancelForBuyer(
  release: AuthorizedHodlRelease,
  provider: HodlInvoiceProvider
): Promise<ResolutionOutcome> {
  const { paymentHash } = release;

  try {
    await provider.cancelInvoice(paymentHash);
  } catch (error) {
    // Status is left exactly as it was, same reasoning as settleForSeller:
    // the invoice is still held, and the same ruling will authorize the retry.
    console.error(
      `Failed to cancel hold invoice for order ${paymentHash}: ${describeFailure(error, paymentHash)}`
    );
    return { ok: false, status: 502, error: "Failed to cancel hold invoice" };
  }

  // Only now: the HTLC is cancelled, so the row can say so.
  try {
    const updated = await markHodlEscrowOrderCancelled(paymentHash);
    if (updated === "not-found") {
      console.error(
        `Cancelled hold invoice for order ${paymentHash} but no commitment row remained to mark cancelled`
      );
      return {
        ok: false,
        status: 500,
        error: "Invoice cancelled but the order could not be updated",
      };
    }
  } catch (error) {
    // The HTLC has released and the row disagrees. Reported as a failure
    // rather than papered over with a 200: cancelInvoice is idempotent, so
    // the retry this provokes reconciles the row instead of double-cancelling.
    console.error(
      `Cancelled hold invoice for order ${paymentHash} but failed to mark it cancelled: ${describeFailure(error, paymentHash)}`
    );
    return {
      ok: false,
      status: 500,
      error: "Invoice cancelled but the order could not be updated",
    };
  }

  return { ok: true, status: "cancelled" };
}

/**
 * Resolves a disputed hold invoice on the strength of an authorized arbiter
 * ruling.
 *
 * The caller supplies a payment hash and nothing else. The decision to
 * release funds to the seller or return them to the buyer rests entirely on
 * a release-decision event (kind 30409) that the order's committed arbiter
 * signed, fetched independently from relays and run through
 * {@link authorizeHodlReleaseEventForOrder}. Anyone can call this endpoint;
 * only an authorized ruling can move money.
 *
 * An authorized ruling is necessary but not sufficient: it must also answer
 * a dispute that a party to this order actually raised and that is actionable
 * now, which {@link requireActionableDispute} checks against dispute events
 * (kind 30410) and the order's `accepted_at`.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "resolve-hodl-dispute", RATE_LIMIT)) return;

  const body = parseRequestBody(req.body);
  if (!body) {
    return res
      .status(400)
      .json({ error: "Invalid hodl escrow resolve request" });
  }
  const { paymentHash } = body;

  let provider;
  try {
    provider = getHodlInvoiceProvider();
  } catch (error) {
    if (error instanceof HodlInvoiceProviderUnavailableError) {
      console.error(
        `No hodl invoice provider available: ${describeFailure(error, paymentHash)}`
      );
      return res
        .status(503)
        .json({ error: "Lightning escrow is not available" });
    }
    throw error;
  }

  // An early-out, NOT an authorization step: it establishes only that there
  // is an order to talk about, so an unknown payment hash costs a single
  // indexed lookup instead of a ten-second relay fetch. Who is allowed to
  // resolve the dispute is decided further down, by
  // authorizeHodlReleaseEventForOrder and nothing else — this result is never
  // consulted for that.
  let orderExists: boolean;
  try {
    orderExists = (await getHodlEscrowOrderParties(paymentHash)) !== null;
  } catch (error) {
    console.error(
      `Failed to look up hodl escrow order ${paymentHash}: ${describeFailure(error, paymentHash)}`
    );
    // A failed lookup is not an absent order. Falling through to the
    // `no_such_order` 404 below would tell an arbiter their escrow does not
    // exist on the strength of a question that was never answered.
    if (error instanceof DatabaseUnavailableError) {
      const { status, ...body } = UNAVAILABLE_RESPONSES.database;
      return res.status(status).json(body);
    }
    return res.status(500).json({ error: "Failed to look up escrow order" });
  }
  if (!orderExists) {
    const rejection = REJECTION_RESPONSES.no_such_order;
    return res
      .status(rejection.status)
      .json({ error: rejection.error, reason: "no_such_order" });
  }

  // Fetched here, server-side, from the payment hash alone. The client never
  // gets to say which events, or which decision, count.
  let candidates: ParsedHodlReleaseEvent[];
  const nostr = createServerNostrManager();
  try {
    candidates = await fetchHodlReleaseEvents({
      nostr,
      paymentHash,
      timeoutMs: RELAY_TIMEOUT_MS,
    });
  } catch (error) {
    console.error(
      `Failed to fetch hodl release events for order ${paymentHash}: ${describeFailure(error, paymentHash)}`
    );
    // The relays could not be reached, so the candidate list was never
    // populated. Authorizing against it would find nothing and answer 403 —
    // "no arbiter ruling exists" — about events nobody ever looked for.
    if (error instanceof HodlRelayUnavailableError) {
      const { status, ...body } = UNAVAILABLE_RESPONSES.relay;
      return res.status(status).json(body);
    }
    return res.status(502).json({ error: "Failed to look up arbiter rulings" });
  } finally {
    nostr.close();
  }

  let outcome: AuthorizationOutcome;
  try {
    outcome = await authorizeAnyRelease(paymentHash, candidates);
  } catch (error) {
    // Only non-authorization failures reach here; see authorizeAnyRelease.
    console.error(
      `Failed to authorize hodl release events for order ${paymentHash}: ${describeFailure(error, paymentHash)}`
    );
    // The commitment row could not be read, so no candidate was compared
    // against anything. That is the same "we could not check" as the lookup
    // above, arriving one step later.
    if (error instanceof DatabaseUnavailableError) {
      const { status, ...body } = UNAVAILABLE_RESPONSES.database;
      return res.status(status).json(body);
    }
    return res
      .status(500)
      .json({ error: "Failed to authorize arbiter ruling" });
  }
  if (!outcome.ok) {
    const rejection = REJECTION_RESPONSES[outcome.reason];
    return res
      .status(rejection.status)
      .json({ error: rejection.error, reason: outcome.reason });
  }

  // The ruling is the arbiter's. Whether there is anything to rule on is a
  // separate question, and it is asked here — after authorization, because
  // the arbiter to look disputes up for comes from the authorized release,
  // and before any provider call, because this is the last point at which
  // nothing has moved.
  let gate: DisputeGateOutcome;
  try {
    gate = await requireActionableDispute(outcome.release);
  } catch (error) {
    console.error(
      `Failed to check for an actionable dispute on order ${paymentHash}: ${describeFailure(error, paymentHash)}`
    );
    // Same "we could not check" discipline as the lookups above: an
    // unanswered question must never reach the caller dressed as a 403
    // saying no dispute exists.
    if (error instanceof HodlRelayUnavailableError) {
      const { status, ...body } = UNAVAILABLE_RESPONSES.disputeRelay;
      return res.status(status).json(body);
    }
    if (error instanceof DatabaseUnavailableError) {
      const { status, ...body } = UNAVAILABLE_RESPONSES.database;
      return res.status(status).json(body);
    }
    // The commitment row vanished between authorizing the ruling and reading
    // the dispute context.
    if (
      error instanceof HodlDisputeActionabilityError &&
      error.reason === "no_such_order"
    ) {
      const rejection = REJECTION_RESPONSES.no_such_order;
      return res
        .status(rejection.status)
        .json({ error: rejection.error, reason: "no_such_order" });
    }
    return res
      .status(500)
      .json({ error: "Failed to check for an actionable dispute" });
  }
  if (!gate.ok) {
    const rejection = REJECTION_RESPONSES[gate.reason];
    // `remainingSeconds` rides along only where it means something, so the
    // other rejection bodies keep the exact shape they have always had.
    return res.status(rejection.status).json(
      gate.reason === "dispute_not_yet_actionable"
        ? {
            error: rejection.error,
            reason: gate.reason,
            remainingSeconds: gate.remainingSeconds,
          }
        : { error: rejection.error, reason: gate.reason }
    );
  }

  const resolution =
    outcome.release.decision === "release:seller"
      ? await settleForSeller(outcome.release, provider)
      : await cancelForBuyer(outcome.release, provider);

  if (!resolution.ok) {
    // `reason` is omitted rather than sent as undefined, so the 500 and 502
    // bodies stay exactly the single-key shape they have always been.
    return res
      .status(resolution.status)
      .json(
        resolution.reason === undefined
          ? { error: resolution.error }
          : { error: resolution.error, reason: resolution.reason }
      );
  }

  // Only the `release:seller` path owes anyone a payout: a `release:buyer`
  // ruling cancels the HTLC, so the funds go back to the buyer over Lightning
  // and never sit in the arbiter's balance at all. Fire-and-forget for the
  // same reason as settle-hodl-invoice.ts — the ruling has already been
  // carried out, and a slow seller wallet must not turn it into a 5xx.
  if (resolution.status === "settled") {
    schedulePayoutToSeller(paymentHash);
  }

  // The whole response. No preimage, no event, no row contents — a caller
  // learns only how the dispute resolved and nothing else about how it was
  // decided.
  return res.status(200).json({ status: resolution.status });
}
