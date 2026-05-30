import type { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import {
  buildProCreateSubscriptionProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";
import {
  ensureProPrice,
  getOrCreateProCustomer,
  getProStripe,
} from "@/utils/pro/stripe-pro";
import {
  withStripeRetry,
  stableIdempotencyKey,
} from "@/utils/stripe/retry-service";
import { syncProStripeMeta } from "@/utils/db/pro-membership";
import { getSellerNotificationEmail } from "@/utils/db/db-service";
import { isProTerm } from "@/utils/pro/constants";

// Starts a Pro subscription on the PLATFORM Stripe account (seller = customer).
// Returns a PaymentIntent client secret for the client to confirm the card.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (
    !applyRateLimit(req, res, "pro-create-subscription", {
      limit: 20,
      windowMs: 60_000,
    })
  )
    return;

  const { pubkey, term, email } = req.body || {};
  if (!pubkey || !isProTerm(term)) {
    return res.status(400).json({
      error: "pubkey and a valid term (monthly|yearly) are required",
    });
  }

  const verification = verifySignedHttpRequestProof(
    extractSignedEventFromRequest(req),
    buildProCreateSubscriptionProof({ pubkey, term })
  );
  if (!verification.ok) {
    return res.status(verification.status).json({ error: verification.error });
  }

  try {
    const stripe = getProStripe();
    const priceId = await ensureProPrice(term);
    const sellerEmail =
      typeof email === "string" && email
        ? email
        : await getSellerNotificationEmail(pubkey);
    const customerId = await getOrCreateProCustomer(pubkey, sellerEmail);

    const subscription = await withStripeRetry(() =>
      stripe.subscriptions.create(
        {
          customer: customerId,
          items: [{ price: priceId }],
          payment_behavior: "default_incomplete",
          payment_settings: {
            save_default_payment_method: "on_subscription",
          },
          expand: ["latest_invoice.payment_intent"],
          metadata: { proMembership: "true", mmProPubkey: pubkey, term },
        },
        {
          idempotencyKey: stableIdempotencyKey("pro-sub-create", {
            pubkey,
            term,
          }),
        }
      )
    );

    // Record pending metadata only — no entitlement until the first invoice
    // is paid (handled by the webhook / sync).
    await syncProStripeMeta({
      pubkey,
      customerId,
      subscriptionId: subscription.id,
      baseStatus: subscription.status,
      term,
      cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
    });

    const latestInvoice = subscription.latest_invoice as any;
    const paymentIntent = latestInvoice?.payment_intent;

    return res.status(200).json({
      subscriptionId: subscription.id,
      clientSecret: paymentIntent?.client_secret ?? null,
    });
  } catch (error) {
    console.error("pro create-subscription failed:", error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to create subscription",
    });
  }
}
