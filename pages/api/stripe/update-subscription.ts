import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import {
  getSubscriptionByStripeId,
  updateSubscriptionShippingAddress,
  updateSubscriptionBillingDate,
} from "@/utils/db/db-service";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-09-30.clover",
});
import { applyRateLimit } from "@/utils/rate-limit";

// Rate limit: per-IP cap to bound abuse of payment endpoints.
const RATE_LIMIT = { limit: 30, windowMs: 60000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "stripe-update-subscription", RATE_LIMIT))
    return;

  try {
    const {
      subscriptionId,
      connectedAccountId,
      shippingAddress,
      nextBillingDate,
    } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({ error: "Subscription ID is required" });
    }

    const dbSubscription = await getSubscriptionByStripeId(subscriptionId);
    if (!dbSubscription) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    const stripeOptions = connectedAccountId
      ? { stripeAccount: connectedAccountId }
      : undefined;

    if (shippingAddress) {
      await updateSubscriptionShippingAddress(subscriptionId, shippingAddress);
    }

    if (nextBillingDate) {
      const billingTimestamp = Math.floor(
        new Date(nextBillingDate).getTime() / 1000
      );

      await stripe.subscriptions.update(
        subscriptionId,
        { trial_end: billingTimestamp, proration_behavior: "none" },
        stripeOptions
      );

      const billingDate = new Date(nextBillingDate);
      await updateSubscriptionBillingDate(
        subscriptionId,
        billingDate,
        billingDate
      );
    }

    const updatedSubscription = (await stripe.subscriptions.retrieve(
      subscriptionId,
      stripeOptions
    )) as any;

    return res.status(200).json({
      success: true,
      subscriptionId: updatedSubscription.id,
      status: updatedSubscription.status,
      currentPeriodEnd: updatedSubscription.current_period_end,
    });
  } catch (error) {
    console.error("Stripe subscription update error:", error);
    return res.status(500).json({
      error: "Failed to update subscription",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
