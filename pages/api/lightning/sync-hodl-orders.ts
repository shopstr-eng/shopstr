import type { NextApiRequest, NextApiResponse } from "next";
import { timingSafeEqual } from "crypto";
import { applyRateLimit } from "@/utils/rate-limit";
import { syncAllPendingHodlOrders } from "@/utils/lightning/hodl-status-sync";
import {
  getHodlInvoiceProvider,
  HodlInvoiceProviderUnavailableError,
} from "@/utils/lightning/hodl-invoice-provider-registry";

const RATE_LIMIT = { limit: 10, windowMs: 60 * 1000 };

function isAuthorizedCron(req: NextApiRequest): boolean {
  const configured = process.env.CRON_SECRET;
  if (!configured) return false;

  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return false;

  const presented = Buffer.from(header.substring(7).trim());
  const expected = Buffer.from(configured);
  // Length is compared separately because timingSafeEqual throws on a mismatch
  // rather than returning false.
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
}

/**
 * Sweeps every non-terminal escrow order and reconciles it against the
 * Lightning backend.
 *
 * `open → accepted` is written nowhere else, and `accepted_at` is stamped in
 * that same transition — which the seller dispute timeout is measured from. So
 * without something calling this on a schedule, a seller dispute can never
 * become actionable.
 *
 * {@link syncHodlOrderStatus} runs inline on `hodl-order-status`, which covers
 * any order a party is actively watching. This route exists for the rest: a
 * buyer who closed the tab after paying, or an order whose parties are both
 * offline.
 *
 * Guarded by a shared secret rather than NIP-98 because the caller is a
 * scheduler, not a person — there is no Nostr identity to sign with. Requires
 * `CRON_SECRET`; with it unset the route refuses everything rather than
 * defaulting open.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "sync-hodl-orders", RATE_LIMIT)) return;

  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

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

  let outcomes;
  try {
    outcomes = await syncAllPendingHodlOrders();
  } catch (error) {
    // Per-order failures are already caught and logged inside the sweep, so
    // reaching here means the batch itself could not be started — listing the
    // pending payment hashes failed.
    console.error(
      "Failed to sweep pending hodl escrow orders:",
      error instanceof Error ? error.message : String(error)
    );
    return res.status(503).json({
      error: "Service temporarily unavailable. Please try again.",
      reason: "database_unavailable",
    });
  }

  // Counts only. Payment hashes are unguessable identifiers that authorize a
  // status lookup, so the sweep reports how much work it did and not which
  // orders it did it to.
  const synced = outcomes.filter((outcome) => outcome.ok).length;
  return res.status(200).json({
    total: outcomes.length,
    synced,
    failed: outcomes.length - synced,
  });
}
