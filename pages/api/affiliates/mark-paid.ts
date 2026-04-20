import type { NextApiRequest, NextApiResponse } from "next";
import {
  createPayoutAndSettle,
  getAffiliateById,
  getPayableReferralBundle,
  markReferralsPayableBySchedule,
} from "@/utils/db/affiliates";
import {
  buildAffiliateMarkPaidProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

/**
 * Seller marks a pending balance as settled out-of-band (cash, off-platform
 * transfer, etc). Pulls eligible referrals into a single payout record.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "affiliates-mark-paid", RATE_LIMIT)) return;

  try {
    const { pubkey, affiliateId, amountSmallest, currency, note } =
      req.body ?? {};
    if (!pubkey || !affiliateId || amountSmallest == null || !currency) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const v = verifySignedHttpRequestProof(
      extractSignedEventFromRequest(req),
      buildAffiliateMarkPaidProof({
        pubkey,
        affiliateId: Number(affiliateId),
        amountSmallest: Number(amountSmallest),
        currency,
      })
    );
    if (!v.ok) return res.status(v.status).json({ error: v.error });

    const affiliate = await getAffiliateById(Number(affiliateId));
    if (!affiliate || affiliate.seller_pubkey !== pubkey) {
      return res.status(404).json({ error: "Affiliate not found" });
    }

    // Promote everything pending -> payable so we can settle it as one batch.
    // This is a best-effort: we reuse the by-schedule helper across all cadences
    // because a manual mark-paid implicitly covers anything still pending.
    for (const sched of ["weekly", "biweekly", "monthly"] as const) {
      await markReferralsPayableBySchedule(sched);
    }

    const bundles = await getPayableReferralBundle(Number(affiliateId));
    const matchingBundle = bundles.find((b) => b.currency === currency);
    if (!matchingBundle) {
      return res.status(400).json({ error: "No payable balance for currency" });
    }

    const totalSmallest = Number(matchingBundle.total_smallest);
    if (Number(amountSmallest) > totalSmallest) {
      return res.status(400).json({
        error: `Requested amount exceeds payable balance (${totalSmallest})`,
      });
    }

    // We currently settle the entire bundle when the seller marks paid; partial
    // payouts would require splitting referrals, which is intentionally
    // out-of-scope for the manual workflow.
    const { payoutId } = await createPayoutAndSettle({
      affiliateId: Number(affiliateId),
      sellerPubkey: pubkey,
      method: "manual",
      amountSmallest: totalSmallest,
      currency,
      note: note ?? null,
      referralIds: matchingBundle.referral_ids,
    });

    return res
      .status(200)
      .json({ success: true, payoutId, settledSmallest: totalSmallest });
  } catch (err) {
    console.error("affiliates/mark-paid error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
