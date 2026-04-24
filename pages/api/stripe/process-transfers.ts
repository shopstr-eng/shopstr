import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { getStripeConnectAccount } from "@/utils/db/db-service";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-09-30.clover",
});

interface SellerSplit {
  sellerPubkey: string;
  amountCents: number;
  accountId?: string;
  donationPercent?: number;
  donationCutSmallest?: number;
  affiliateRebateSmallest?: number;
  affiliateAccountId?: string | null;
  affiliateId?: number | null;
  affiliateCodeId?: number | null;
  affiliateCode?: string | null;
}
import { applyRateLimit } from "@/utils/rate-limit";
import { withStripeRetry } from "@/utils/stripe/retry-service";
import {
  resolveDonationCut,
  computeDonationCutSmallest,
} from "@/utils/stripe/donation";
import { recordReferral } from "@/utils/db/affiliates";

// Rate limit: per-IP cap to bound abuse of payment endpoints.
const RATE_LIMIT = { limit: 30, windowMs: 60000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "stripe-process-transfers", RATE_LIMIT)) return;

  try {
    const { paymentIntentId, sellerSplits, transferGroup } = req.body as {
      paymentIntentId: string;
      sellerSplits: SellerSplit[];
      transferGroup: string;
    };

    if (!paymentIntentId) {
      return res.status(400).json({ error: "paymentIntentId is required" });
    }
    if (!sellerSplits || sellerSplits.length === 0) {
      return res.status(400).json({ error: "sellerSplits is required" });
    }
    if (!transferGroup) {
      return res.status(400).json({ error: "transferGroup is required" });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== "succeeded") {
      return res.status(400).json({
        error: `Payment has not succeeded yet. Status: ${paymentIntent.status}`,
      });
    }

    const transferCurrency = paymentIntent.currency;
    // Order id used for affiliate idempotency. Fall back to the PI id so we
    // still get a stable unique key even when no orderId metadata was set.
    const orderId =
      (paymentIntent.metadata && paymentIntent.metadata.orderId) ||
      paymentIntentId;

    const results: {
      sellerPubkey: string;
      transferId?: string;
      error?: string;
      skipped?: boolean;
      donationCutSmallest?: number;
      transferredAmount?: number;
      affiliateTransferId?: string;
      affiliateRebateSmallest?: number;
      affiliateAccrued?: boolean;
      affiliateError?: string;
    }[] = [];

    for (const split of sellerSplits) {
      const isPlatformAccount =
        split.sellerPubkey === process.env.NEXT_PUBLIC_MILK_MARKET_PK;

      if (isPlatformAccount) {
        results.push({
          sellerPubkey: split.sellerPubkey,
          skipped: true,
        });
        continue;
      }

      let accountId = split.accountId;
      if (!accountId) {
        const connectAccount = await getStripeConnectAccount(
          split.sellerPubkey
        );
        if (!connectAccount || !connectAccount.charges_enabled) {
          results.push({
            sellerPubkey: split.sellerPubkey,
            error: "Vendor does not have Stripe enabled",
          });
          continue;
        }
        accountId = connectAccount.stripe_account_id;
      }

      // Resolve the donation cut for this seller. Prefer values that the
      // create-payment-intent endpoint already computed and embedded in the
      // split (so on-chain math matches what was charged); fall back to a
      // fresh profile lookup so older clients still get parity.
      let donationCut = 0;
      let donationPercent = 0;
      if (
        typeof split.donationCutSmallest === "number" &&
        split.donationCutSmallest > 0
      ) {
        donationCut = Math.min(
          split.donationCutSmallest,
          split.amountCents - 1
        );
        donationPercent = split.donationPercent ?? 0;
      } else if (
        typeof split.donationPercent === "number" &&
        split.donationPercent > 0
      ) {
        donationPercent = split.donationPercent;
        donationCut = computeDonationCutSmallest(
          split.amountCents,
          donationPercent
        );
      } else {
        const resolved = await resolveDonationCut(
          split.sellerPubkey,
          split.amountCents
        );
        donationPercent = resolved.percent;
        donationCut = resolved.cutSmallest;
      }

      // Affiliate rebate: cap so the seller still keeps at least 1 unit after
      // donation + rebate. The create-payment-intent endpoint already capped
      // this; we re-cap defensively in case process-transfers is called with
      // a stale or hand-rolled payload.
      const requestedRebate = Math.max(split.affiliateRebateSmallest ?? 0, 0);
      const maxAllowedRebate = Math.max(split.amountCents - donationCut - 1, 0);
      const affiliateRebate = Math.min(requestedRebate, maxAllowedRebate);

      const transferAmount = Math.max(
        split.amountCents - donationCut - affiliateRebate,
        0
      );
      if (transferAmount <= 0) {
        results.push({
          sellerPubkey: split.sellerPubkey,
          error:
            "Computed transfer amount is zero after donation cut; skipping",
          donationCutSmallest: donationCut,
          transferredAmount: 0,
        });
        continue;
      }

      try {
        const transfer = await withStripeRetry(() =>
          stripe.transfers.create(
            {
              amount: transferAmount,
              currency: transferCurrency,
              destination: accountId,
              transfer_group: transferGroup,
              metadata: {
                paymentIntentId,
                sellerPubkey: split.sellerPubkey,
                grossAmount: split.amountCents.toString(),
                mmDonationPercent: donationPercent.toString(),
                mmDonationCutSmallest: donationCut.toString(),
              },
            },
            {
              idempotencyKey: `transfer-${paymentIntentId}-${split.sellerPubkey}`,
            }
          )
        );

        const result: (typeof results)[number] = {
          sellerPubkey: split.sellerPubkey,
          transferId: transfer.id,
          donationCutSmallest: donationCut,
          transferredAmount: transferAmount,
          affiliateRebateSmallest: affiliateRebate,
        };

        // Real-time affiliate transfers were removed. Always accrue the
        // rebate server-side via recordReferral so the scheduler can settle
        // it on the configured cadence — this keeps refund clawbacks
        // deterministic. We do this on the server (not the client) so the
        // referral is recorded even if the buyer closes the tab.
        if (affiliateRebate > 0 && split.affiliateId && split.affiliateCodeId) {
          try {
            await recordReferral({
              affiliateId: split.affiliateId,
              codeId: split.affiliateCodeId,
              sellerPubkey: split.sellerPubkey,
              orderId,
              paymentRail: "stripe",
              grossSubtotalSmallest: split.amountCents,
              buyerDiscountSmallest: 0,
              rebateSmallest: affiliateRebate,
              currency: transferCurrency,
              initialStatus: "pending",
              realtimeTransferRef: null,
            });
            result.affiliateAccrued = true;
            result.affiliateRebateSmallest = affiliateRebate;
          } catch (e) {
            result.affiliateError =
              e instanceof Error
                ? e.message
                : "Affiliate referral record failed";
          }
        }

        results.push(result);
      } catch (transferError) {
        console.error(
          `Transfer failed for seller ${split.sellerPubkey}:`,
          transferError
        );
        results.push({
          sellerPubkey: split.sellerPubkey,
          error:
            transferError instanceof Error
              ? transferError.message
              : "Transfer failed",
        });
      }
    }

    const allSucceeded = results.every((r) => r.transferId || r.skipped);

    return res.status(200).json({
      success: allSucceeded,
      results,
    });
  } catch (error) {
    console.error("Process transfers error:", error);
    return res.status(500).json({
      error: "Failed to process transfers",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
