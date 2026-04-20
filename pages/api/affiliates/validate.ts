import type { NextApiRequest, NextApiResponse } from "next";
import {
  computeBuyerDiscountSmallest,
  computeRebateSmallest,
  isAffiliateCodeValid,
  lookupAffiliateCode,
} from "@/utils/db/affiliates";
import { applyRateLimit } from "@/utils/rate-limit";

// Lower than the seller-authenticated endpoints because this one is
// unauthenticated and would otherwise be a convenient enumeration oracle for
// guessing valid codes. 60/min is still ample for the cart UX.
const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

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
    const { sellerPubkey, code, grossSmallest, currency } = req.query;
    if (!sellerPubkey || !code) {
      // Uniform shape with the not-found case to avoid leaking which inputs
      // the endpoint accepts vs. rejects.
      return res.status(200).json({ valid: false });
    }
    const found = await lookupAffiliateCode(String(sellerPubkey), String(code));
    if (!found) return res.status(200).json({ valid: false });
    if (!(await isAffiliateCodeValid(found))) {
      return res.status(200).json({ valid: false });
    }
    // Currency guard: a fixed-amount code stored in one currency cannot be
    // safely applied to an order in a different currency (e.g. a $5 code
    // applied to a sats invoice would shave off 5 sats). For percent codes
    // this is currency-agnostic so we still allow it.
    if (
      typeof currency === "string" &&
      found.currency &&
      found.currency.toLowerCase() !== currency.toLowerCase() &&
      (found.buyer_discount_type === "fixed" || found.rebate_type === "fixed")
    ) {
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
