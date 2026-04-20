import type { NextApiRequest, NextApiResponse } from "next";
import {
  getAffiliateByInviteToken,
  updateAffiliatePayoutMethod,
} from "@/utils/db/affiliates";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

/**
 * Affiliate self-service: load the affiliate record by invite token (GET) or
 * update payout destination + claim with their own pubkey (POST).
 *
 * Authorization model: knowledge of the invite token is the credential. Once
 * claimed (affiliate_pubkey set), updates require the same pubkey to be
 * supplied in the body — the invite token effectively becomes a personal
 * settings URL the affiliate keeps private.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!applyRateLimit(req, res, "affiliates-claim", RATE_LIMIT)) return;

  try {
    if (req.method === "GET") {
      const { token } = req.query;
      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "token required" });
      }
      const a = await getAffiliateByInviteToken(token);
      if (!a) return res.status(404).json({ error: "Invite not found" });
      return res.status(200).json({
        id: a.id,
        seller_pubkey: a.seller_pubkey,
        name: a.name,
        email: a.email,
        affiliate_pubkey: a.affiliate_pubkey,
        invite_claimed_at: a.invite_claimed_at,
        lightning_address: a.lightning_address,
        stripe_account_id: a.stripe_account_id,
      });
    }

    if (req.method === "POST") {
      const { token, affiliatePubkey, lightningAddress, stripeAccountId } =
        req.body ?? {};
      if (!token) return res.status(400).json({ error: "token required" });
      const existing = await getAffiliateByInviteToken(String(token));
      if (!existing) return res.status(404).json({ error: "Invite not found" });
      if (
        existing.affiliate_pubkey &&
        affiliatePubkey &&
        existing.affiliate_pubkey !== affiliatePubkey
      ) {
        return res
          .status(403)
          .json({ error: "Invite already claimed by another pubkey" });
      }
      const updated = await updateAffiliatePayoutMethod(String(token), {
        affiliatePubkey: affiliatePubkey ?? existing.affiliate_pubkey ?? null,
        lightningAddress: lightningAddress ?? null,
        stripeAccountId: stripeAccountId ?? null,
      });
      return res.status(200).json(updated);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("affiliates/claim error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
