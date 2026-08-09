import type { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { getDefaultRelays, withBlastr } from "@/utils/nostr/relay-config";
import { fetchHodlReleaseEvents } from "@/utils/nostr/hodl-escrow-records";
import type { ParsedHodlReleaseEvent } from "@/utils/nostr/hodl-escrow-records";
import {
  authorizeHodlReleaseEventForOrder,
  HodlAuthorizationError,
  type AuthorizedHodlRelease,
  type HodlAuthorizationFailureReason,
} from "@/utils/nostr/server-hodl-escrow-authorization";
import {
  getHodlInvoiceProvider,
  HodlInvoiceProviderUnavailableError,
} from "@/utils/lightning/hodl-invoice-provider-registry";
import type { HodlInvoiceProvider } from "@/utils/lightning/hodl-invoice-provider";
import {
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
  ResolveRejectionReason,
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

type ResolutionOutcome =
  | { ok: true; status: "settled" | "cancelled" }
  | { ok: false; status: 500 | 502; error: string };

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

  const resolution =
    outcome.release.decision === "release:seller"
      ? await settleForSeller(outcome.release, provider)
      : await cancelForBuyer(outcome.release, provider);

  if (!resolution.ok) {
    return res.status(resolution.status).json({ error: resolution.error });
  }

  // The whole response. No preimage, no event, no row contents — a caller
  // learns only how the dispute resolved and nothing else about how it was
  // decided.
  return res.status(200).json({ status: resolution.status });
}
