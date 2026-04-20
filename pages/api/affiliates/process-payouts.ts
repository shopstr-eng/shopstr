import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { LightningAddress } from "@getalby/lightning-tools";
import {
  createPayoutAndSettle,
  getAffiliateById,
  getPayableReferralBundle,
  markReferralsPayableBySchedule,
  PayoutSchedule,
} from "@/utils/db/affiliates";
import { getDbPool } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 12, windowMs: 60 * 1000 };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-09-30.clover",
});

/**
 * Cron-driven affiliate payout processor.
 *
 * Trigger by cron (e.g. once per hour) with `?schedule=daily|weekly|monthly`.
 * `every_sale` is normally handled inline by the Stripe transfer hook, but
 * any leftover (e.g. bitcoin orders without an inline LN payout) will also
 * be picked up here.
 *
 * Authorization: requires the `AFFILIATE_PAYOUT_CRON_SECRET` env to match
 * an `Authorization: Bearer ...` header. This keeps the endpoint usable from
 * scheduler infrastructure without requiring a Nostr signature.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "affiliates-process-payouts", RATE_LIMIT))
    return;

  const expected = process.env.AFFILIATE_PAYOUT_CRON_SECRET;
  if (!expected) {
    return res
      .status(500)
      .json({ error: "AFFILIATE_PAYOUT_CRON_SECRET not configured" });
  }
  const authHeader = req.headers.authorization || "";
  if (authHeader !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const schedule = (req.query.schedule as string) || "daily";
    if (!["every_sale", "daily", "weekly", "monthly"].includes(schedule)) {
      return res.status(400).json({ error: "Invalid schedule" });
    }

    // 1. Promote all pending referrals on this schedule to "payable" so they
    //    show up in the bundle.
    await markReferralsPayableBySchedule(schedule as PayoutSchedule);

    // 2. Walk every affiliate that has any payable balance and try to settle.
    const pool = getDbPool();
    const client = await pool.connect();
    let affiliateIds: number[] = [];
    try {
      const r = await client.query(
        `SELECT DISTINCT affiliate_id FROM affiliate_referrals WHERE status = 'payable'`
      );
      affiliateIds = r.rows.map((row) => row.affiliate_id as number);
    } finally {
      client.release();
    }

    const results: Array<{
      affiliateId: number;
      currency: string;
      method: string;
      success: boolean;
      amountSmallest?: number;
      payoutId?: number;
      error?: string;
    }> = [];

    for (const affiliateId of affiliateIds) {
      const affiliate = await getAffiliateById(affiliateId);
      if (!affiliate) continue;

      const bundles = await getPayableReferralBundle(affiliateId);
      for (const bundle of bundles) {
        const total = Number(bundle.total_smallest);
        if (total <= 0) continue;

        // Pick the right rail per bundle currency. Sats stay on lightning.
        // Fiat goes through Stripe Connect when configured.
        const isSats = bundle.currency.toLowerCase() === "sats";
        const useLightning = isSats && !!affiliate.lightning_address;
        const useStripe =
          !isSats &&
          !!affiliate.stripe_account_id &&
          !!process.env.STRIPE_SECRET_KEY;

        if (useLightning) {
          try {
            const ln = new LightningAddress(affiliate.lightning_address!);
            await ln.fetch();
            const invoice = await ln.requestInvoice({ satoshi: total });
            // The platform itself does not (yet) hold a hot wallet here; we
            // record the invoice id as the external_ref and mark the payout
            // as paid only when the seller's NWC actually settles it. For
            // now, store the bolt11 and let the seller pay it out-of-band
            // by clicking "Mark paid" with the invoice as a note.
            results.push({
              affiliateId,
              currency: bundle.currency,
              method: "lightning",
              success: false,
              error: `Lightning payout requires manual settlement; invoice: ${invoice.paymentRequest}`,
            });
          } catch (err) {
            results.push({
              affiliateId,
              currency: bundle.currency,
              method: "lightning",
              success: false,
              error:
                err instanceof Error
                  ? err.message
                  : "Lightning invoice fetch failed",
            });
          }
        } else if (useStripe) {
          try {
            const transfer = await stripe.transfers.create(
              {
                amount: total,
                currency: bundle.currency.toLowerCase(),
                destination: affiliate.stripe_account_id!,
                metadata: {
                  affiliateId: String(affiliateId),
                  scheduledPayout: "true",
                  schedule,
                },
              },
              {
                idempotencyKey: `affiliate-payout-${affiliateId}-${Date.now()}`,
              }
            );
            const { payoutId } = await createPayoutAndSettle({
              affiliateId,
              sellerPubkey: bundle.seller_pubkey,
              method: "stripe",
              amountSmallest: total,
              currency: bundle.currency,
              externalRef: transfer.id,
              referralIds: bundle.referral_ids,
            });
            results.push({
              affiliateId,
              currency: bundle.currency,
              method: "stripe",
              success: true,
              amountSmallest: total,
              payoutId,
            });
          } catch (err) {
            results.push({
              affiliateId,
              currency: bundle.currency,
              method: "stripe",
              success: false,
              error:
                err instanceof Error ? err.message : "Stripe transfer failed",
            });
          }
        } else {
          // No payout method connected — accrue silently for the seller to
          // settle out-of-band. Leave referrals in 'payable' so they show up
          // on the seller dashboard as "ready to pay".
          results.push({
            affiliateId,
            currency: bundle.currency,
            method: "manual",
            success: true,
            amountSmallest: total,
          });
        }
      }
    }

    return res.status(200).json({ schedule, processed: results });
  } catch (err) {
    console.error("affiliates/process-payouts error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
