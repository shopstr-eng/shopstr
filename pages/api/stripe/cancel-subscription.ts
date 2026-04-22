import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import {
  getSubscriptionByStripeId,
  updateSubscriptionStatus,
} from "@/utils/db/db-service";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-09-30.clover",
});
import { applyRateLimit } from "@/utils/rate-limit";
import {
  buildCancelSubscriptionProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";

// Rate limit: per-IP cap to bound abuse of payment endpoints.
const RATE_LIMIT = { limit: 30, windowMs: 60000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "stripe-cancel-subscription", RATE_LIMIT))
    return;

  try {
    const { subscriptionId, connectedAccountId } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({ error: "Subscription ID is required" });
    }

    const dbSubscription = await getSubscriptionByStripeId(subscriptionId);
    if (!dbSubscription) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    const signedEvent = extractSignedEventFromRequest(req);
    const verification = verifySignedHttpRequestProof(
      signedEvent,
      buildCancelSubscriptionProof({
        pubkey: signedEvent?.pubkey || "",
        subscriptionId,
      })
    );
    if (!verification.ok) {
      return res
        .status(verification.status)
        .json({ error: verification.error });
    }
    const sub = dbSubscription as any;
    const callerPubkey = signedEvent!.pubkey;
    if (
      callerPubkey !== sub.seller_pubkey &&
      callerPubkey !== sub.buyer_pubkey
    ) {
      return res
        .status(403)
        .json({ error: "You do not own this subscription" });
    }

    const stripeOptions = connectedAccountId
      ? { stripeAccount: connectedAccountId }
      : undefined;

    const canceledSubscription = await stripe.subscriptions.update(
      subscriptionId,
      { cancel_at_period_end: true },
      stripeOptions
    );

    await updateSubscriptionStatus(subscriptionId, "canceled");

    const canceledData = canceledSubscription as any;
    return res.status(200).json({
      success: true,
      subscriptionId: canceledData.id,
      status: canceledData.status,
      cancelAtPeriodEnd: canceledData.cancel_at_period_end,
      currentPeriodEnd: canceledData.current_period_end,
    });
  } catch (error) {
    console.error("Stripe subscription cancellation error:", error);
    return res.status(500).json({
      error: "Failed to cancel subscription",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
