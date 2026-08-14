import type { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";
import { syncHodlOrderStatus } from "@/utils/lightning/hodl-status-sync";
import {
  getHodlInvoiceProvider,
  HodlInvoiceProviderUnavailableError,
} from "@/utils/lightning/hodl-invoice-provider-registry";
import {
  DatabaseUnavailableError,
  getHodlEscrowOrderParties,
  type HodlEscrowOrderStatus,
} from "@/utils/db/db-service";

const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };
const HEX_32_BYTE = /^[0-9a-f]{64}$/i;

export type HodlOrderStatusResponse = {
  status: HodlEscrowOrderStatus;
  role: "buyer" | "seller";
};

/**
 * Reads one order's current status for the party it belongs to.
 *
 * The read is deliberately a *sync-then-report*: it calls
 * {@link syncHodlOrderStatus} first, so asking about an order is also what
 * advances it. A buyer watching their own checkout therefore drives the
 * `open → accepted` transition for the order they care about, and the batch
 * sweep in `sync-hodl-orders` only has to cover orders nobody is watching.
 *
 * Everything here is about *reading*: nothing on this route moves money. The
 * settle and resolve endpoints authorize off signed relay events and do not
 * trust anything a client says, so exposing a status to the two parties costs
 * nothing that those routes rely on.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "hodl-order-status", RATE_LIMIT)) return;

  const auth = await verifyNip98Request(req, "GET");
  if (!auth.ok) {
    return res.status(401).json({ error: auth.error });
  }

  const rawPaymentHash = req.query.paymentHash;
  const paymentHash = typeof rawPaymentHash === "string" ? rawPaymentHash : "";
  if (!HEX_32_BYTE.test(paymentHash)) {
    return res.status(400).json({ error: "Invalid payment hash" });
  }
  const normalizedHash = paymentHash.toLowerCase();

  // Resolved before the sync so a missing provider reads as "escrow is
  // unavailable" rather than surfacing from inside the sweep as a generic 500.
  try {
    getHodlInvoiceProvider();
  } catch (error) {
    if (error instanceof HodlInvoiceProviderUnavailableError) {
      console.error("No hodl invoice provider available:", error);
      return res
        .status(503)
        .json({ error: "Lightning escrow is not available" });
    }
    throw error;
  }

  let parties;
  try {
    parties = await getHodlEscrowOrderParties(normalizedHash);
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) {
      return res.status(503).json({
        error: "Service temporarily unavailable. Please try again.",
        reason: "database_unavailable",
      });
    }
    console.error("Failed to look up hodl escrow order parties:", error);
    return res.status(500).json({ error: "Failed to look up escrow order" });
  }

  // A caller who is neither party gets the same answer as a caller asking
  // about a payment hash that was never registered. 403 here would confirm
  // that an order exists — payment hashes are unguessable precisely so that
  // they cannot be enumerated, and a distinguishable response would undo it.
  const role = !parties
    ? null
    : parties.buyerNostrPubkey === auth.pubkey
      ? "buyer"
      : parties.sellerNostrPubkey === auth.pubkey
        ? "seller"
        : null;
  if (!role) {
    return res.status(404).json({ error: "No such escrow order" });
  }

  let status: HodlEscrowOrderStatus | null;
  try {
    status = await syncHodlOrderStatus(normalizedHash);
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) {
      return res.status(503).json({
        error: "Service temporarily unavailable. Please try again.",
        reason: "database_unavailable",
      });
    }
    console.error(
      `Failed to sync hodl escrow order ${normalizedHash}:`,
      error instanceof Error ? error.message : String(error)
    );
    return res.status(502).json({ error: "Failed to look up escrow status" });
  }

  // The row existed a moment ago, so null here means it was deleted between
  // the two reads. Report it the same way as "not yours": the caller has no
  // order to act on either way.
  if (!status) {
    return res.status(404).json({ error: "No such escrow order" });
  }

  const body: HodlOrderStatusResponse = { status, role };
  return res.status(200).json(body);
}
