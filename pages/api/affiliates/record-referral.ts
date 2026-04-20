import type { NextApiRequest, NextApiResponse } from "next";
import {
  computeBuyerDiscountSmallest,
  computeRebateSmallest,
  isAffiliateCodeValid,
  isSelfReferral,
  lookupAffiliateCode,
  recordReferral,
} from "@/utils/db/affiliates";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 120, windowMs: 60 * 1000 };

/**
 * Called by the cart/checkout flow after a successful order to attribute the
 * sale to an affiliate code. We compute rebate + discount server-side so the
 * client cannot inflate either.
 *
 * Real-time payouts were removed; all referrals start as 'pending' and are
 * promoted to 'payable' by the scheduled cron once they age past the hold
 * window for their code's payout schedule.
 *
 * This endpoint is a best-effort backstop for buyer-driven flows (e.g.
 * Cashu). The Stripe path also records referrals server-side from
 * process-transfers / webhook so the attribution survives a closed tab.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "affiliates-record-referral", RATE_LIMIT))
    return;

  try {
    // Accept both `grossSmallest` (legacy cart payload) and
    // `grossSubtotalSmallest` (server payload) as aliases.
    const {
      sellerPubkey,
      code,
      orderId,
      paymentRail,
      grossSubtotalSmallest,
      grossSmallest,
      currency,
    } = req.body ?? {};
    const gross = Number(grossSubtotalSmallest ?? grossSmallest);

    if (
      !sellerPubkey ||
      !code ||
      !orderId ||
      !paymentRail ||
      !Number.isFinite(gross) ||
      !currency
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const found = await lookupAffiliateCode(sellerPubkey, code);
    if (!found || !(await isAffiliateCodeValid(found))) {
      return res.status(400).json({ error: "Invalid affiliate code" });
    }

    // Currency guard for fixed-amount codes: a $10 fixed discount priced in
    // USD cannot be silently applied to a sats invoice. Percent codes are
    // currency-agnostic so they still pass here.
    if (
      found.currency &&
      String(currency).toLowerCase() !== found.currency.toLowerCase() &&
      (found.buyer_discount_type === "fixed" || found.rebate_type === "fixed")
    ) {
      return res
        .status(400)
        .json({ error: "Affiliate code currency does not match order" });
    }

    // Block obvious self-referral abuse — a seller claiming their own
    // affiliate code as the buyer to siphon the platform's rebate share.
    if (
      found.affiliate &&
      isSelfReferral(sellerPubkey, found.affiliate.affiliate_pubkey)
    ) {
      return res.status(400).json({ error: "Self-referral is not allowed" });
    }

    const buyerDiscountSmallest = computeBuyerDiscountSmallest(
      gross,
      found.buyer_discount_type,
      Number(found.buyer_discount_value)
    );
    const net = Math.max(gross - buyerDiscountSmallest, 0);
    const rebateSmallest = computeRebateSmallest(
      net,
      found.rebate_type,
      Number(found.rebate_value)
    );

    // recordReferral handles atomic max_uses enforcement + idempotency. If
    // the code is full or inactive it throws; we surface that as 409.
    let referral;
    try {
      referral = await recordReferral({
        affiliateId: found.affiliate_id,
        codeId: found.id,
        sellerPubkey,
        orderId: String(orderId),
        paymentRail,
        grossSubtotalSmallest: gross,
        buyerDiscountSmallest,
        rebateSmallest,
        currency,
        initialStatus: "pending",
        realtimeTransferRef: null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "record-referral failed";
      return res.status(409).json({ error: msg });
    }

    return res.status(200).json({
      success: true,
      referralId: referral.id,
      buyerDiscountSmallest,
      rebateSmallest,
    });
  } catch (err) {
    console.error("affiliates/record-referral error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
