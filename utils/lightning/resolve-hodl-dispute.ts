const respond = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  body,
});
import {
  createServerNostrManager,
  describeFailure,
  settleAuthorizedOrder,
} from "@/utils/lightning/hodl-api";
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
  getServerArbiterGiftWrapDecryptor,
  HodlArbiterKeyUnavailableError,
} from "@/utils/nostr/server-hodl-arbiter-decryptor";
import {
  getHodlInvoiceProvider,
  HodlInvoiceProviderUnavailableError,
} from "@/utils/lightning/hodl-invoice-provider-registry";
import type { HodlInvoiceProvider } from "@/utils/lightning/hodl-invoice-provider";
import { schedulePayoutToSeller } from "@/utils/lightning/hodl-seller-payout";
import {
  DatabaseUnavailableError,
  getHodlEscrowOrderParties,
  markHodlEscrowOrderCancelled,
} from "@/utils/db/db-service";

const RELAY_TIMEOUT_MS = 10_000;

type ResolveRejectionReason =
  HodlAuthorizationFailureReason | "no_release_event";

type DisputeGateRejectionReason =
  "no_actionable_dispute" | "dispute_not_yet_actionable";

type AuthorizationOutcome =
  | { ok: true; release: AuthorizedHodlRelease }
  | { ok: false; reason: ResolveRejectionReason };

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
  disputeRelay: {
    status: 503 as const,
    error:
      "Could not reach relays to check for a dispute on this order. Please try again.",
    reason: "relay_unavailable" as const,
  },
  arbiterKey: {
    status: 503 as const,
    error:
      "Escrow dispute resolution is not configured on this server. Please try again later.",
    reason: "arbiter_key_unavailable" as const,
  },
};

type DisputeGateOutcome =
  | { ok: true }
  | { ok: false; reason: "no_actionable_dispute" }
  | {
      ok: false;
      reason: "dispute_not_yet_actionable";

      remainingSeconds: number;
    };

async function requireActionableDispute(
  release: AuthorizedHodlRelease
): Promise<DisputeGateOutcome> {
  const { paymentHash, arbiterNostrPubkey } = release;

  // Built before the fetch so a missing key fails as "we could not check"
  // rather than as an empty candidate list.
  const decryptor = getServerArbiterGiftWrapDecryptor(arbiterNostrPubkey);

  let candidates: ParsedHodlDisputeEvent[];
  const nostr = createServerNostrManager();
  try {
    candidates = await fetchHodlDisputeEvents({
      nostr,
      arbiterPubkey: arbiterNostrPubkey,
      decryptor,
      timeoutMs: RELAY_TIMEOUT_MS,
    });
  } finally {
    nostr.close();
  }

  let soonestRemainingSeconds: number | null = null;

  for (const candidate of candidates) {
    if (candidate.orderId !== paymentHash) continue;

    let actionability: HodlDisputeActionability;
    try {
      actionability = await evaluateHodlDisputeActionability(
        paymentHash,
        candidate
      );
    } catch (error) {
      if (!(error instanceof HodlDisputeActionabilityError)) throw error;
      if (error.reason === "no_such_order") throw error;
      continue;
    }

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

      reason?: string;
    };

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

export async function executeHodlResolution(paymentHash: string) {
  let provider;
  try {
    provider = getHodlInvoiceProvider();
  } catch (error) {
    if (error instanceof HodlInvoiceProviderUnavailableError) {
      console.error(
        `No hodl invoice provider available: ${describeFailure(error, paymentHash)}`
      );
      return respond(503, { error: "Lightning escrow is not available" });
    }
    throw error;
  }

  let orderExists: boolean;
  try {
    orderExists = (await getHodlEscrowOrderParties(paymentHash)) !== null;
  } catch (error) {
    console.error(
      `Failed to look up hodl escrow order ${paymentHash}: ${describeFailure(error, paymentHash)}`
    );
    if (error instanceof DatabaseUnavailableError) {
      const { status, ...body } = UNAVAILABLE_RESPONSES.database;
      return respond(status, body);
    }
    return respond(500, { error: "Failed to look up escrow order" });
  }
  if (!orderExists) {
    const rejection = REJECTION_RESPONSES.no_such_order;
    return respond(rejection.status, {
      error: rejection.error,
      reason: "no_such_order",
    });
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
    if (error instanceof HodlRelayUnavailableError) {
      const { status, ...body } = UNAVAILABLE_RESPONSES.relay;
      return respond(status, body);
    }
    return respond(502, { error: "Failed to look up arbiter rulings" });
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
    if (error instanceof DatabaseUnavailableError) {
      const { status, ...body } = UNAVAILABLE_RESPONSES.database;
      return respond(status, body);
    }
    return respond(500, { error: "Failed to authorize arbiter ruling" });
  }
  if (!outcome.ok) {
    const rejection = REJECTION_RESPONSES[outcome.reason];
    return respond(rejection.status, {
      error: rejection.error,
      reason: outcome.reason,
    });
  }

  let gate: DisputeGateOutcome;
  try {
    gate = await requireActionableDispute(outcome.release);
  } catch (error) {
    console.error(
      `Failed to check for an actionable dispute on order ${paymentHash}: ${describeFailure(error, paymentHash)}`
    );
    if (error instanceof HodlRelayUnavailableError) {
      const { status, ...body } = UNAVAILABLE_RESPONSES.disputeRelay;
      return respond(status, body);
    }
    if (error instanceof HodlArbiterKeyUnavailableError) {
      const { status, ...body } = UNAVAILABLE_RESPONSES.arbiterKey;
      return respond(status, body);
    }
    if (error instanceof DatabaseUnavailableError) {
      const { status, ...body } = UNAVAILABLE_RESPONSES.database;
      return respond(status, body);
    }
    // The commitment row vanished between authorizing the ruling and reading
    // the dispute context.
    if (
      error instanceof HodlDisputeActionabilityError &&
      error.reason === "no_such_order"
    ) {
      const rejection = REJECTION_RESPONSES.no_such_order;
      return respond(rejection.status, {
        error: rejection.error,
        reason: "no_such_order",
      });
    }
    return respond(500, { error: "Failed to check for an actionable dispute" });
  }
  if (!gate.ok) {
    const rejection = REJECTION_RESPONSES[gate.reason];
    // `remainingSeconds` rides along only where it means something, so the
    // other rejection bodies keep the exact shape they have always had.
    return respond(
      rejection.status,
      gate.reason === "dispute_not_yet_actionable"
        ? {
            error: rejection.error,
            reason: gate.reason,
            remainingSeconds: gate.remainingSeconds,
          }
        : { error: rejection.error, reason: gate.reason }
    );
  }

  // Both authorization and the dispute waiting-period gate must pass before money moves.
  const resolution =
    outcome.release.decision === "release:seller"
      ? await settleAuthorizedOrder(outcome.release, provider)
      : await cancelForBuyer(outcome.release, provider);

  if (!resolution.ok) {
    // `reason` is omitted rather than sent as undefined, so the 500 and 502
    // bodies stay exactly the single-key shape they have always been.
    return respond(
      resolution.status,
      resolution.reason === undefined
        ? { error: resolution.error }
        : { error: resolution.error, reason: resolution.reason }
    );
  }

  if (resolution.status === "settled") {
    schedulePayoutToSeller(paymentHash);
  }

  return respond(200, { status: resolution.status });
}
