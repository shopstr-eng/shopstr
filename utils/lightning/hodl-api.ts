import { NostrManager } from "@/utils/nostr/nostr-manager";
import { getDefaultRelays, withBlastr } from "@/utils/nostr/relay-config";
import type {
  AuthorizedHodlConfirmation,
  AuthorizedHodlRelease,
} from "@/utils/nostr/server-hodl-escrow-authorization";
import type { HodlInvoiceProvider } from "./hodl-invoice-provider";
import {
  DatabaseUnavailableError,
  getHodlEscrowSettlementSecret,
  markHodlEscrowOrderSettled,
} from "@/utils/db/db-service";

// Requests identify an order; signed relay events and its stored commitment authorize it.
type HodlPaymentHashBody = { paymentHash: string };
const HEX_32_BYTE = /^[0-9a-f]{64}$/i;
const ALLOWED_BODY_KEYS = new Set(["paymentHash"]);
const UNAVAILABLE_RESPONSES = {
  database: {
    status: 503 as const,
    error: "Service temporarily unavailable. Please try again.",
    reason: "database_unavailable",
  },
};

export function parseRequestBody(body: unknown): HodlPaymentHashBody | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  for (const key of Object.keys(body)) {
    if (!ALLOWED_BODY_KEYS.has(key)) return null;
  }

  const value = body as Partial<HodlPaymentHashBody>;
  if (
    typeof value.paymentHash !== "string" ||
    !HEX_32_BYTE.test(value.paymentHash)
  ) {
    return null;
  }

  return { paymentHash: value.paymentHash.toLowerCase() };
}

export function createServerNostrManager(): NostrManager {
  return new NostrManager(withBlastr(getDefaultRelays()), {
    connectionTimeout: 10_000,
    keepAliveTime: 60_000,
    gcInterval: 60_000,
  });
}

const HEX_32_BYTE_RUN = /\b[0-9a-f]{64}\b/gi;

// Never serialize an error object that might contain the settlement secret.
export function describeFailure(error: unknown, paymentHash: string): string {
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
  | { ok: true; status: "settled" }
  | {
      ok: false;
      status: 500 | 502 | 503;
      error: string;

      reason?: string;
    };

// Call only after verifying buyer confirmation or an actionable arbiter ruling.
// LND settles first; durable recovery repairs a subsequent database failure.
export async function settleAuthorizedOrder(
  confirmation: AuthorizedHodlConfirmation | AuthorizedHodlRelease,
  provider: HodlInvoiceProvider
): Promise<SettlementOutcome> {
  const { paymentHash } = confirmation;

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
