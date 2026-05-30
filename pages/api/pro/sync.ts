import type { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import {
  buildProSyncProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";
import { getProStripe } from "@/utils/pro/stripe-pro";
import { withStripeRetry } from "@/utils/stripe/retry-service";
import { getProMembership } from "@/utils/db/pro-membership";
import {
  applyStripeSubscriptionToMembership,
  getMembershipView,
} from "@/utils/pro/membership";

// Belt-and-suspenders activation: after the client confirms the card it can
// call this to pull the latest subscription state from Stripe immediately,
// rather than waiting for the webhook.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "pro-sync", { limit: 30, windowMs: 60_000 }))
    return;

  const { pubkey } = req.body || {};
  if (!pubkey) {
    return res.status(400).json({ error: "pubkey is required" });
  }

  const verification = verifySignedHttpRequestProof(
    extractSignedEventFromRequest(req),
    buildProSyncProof(pubkey)
  );
  if (!verification.ok) {
    return res.status(verification.status).json({ error: verification.error });
  }

  try {
    const membership = await getProMembership(pubkey);
    if (!membership?.stripe_subscription_id) {
      return res.status(404).json({ error: "No subscription on file" });
    }

    const subscription = await withStripeRetry(() =>
      getProStripe().subscriptions.retrieve(
        membership.stripe_subscription_id as string
      )
    );
    await applyStripeSubscriptionToMembership(subscription);

    const view = await getMembershipView(pubkey);
    return res.status(200).json(view);
  } catch (error) {
    console.error("pro sync failed:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to sync",
    });
  }
}
