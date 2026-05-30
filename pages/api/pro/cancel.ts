import type { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import {
  buildProCancelProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";
import { getProStripe } from "@/utils/pro/stripe-pro";
import { withStripeRetry } from "@/utils/stripe/retry-service";
import {
  getProMembership,
  setProMembershipCancel,
} from "@/utils/db/pro-membership";
import { getMembershipView } from "@/utils/pro/membership";

// Cancel a Pro membership. Stripe subscriptions cancel at period end (the
// seller keeps access until then, then lapses naturally). Manual memberships
// simply won't renew.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "pro-cancel", { limit: 20, windowMs: 60_000 }))
    return;

  const { pubkey } = req.body || {};
  if (!pubkey) {
    return res.status(400).json({ error: "pubkey is required" });
  }

  const verification = verifySignedHttpRequestProof(
    extractSignedEventFromRequest(req),
    buildProCancelProof(pubkey)
  );
  if (!verification.ok) {
    return res.status(verification.status).json({ error: verification.error });
  }

  try {
    const membership = await getProMembership(pubkey);
    if (!membership) {
      return res.status(404).json({ error: "No membership on file" });
    }

    if (membership.stripe_subscription_id) {
      await withStripeRetry(() =>
        getProStripe().subscriptions.update(
          membership.stripe_subscription_id as string,
          { cancel_at_period_end: true }
        )
      );
    }

    await setProMembershipCancel(pubkey, true);

    const view = await getMembershipView(pubkey);
    return res.status(200).json({
      ...view,
      message:
        membership.billing_method === "manual"
          ? "Your manual Pro plan won't renew. Access continues until the current period ends."
          : "Your Pro subscription will end when the current period ends.",
    });
  } catch (error) {
    console.error("pro cancel failed:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to cancel",
    });
  }
}
