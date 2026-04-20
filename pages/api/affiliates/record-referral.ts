import type { NextApiRequest, NextApiResponse } from "next";
import {
  computeBuyerDiscountSmallest,
  computeRebateSmallest,
  incrementAffiliateCodeUsage,
  isAffiliateCodeValid,
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
 * `realtimeTransferRef` is set when the payment rail already paid the
 * affiliate inline (Stripe Connect transfer for an "every_sale" code). In
 * that case we record the referral as `paid` straight away.
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
    const {
      sellerPubkey,
      code,
      orderId,
      paymentRail,
      grossSubtotalSmallest,
      currency,
      realtimeTransferRef,
    } = req.body ?? {};

    if (
      !sellerPubkey ||
      !code ||
      !orderId ||
      !paymentRail ||
      grossSubtotalSmallest == null ||
      !currency
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const found = await lookupAffiliateCode(sellerPubkey, code);
    if (!found || !(await isAffiliateCodeValid(found))) {
      return res.status(400).json({ error: "Invalid affiliate code" });
    }

    const gross = Number(grossSubtotalSmallest);
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

    const initialStatus = realtimeTransferRef ? "paid" : "pending";

    const referral = await recordReferral({
      affiliateId: found.affiliate_id,
      codeId: found.id,
      sellerPubkey,
      orderId: String(orderId),
      paymentRail,
      grossSubtotalSmallest: gross,
      buyerDiscountSmallest,
      rebateSmallest,
      currency,
      initialStatus,
      realtimeTransferRef: realtimeTransferRef ?? null,
    });
    await incrementAffiliateCodeUsage(found.id);

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
