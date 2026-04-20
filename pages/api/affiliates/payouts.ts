import type { NextApiRequest, NextApiResponse } from "next";
import {
  getAffiliateBalances,
  listPayoutsBySeller,
  listReferralsBySeller,
} from "@/utils/db/affiliates";
import {
  buildAffiliatePayoutsListProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "affiliates-payouts", RATE_LIMIT)) return;

  try {
    const { pubkey } = req.query;
    if (!pubkey || typeof pubkey !== "string") {
      return res.status(400).json({ error: "pubkey required" });
    }
    const v = verifySignedHttpRequestProof(
      extractSignedEventFromRequest(req),
      buildAffiliatePayoutsListProof(pubkey)
    );
    if (!v.ok) return res.status(v.status).json({ error: v.error });

    const [balances, payouts, referrals] = await Promise.all([
      getAffiliateBalances(pubkey),
      listPayoutsBySeller(pubkey),
      listReferralsBySeller(pubkey),
    ]);
    return res.status(200).json({ balances, payouts, referrals });
  } catch (err) {
    console.error("affiliates/payouts error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
