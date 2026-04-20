import type { NextApiRequest, NextApiResponse } from "next";
import {
  computeBuyerDiscountSmallest,
  computeRebateSmallest,
  isAffiliateCodeValid,
  lookupAffiliateCode,
} from "@/utils/db/affiliates";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 240, windowMs: 60 * 1000 };

/**
 * Public buyer-side validation. Given a seller pubkey + code (and optionally
 * a gross subtotal in smallest units), returns whether the code is valid and
 * the buyer-discount preview.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "affiliates-validate", RATE_LIMIT)) return;

  try {
    const { sellerPubkey, code, grossSmallest } = req.query;
    if (!sellerPubkey || !code) {
      return res
        .status(400)
        .json({ valid: false, error: "sellerPubkey and code required" });
    }
    const found = await lookupAffiliateCode(String(sellerPubkey), String(code));
    if (!found) return res.status(200).json({ valid: false });
    if (!(await isAffiliateCodeValid(found))) {
      return res.status(200).json({ valid: false });
    }

    const gross = grossSmallest ? Number(grossSmallest) : 0;
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

    return res.status(200).json({
      valid: true,
      codeId: found.id,
      affiliateId: found.affiliate_id,
      affiliateName: found.affiliate.name,
      buyerDiscountType: found.buyer_discount_type,
      buyerDiscountValue: Number(found.buyer_discount_value),
      buyerDiscountSmallest,
      rebateType: found.rebate_type,
      rebateValue: Number(found.rebate_value),
      rebateSmallest,
      payoutSchedule: found.payout_schedule,
    });
  } catch (err) {
    console.error("affiliates/validate error:", err);
    return res.status(500).json({ valid: false, error: "Internal error" });
  }
}
