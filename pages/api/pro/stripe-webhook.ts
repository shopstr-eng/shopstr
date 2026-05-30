import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { applyRateLimit } from "@/utils/rate-limit";
import {
  claimStripeEvent,
  releaseStripeEvent,
} from "@/utils/stripe/processed-events";
import {
  getProStripe,
  isProMembershipSubscription,
} from "@/utils/pro/stripe-pro";
import { withStripeRetry } from "@/utils/stripe/retry-service";
import {
  applyStripeSubscriptionToMembership,
  sendProStripeReceiptEmail,
} from "@/utils/pro/membership";

// Dedicated webhook for the Pro subscription rail on the platform account.
// Separate endpoint + secret from the Connect "Subscribe & Save" webhook.
export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(new Uint8Array(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const RATE_LIMIT = { limit: 300, windowMs: 60_000 };

async function syncSubscriptionById(subscriptionId: string): Promise<void> {
  const subscription = await withStripeRetry(() =>
    getProStripe().subscriptions.retrieve(subscriptionId)
  );
  if (!isProMembershipSubscription(subscription)) return;
  await applyStripeSubscriptionToMembership(subscription);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "pro-stripe-webhook", RATE_LIMIT)) return;

  const webhookSecret = process.env.STRIPE_PRO_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_PRO_WEBHOOK_SECRET not configured");
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await getRawBody(req);
    const sig = req.headers["stripe-signature"] as string;
    event = getProStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Pro webhook signature verification failed:", err);
    return res
      .status(400)
      .json({ error: "Webhook signature verification failed" });
  }

  const claimed = await claimStripeEvent(event.id, event.type);
  if (!claimed) {
    // Already processed — acknowledge so Stripe stops retrying.
    return res.status(200).json({ received: true, deduped: true });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        if (isProMembershipSubscription(subscription)) {
          await applyStripeSubscriptionToMembership(subscription);
        }
        break;
      }
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        const subscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;
        if (subscriptionId) {
          await syncSubscriptionById(subscriptionId);
        }
        // After the membership row reflects the new paid period, email the
        // seller a receipt for the paid invoice. Best-effort (never throws).
        if (event.type === "invoice.payment_succeeded") {
          await sendProStripeReceiptEmail(invoice as Stripe.Invoice);
        }
        break;
      }
      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("pro stripe-webhook handler error:", error);
    // Release the claim so Stripe's retry can reprocess — otherwise the
    // permanent claim would dedup the retry and drop this event forever.
    await releaseStripeEvent(event.id).catch((releaseErr) =>
      console.error("pro stripe-webhook claim release failed:", releaseErr)
    );
    return res.status(500).json({ error: "Webhook handler failed" });
  }
}
