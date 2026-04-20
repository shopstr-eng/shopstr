/**
 * Year-to-date payout totals per affiliate, scoped to a seller. Useful for
 * 1099-MISC reporting where US sellers must issue a form for any non-employee
 * paid >= $600 in a calendar year. The endpoint just emits the totals; the
 * 1099 itself is the seller's responsibility (often via Stripe Tax 1099).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getYearToDatePayouts } from "@/utils/db/affiliates";
import {
  buildAffiliatesListProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };
// IRS 1099-NEC threshold for non-employee compensation in a calendar year.
const US_1099_THRESHOLD_CENTS = 60000;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "affiliates-ytd-payouts", RATE_LIMIT)) return;

  const { pubkey, year } = req.query;
  if (!pubkey || typeof pubkey !== "string") {
    return res.status(400).json({ error: "pubkey required" });
  }
  const yr = year ? Number(year) : new Date().getUTCFullYear();
  if (!Number.isInteger(yr) || yr < 2024 || yr > 2100) {
    return res.status(400).json({ error: "Invalid year" });
  }

  // Reuse the affiliates-list proof: scoped to the same seller, same kind of
  // read-only operation so we don't need a new proof type.
  const v = verifySignedHttpRequestProof(
    extractSignedEventFromRequest(req),
    buildAffiliatesListProof(pubkey)
  );
  if (!v.ok) return res.status(v.status).json({ error: v.error });

  try {
    const totals = await getYearToDatePayouts(pubkey, yr);
    const flagged = totals
      .filter(
        (t) =>
          t.currency.toLowerCase() !== "sats" &&
          Number(t.total_smallest) >= US_1099_THRESHOLD_CENTS
      )
      .map((t) => t.affiliate_id);
    return res.status(200).json({
      year: yr,
      totals,
      flaggedFor1099: flagged,
      thresholdCents: US_1099_THRESHOLD_CENTS,
    });
  } catch (err) {
    console.error("affiliates/ytd-payouts error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
