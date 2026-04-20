/**
 * Seller-driven manual reversal of an affiliate referral. Lightning/Cashu
 * orders that the seller refunds out-of-band have no Stripe webhook to fire
 * `reverseReferralsForOrder` automatically, so the seller dashboard exposes
 * a button that calls this endpoint with `(orderId, sellerPubkey)`.
 *
 * Behavior matches the Stripe webhook path: still-pending rebates are
 * cancelled in full or scaled to the partial-refund ratio; already-paid
 * rebates have the proportional clawback recorded for out-of-band
 * reconciliation.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { reverseReferralsForOrder } from "@/utils/db/affiliates";
import {
  buildAffiliateReverseReferralProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "affiliates-reverse-referral", RATE_LIMIT))
    return;

  try {
    const {
      pubkey,
      orderId,
      sellerPubkey,
      originalGrossSmallest,
      refundedSmallest,
      note,
    } = req.body ?? {};

    if (
      !pubkey ||
      !orderId ||
      typeof orderId !== "string" ||
      !sellerPubkey ||
      typeof sellerPubkey !== "string"
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (pubkey !== sellerPubkey) {
      // The signing pubkey must match the seller whose referrals are being
      // reversed; otherwise a seller could reverse a competitor's referrals.
      return res.status(403).json({ error: "Pubkey/seller mismatch" });
    }

    const v = verifySignedHttpRequestProof(
      extractSignedEventFromRequest(req),
      buildAffiliateReverseReferralProof({
        pubkey,
        orderId,
        sellerPubkey,
      })
    );
    if (!v.ok) return res.status(v.status).json({ error: v.error });

    const result = await reverseReferralsForOrder({
      orderId,
      sellerPubkey,
      originalGrossSmallest:
        typeof originalGrossSmallest === "number"
          ? originalGrossSmallest
          : undefined,
      refundedSmallest:
        typeof refundedSmallest === "number" ? refundedSmallest : undefined,
      refundEventRef:
        typeof note === "string" && note.length <= 256
          ? `manual:${note}`
          : "manual",
    });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("affiliates/reverse-referral error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
