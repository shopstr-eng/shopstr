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
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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

    const results: {
      sellerPubkey: string;
      transferId?: string;
      error?: string;
      skipped?: boolean;
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
            error: "Seller does not have Stripe enabled",
          });
          continue;
        }
        accountId = connectAccount.stripe_account_id;
      }

      try {
        const transfer = await stripe.transfers.create({
          amount: split.amountCents,
          currency: transferCurrency,
          destination: accountId,
          transfer_group: transferGroup,
          metadata: {
            paymentIntentId,
            sellerPubkey: split.sellerPubkey,
          },
        });

        results.push({
          sellerPubkey: split.sellerPubkey,
          transferId: transfer.id,
        });
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
