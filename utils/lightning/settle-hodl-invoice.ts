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
import { schedulePayoutToSeller } from "@/utils/lightning/hodl-seller-payout";
import {
  DatabaseUnavailableError,
  getHodlEscrowOrderParties,
} from "@/utils/db/db-service";

const RELAY_TIMEOUT_MS = 10_000;

type SettleRejectionReason = HodlAuthorizationFailureReason | "no_confirmation";

type AuthorizationOutcome =
  | { ok: true; confirmation: AuthorizedHodlConfirmation }
  | { ok: false; reason: SettleRejectionReason };

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

export async function executeHodlSettlement(paymentHash: string) {
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
    if (error instanceof HodlRelayUnavailableError) {
      const { status, ...body } = UNAVAILABLE_RESPONSES.relay;
      return respond(status, body);
    }
    return respond(502, { error: "Failed to look up buyer confirmations" });
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
    if (error instanceof DatabaseUnavailableError) {
      const { status, ...body } = UNAVAILABLE_RESPONSES.database;
      return respond(status, body);
    }
    return respond(500, { error: "Failed to authorize buyer confirmation" });
  }
  if (!outcome.ok) {
    const rejection = REJECTION_RESPONSES[outcome.reason];
    return respond(rejection.status, {
      error: rejection.error,
      reason: outcome.reason,
    });
  }

  const settlement = await settleAuthorizedOrder(
    outcome.confirmation,
    provider
  );
  if (!settlement.ok) {
    // `reason` is omitted rather than sent as undefined, so the 500 and 502
    // bodies stay exactly the single-key shape they have always been.
    return respond(
      settlement.status,
      settlement.reason === undefined
        ? { error: settlement.error }
        : { error: settlement.error, reason: settlement.reason }
    );
  }

  schedulePayoutToSeller(paymentHash);

  // The whole response. No preimage, no event, no row contents — a seller
  // learns that the invoice settled and nothing else about how it was decided.
  return respond(200, { status: "settled" });
}
