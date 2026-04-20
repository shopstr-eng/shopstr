/**
 * Affiliate self-service stats endpoint. Authenticated by the same invite
 * token the affiliate uses for `/affiliate/[token]`. Returns balances and
 * recent payouts for the holder of the link, with sensitive details masked
 * the same way `/api/affiliates/claim` does.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import {
  getAffiliateBalancesByToken,
  listRecentPayoutsForAffiliate,
} from "@/utils/db/affiliates";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "affiliates-self-stats", RATE_LIMIT)) return;

  const { token } = req.query;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "token required" });
  }

  try {
    const result = await getAffiliateBalancesByToken(token);
    if (!result) return res.status(404).json({ error: "Invite not found" });
    const payouts = await listRecentPayoutsForAffiliate(result.affiliate.id);
    return res.status(200).json({
      affiliateId: result.affiliate.id,
      name: result.affiliate.name,
      payoutsEnabled: result.affiliate.payouts_enabled,
      lastFailureReason: result.affiliate.last_payout_failure_reason,
      lastFailureAt: result.affiliate.last_payout_failure_at,
      balances: result.balances,
      payouts,
    });
  } catch (err) {
    console.error("affiliates/self-stats error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
