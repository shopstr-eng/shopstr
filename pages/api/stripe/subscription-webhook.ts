import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import {
  getSubscriptionByStripeId,
  updateSubscriptionStatus,
  updateSubscriptionBillingDate,
  createSubscriptionNotification,
} from "@/utils/db/db-service";
import {
  sendRenewalReminder,
  sendSubscriptionCancellation,
} from "@/utils/email/email-service";
import { sendServerSideNostrDM } from "@/utils/nostr/server-nostr-helpers";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-09-30.clover",
});

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function formatFrequencyLabel(frequency: string): string {
  const map: Record<string, string> = {
    weekly: "Weekly",
    every_2_weeks: "Every 2 Weeks",
    monthly: "Monthly",
    every_2_months: "Every 2 Months",
    quarterly: "Quarterly",
  };
  return map[frequency] || frequency;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const webhookSecret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_SUBSCRIPTION_WEBHOOK_SECRET not configured");
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  let event: Stripe.Event;

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers["stripe-signature"] as string;
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  try {
    switch (event.type) {
      case "invoice.upcoming": {
        const invoiceUpcoming = event.data.object as any;
        const stripeSubscriptionId =
          typeof invoiceUpcoming.subscription === "string"
            ? invoiceUpcoming.subscription
            : invoiceUpcoming.subscription?.id;

        if (!stripeSubscriptionId) break;

        const subscription =
          await getSubscriptionByStripeId(stripeSubscriptionId);
        if (!subscription) break;

        const nextBillingDate = subscription.next_billing_date
          ? new Date(subscription.next_billing_date).toLocaleDateString(
              "en-US",
              {
                year: "numeric",
                month: "long",
                day: "numeric",
              }
            )
          : "Upcoming";

        await sendRenewalReminder(subscription.buyer_email, {
          productTitle:
            subscription.product_title || subscription.product_event_id,
          frequency: subscription.frequency,
          discountPercent: Number(subscription.discount_percent),
          regularPrice: String(subscription.base_price),
          subscriptionPrice: String(subscription.subscription_price),
          currency: subscription.currency,
          nextBillingDate,
        }).catch((err) =>
          console.error("Failed to send renewal reminder email:", err)
        );

        if (subscription.buyer_pubkey) {
          const dmMessage = `Reminder: Your subscription for "${
            subscription.product_title || subscription.product_event_id
          }" will renew on ${nextBillingDate}. You will be charged ${
            subscription.subscription_price
          } ${subscription.currency.toUpperCase()} (${formatFrequencyLabel(
            subscription.frequency
          )}, ${
            subscription.discount_percent
          }% off). Visit your orders page to manage your subscription.`;

          await sendServerSideNostrDM(
            subscription.buyer_pubkey,
            dmMessage,
            "subscription-renewal"
          ).catch((err) =>
            console.error("Failed to send renewal Nostr DM:", err)
          );
        }

        await createSubscriptionNotification({
          subscription_id: subscription.id,
          type: "renewal_reminder",
          method: subscription.buyer_pubkey ? "both" : "email",
        });

        break;
      }

      case "invoice.payment_succeeded": {
        const invoicePaid = event.data.object as any;
        const paidSubscriptionId =
          typeof invoicePaid.subscription === "string"
            ? invoicePaid.subscription
            : invoicePaid.subscription?.id;

        if (!paidSubscriptionId) break;

        const subscription =
          await getSubscriptionByStripeId(paidSubscriptionId);
        if (!subscription) break;

        const stripeSubscription = (await stripe.subscriptions.retrieve(
          paidSubscriptionId
        )) as any;

        const nextBillingDate = new Date(
          stripeSubscription.current_period_end * 1000
        );

        await updateSubscriptionBillingDate(
          paidSubscriptionId,
          nextBillingDate,
          nextBillingDate
        );

        if (
          subscription.status === "canceled" ||
          subscription.status === "pending"
        ) {
          await updateSubscriptionStatus(paidSubscriptionId, "active");
        }

        if (subscription.buyer_pubkey) {
          const formattedDate = nextBillingDate.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });
          const dmMessage = `Your subscription payment for "${
            subscription.product_title || subscription.product_event_id
          }" has been processed. Amount: ${
            subscription.subscription_price
          } ${subscription.currency.toUpperCase()}. Next billing date: ${formattedDate}.`;

          await sendServerSideNostrDM(
            subscription.buyer_pubkey,
            dmMessage,
            "subscription-payment"
          ).catch((err) =>
            console.error("Failed to send payment success Nostr DM:", err)
          );
        }

        break;
      }

      case "customer.subscription.deleted": {
        const deletedSubscription = event.data.object as any;

        await updateSubscriptionStatus(deletedSubscription.id, "canceled");

        const subscription = await getSubscriptionByStripeId(
          deletedSubscription.id
        );
        if (subscription) {
          const endDate = deletedSubscription.current_period_end
            ? new Date(
                deletedSubscription.current_period_end * 1000
              ).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : new Date().toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              });

          await sendSubscriptionCancellation(subscription.buyer_email, {
            productTitle:
              subscription.product_title || subscription.product_event_id,
            endDate,
          }).catch((err) =>
            console.error("Failed to send cancellation email:", err)
          );

          if (subscription.buyer_pubkey) {
            const dmMessage = `Your subscription for "${
              subscription.product_title || subscription.product_event_id
            }" has been canceled. You will continue to have access until ${endDate}. No further charges will be made.`;

            await sendServerSideNostrDM(
              subscription.buyer_pubkey,
              dmMessage,
              "subscription-cancellation"
            ).catch((err) =>
              console.error("Failed to send cancellation Nostr DM:", err)
            );
          }

          await createSubscriptionNotification({
            subscription_id: subscription.id,
            type: "cancellation",
            method: subscription.buyer_pubkey ? "both" : "email",
          });
        }

        break;
      }

      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return res.status(500).json({ error: "Webhook handler failed" });
  }
}
