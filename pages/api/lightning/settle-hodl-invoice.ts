import type { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { getDefaultRelays, withBlastr } from "@/utils/nostr/relay-config";
import {
  fetchHodlConfirmEvents,
  HodlRelayUnavailableError,
} from "@/utils/nostr/hodl-escrow-records";
import type { ParsedHodlConfirmEvent } from "@/utils/nostr/hodl-escrow-records";
import {
  authorizeHodlConfirmEventForOrder,
  HodlAuthorizationError,
  type AuthorizedHodlConfirmation,
  type HodlAuthorizationFailureReason,
} from "@/utils/nostr/server-hodl-escrow-authorization";
import {
  getHodlInvoiceProvider,
  HodlInvoiceProviderUnavailableError,
} from "@/utils/lightning/hodl-invoice-provider-registry";
import type { HodlInvoiceProvider } from "@/utils/lightning/hodl-invoice-provider";
import {
  DatabaseUnavailableError,
  getHodlEscrowOrderParties,
  getHodlEscrowSettlementSecret,
  markHodlEscrowOrderSettled,
} from "@/utils/db/db-service";

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };
const HEX_32_BYTE = /^[0-9a-f]{64}$/i;
const RELAY_TIMEOUT_MS = 10_000;

// The entire request. Not "mostly the request" — the whole thing.
//
// Everything else this route needs is looked up server-side: who confirmed
// comes from relays and is checked against the commitment row, and the secret
// that settles the invoice is read from the database. There is deliberately
// no field for an event, a pubkey, a signature, or a "confirmed: true" claim,
// because any such field would be a value the caller controls being used to
// decide whether money moves.
//
// Unknown keys are rejected rather than ignored, on the same reasoning as
// register-hodl-order.ts: silently dropping a `buyerPubkey` a client thought
// mattered would hand back a 200 for a settlement that ignored it.
type SettleHodlInvoiceRequestBody = {
  /** The hold invoice's payment hash, 32 bytes of hex. */
  paymentHash: string;
};

const ALLOWED_BODY_KEYS = new Set(["paymentHash"]);

function parseRequestBody(body: unknown): SettleHodlInvoiceRequestBody | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  for (const key of Object.keys(body)) {
    if (!ALLOWED_BODY_KEYS.has(key)) return null;
  }

  const value = body as Partial<SettleHodlInvoiceRequestBody>;
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
 * Why no candidate could settle this order.
 *
 * `no_confirmation` is this route's own: relays returned nothing to authorize,
 * so there is no {@link HodlAuthorizationError} to take a reason from.
 */
type SettleRejectionReason = HodlAuthorizationFailureReason | "no_confirmation";

type AuthorizationOutcome =
  | { ok: true; confirmation: AuthorizedHodlConfirmation }
  | { ok: false; reason: SettleRejectionReason };

/**
 * Walks the fetched candidates and returns the first that authorizes.
 *
 * Every candidate is a stranger's event until proven otherwise: relays hand
 * back whatever anyone published under this payment hash, so the list is
 * expected to contain forgeries and the loop's job is to find the one event
 * that {@link authorizeHodlConfirmEventForOrder} matches to the committed
 * buyer. A non-empty list is not a result.
 *
 * Only {@link HodlAuthorizationError} is treated as "this candidate is not
 * the buyer". Anything else — a database outage inside the authorize call,
 * say — is rethrown, because swallowing it would turn an infrastructure
 * failure into a plain "no valid confirmation" and, on the retry that a
 * seller inevitably makes, keep doing so.
 */
async function authorizeAnyConfirmation(
  paymentHash: string,
  candidates: ParsedHodlConfirmEvent[]
): Promise<AuthorizationOutcome> {
  let reason: SettleRejectionReason = "no_confirmation";

  for (const candidate of candidates) {
    try {
      const confirmation = await authorizeHodlConfirmEventForOrder(
        paymentHash,
        candidate
      );
      return { ok: true, confirmation };
    } catch (error) {
      if (!(error instanceof HodlAuthorizationError)) throw error;

      // `no_such_order` is about the order rather than about this one author,
      // so it outranks whatever a later candidate reports: every candidate
      // will fail the same way, and reporting the last one's pubkey_mismatch
      // would send a seller looking for the wrong problem.
      if (error.reason === "no_such_order") {
        return { ok: false, reason: "no_such_order" };
      }
      reason = error.reason;
    }
  }

  return { ok: false, reason };
}

const REJECTION_RESPONSES: Record<
  SettleRejectionReason,
  { status: 403 | 404; error: string }
> = {
  no_such_order: {
    status: 404,
    error: "No escrow order exists for this payment hash",
  },
  no_confirmation: {
    status: 403,
    error: "No buyer confirmation has been published for this order",
  },
  pubkey_mismatch: {
    status: 403,
    error: "No confirmation for this order was signed by its buyer",
  },
  order_mismatch: {
    status: 403,
    error: "Confirmation events do not belong to this order",
  },
};

/**
 * The "we could not check" answers, kept separate from
 * {@link REJECTION_RESPONSES} because they are the opposite kind of answer.
 *
 * Every entry above is a verdict: relays and the commitment row were both
 * consulted, and the settlement is refused. These two are the absence of a
 * verdict. Collapsing them into a 403 — which is what an infrastructure
 * failure used to do, once a relay outage became an empty candidate list —
 * tells a seller who did ship that their buyer never confirmed, and the retry
 * that would have succeeded is the one thing that message argues against.
 *
 * 503 rather than 500 for the same reason: a caller that reads status codes
 * should see "come back", not "we are broken and your request will never
 * work". `reason` mirrors the field the 403/404 bodies already carry, so a
 * client can branch without matching on prose.
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
      "Could not reach relays to check for a buyer confirmation. Please try again.",
    reason: "relay_unavailable" as const,
  },
};

// Any 64-character hex run that is not this order's payment hash. In a file
// whose one secret is exactly that shape, an unrecognized 64-hex blob in an
// error message has no business being written to a log.
const HEX_32_BYTE_RUN = /\b[0-9a-f]{64}\b/gi;

/**
 * Renders a failure as a log-safe string with any settlement secret scrubbed.
 *
 * Two rules, because they fail independently:
 *
 *  1. The message is rebuilt from `name` and `message` alone. The error object
 *     itself is never handed to `console.error`, so a provider that hangs the
 *     preimage off a `cause`, a `config`, or a stack frame cannot smuggle it
 *     into the logs by a route the string redaction never sees.
 *  2. Every 64-hex run other than `paymentHash` is redacted, rather than only
 *     the preimage this call happens to hold. That covers the paths where the
 *     secret is not in scope to compare against — a database error that quotes
 *     the row it failed to read, most of all.
 *
 * The mock provider does not echo the preimage today. The real backend that
 * replaces it will be an HTTP client whose errors quote the request body they
 * sent, and by then this call site will be old enough that nobody rereads it.
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

type SettlementOutcome =
  | { ok: true }
  | {
      ok: false;
      status: 500 | 502 | 503;
      error: string;
      /** Only set on the 503 paths; see {@link UNAVAILABLE_RESPONSES}. */
      reason?: string;
    };

/**
 * Reads the settlement secret and releases the funds.
 *
 * The first parameter is the branded {@link AuthorizedHodlConfirmation}, and
 * that is the entire point of the signature: the only way to obtain one is to
 * have called {@link authorizeHodlConfirmEventForOrder} and had it return
 * rather than throw. A future edit that reaches for the preimage without
 * authorizing first has nothing to pass here and does not compile, which is a
 * sturdier guarantee than a comment asking the next author to check.
 *
 * The order is read from the confirmation too, never from the request: that
 * value came back from the commitment row, so the secret fetched here belongs
 * to the same order whose buyer was just verified.
 */
async function settleAuthorizedOrder(
  confirmation: AuthorizedHodlConfirmation,
  provider: HodlInvoiceProvider
): Promise<SettlementOutcome> {
  const { paymentHash } = confirmation;

  // Loaded as late as possible, and it travels exactly one place: the
  // settleInvoice argument below. Not logged, not returned, not attached to an
  // error, not held past this function.
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
    // Status is left exactly as it was. The invoice is still held, the funds
    // are still the buyer's, and the same confirmation will authorize the
    // retry — whereas a row marked `settled` here would strand held funds
    // behind a record saying they had already been released.
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

  return { ok: true };
}

/**
 * Settles a hold invoice on the strength of the buyer's own confirmation.
 *
 * The seller triggers this, but the seller does not authorize it: the caller
 * supplies a payment hash and nothing else, and the decision to release funds
 * rests entirely on a confirm event that the order's committed buyer signed.
 * A seller who never shipped can call this all day and get a 403.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "settle-hodl-invoice", RATE_LIMIT)) return;

  const body = parseRequestBody(req.body);
  if (!body) {
    return res
      .status(400)
      .json({ error: "Invalid hodl escrow settle request" });
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

  // An early-out, NOT an authorization step: it establishes only that there is
  // an order to talk about, so an unknown payment hash costs a single indexed
  // lookup instead of a ten-second relay fetch. Who is allowed to settle is
  // decided further down, by authorizeHodlConfirmEventForOrder and nothing
  // else — this result is never consulted for that.
  let orderExists: boolean;
  try {
    orderExists = (await getHodlEscrowOrderParties(paymentHash)) !== null;
  } catch (error) {
    console.error(
      `Failed to look up hodl escrow order ${paymentHash}: ${describeFailure(error, paymentHash)}`
    );
    // A failed lookup is not an absent order. Falling through to the
    // `no_such_order` 404 below would tell a seller their escrow does not
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
  // gets to say which events count.
  let candidates: ParsedHodlConfirmEvent[];
  const nostr = createServerNostrManager();
  try {
    candidates = await fetchHodlConfirmEvents({
      nostr,
      paymentHash,
      timeoutMs: RELAY_TIMEOUT_MS,
    });
  } catch (error) {
    console.error(
      `Failed to fetch hodl confirm events for order ${paymentHash}: ${describeFailure(error, paymentHash)}`
    );
    // The relays could not be reached, so the candidate list was never
    // populated. Authorizing against it would find nothing and answer 403 —
    // "no buyer confirmation exists" — about events nobody ever looked for.
    if (error instanceof HodlRelayUnavailableError) {
      const { status, ...body } = UNAVAILABLE_RESPONSES.relay;
      return res.status(status).json(body);
    }
    return res
      .status(502)
      .json({ error: "Failed to look up buyer confirmations" });
  } finally {
    nostr.close();
  }

  let outcome: AuthorizationOutcome;
  try {
    outcome = await authorizeAnyConfirmation(paymentHash, candidates);
  } catch (error) {
    // Only non-authorization failures reach here; see authorizeAnyConfirmation.
    console.error(
      `Failed to authorize hodl confirm events for order ${paymentHash}: ${describeFailure(error, paymentHash)}`
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
      .json({ error: "Failed to authorize buyer confirmation" });
  }
  if (!outcome.ok) {
    const rejection = REJECTION_RESPONSES[outcome.reason];
    return res
      .status(rejection.status)
      .json({ error: rejection.error, reason: outcome.reason });
  }

  const settlement = await settleAuthorizedOrder(
    outcome.confirmation,
    provider
  );
  if (!settlement.ok) {
    // `reason` is omitted rather than sent as undefined, so the 500 and 502
    // bodies stay exactly the single-key shape they have always been.
    return res
      .status(settlement.status)
      .json(
        settlement.reason === undefined
          ? { error: settlement.error }
          : { error: settlement.error, reason: settlement.reason }
      );
  }

  // The whole response. No preimage, no event, no row contents — a seller
  // learns that the invoice settled and nothing else about how it was decided.
  return res.status(200).json({ status: "settled" });
}
