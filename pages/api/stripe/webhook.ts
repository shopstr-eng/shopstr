import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import {
  getStripeConnectAccount,
  getSellerNotificationEmail,
  getSubscriptionByStripeId,
} from "@/utils/db/db-service";
import {
  sendPaymentFailedToBuyer,
  sendPaymentFailedToSeller,
  sendTransferFailureAlert,
} from "@/utils/email/email-service";

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
    const chunks: Uint8Array[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(new Uint8Array(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  let event: Stripe.Event;

  try {
    const rawBody = await getRawBody(req);
    const sig = req.headers["stripe-signature"] as string;
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return res
      .status(400)
      .json({ error: "Webhook signature verification failed" });
  }

  try {
    switch (event.type) {
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice);
        break;
      }
      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return res.status(500).json({ error: "Webhook handler error" });
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const invoiceAny = invoice as any;
  const subscriptionId = invoiceAny.subscription
    ? typeof invoiceAny.subscription === "string"
      ? invoiceAny.subscription
      : invoiceAny.subscription.id
    : undefined;

  const customerEmail = invoice.customer_email || undefined;
  const amountDue = invoice.amount_due;
  const currency = (invoice.currency || "usd").toUpperCase();
  const amountDisplay = amountDue
    ? `${(amountDue / 100).toFixed(2)} ${currency}`
    : undefined;

  console.error(
    `Invoice payment failed: ${invoice.id}, subscription: ${subscriptionId || "none"}, customer: ${customerEmail || "unknown"}`
  );

  if (customerEmail) {
    await sendPaymentFailedToBuyer(customerEmail, {
      invoiceId: invoice.id,
      subscriptionId,
      amountDisplay,
    }).catch((err) =>
      console.error("Failed to send payment failure email to buyer:", err)
    );
  }

  if (subscriptionId) {
    try {
      const dbSubscription = await getSubscriptionByStripeId(subscriptionId);
      if (dbSubscription?.seller_pubkey) {
        const sellerEmail = await getSellerNotificationEmail(
          dbSubscription.seller_pubkey
        );
        if (sellerEmail) {
          await sendPaymentFailedToSeller(sellerEmail, {
            invoiceId: invoice.id,
            subscriptionId,
            customerEmail,
            amountDisplay,
          });
        }
      }
    } catch (err) {
      console.error("Failed to send payment failure email to seller:", err);
    }
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const invoiceAny = invoice as any;
  if (!invoiceAny.subscription) return;

  const subscriptionId =
    typeof invoiceAny.subscription === "string"
      ? invoiceAny.subscription
      : invoiceAny.subscription.id;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const metadata = subscription.metadata;

  if (metadata.isMultiMerchant !== "true") return;

  const transferGroup = metadata.transferGroup;
  if (!transferGroup) {
    console.error(
      `Multi-merchant subscription ${subscriptionId} missing transferGroup`
    );
    return;
  }

  let sellerSplits: {
    pubkey: string;
    amountCents: number;
    accountId: string;
  }[];
  try {
    sellerSplits = JSON.parse(metadata.sellerSplits || "[]");
  } catch {
    console.error(
      `Failed to parse sellerSplits for subscription ${subscriptionId}`
    );
    return;
  }

  if (sellerSplits.length === 0) return;

  const paymentIntentId =
    typeof invoiceAny.payment_intent === "string"
      ? invoiceAny.payment_intent
      : invoiceAny.payment_intent?.id;

  const transferCurrency = invoice.currency || "usd";

  const failedTransfers: {
    pubkey: string;
    amountCents: number;
    error: string;
  }[] = [];
  const nonPlatformSplits = sellerSplits.filter(
    (s) => s.pubkey !== process.env.NEXT_PUBLIC_MILK_MARKET_PK
  );

  for (const split of sellerSplits) {
    const isPlatformAccount =
      split.pubkey === process.env.NEXT_PUBLIC_MILK_MARKET_PK;
    if (isPlatformAccount) continue;

    let accountId = split.accountId;
    if (!accountId) {
      const connectAccount = await getStripeConnectAccount(split.pubkey);
      if (!connectAccount || !connectAccount.charges_enabled) {
        const msg = `Cannot transfer to seller ${split.pubkey} — no Stripe account`;
        console.error(msg);
        failedTransfers.push({
          pubkey: split.pubkey,
          amountCents: split.amountCents,
          error: msg,
        });
        continue;
      }
      accountId = connectAccount.stripe_account_id;
    }

    try {
      await stripe.transfers.create({
        amount: split.amountCents,
        currency: transferCurrency,
        destination: accountId,
        transfer_group: transferGroup,
        metadata: {
          subscriptionId,
          invoiceId: invoice.id,
          sellerPubkey: split.pubkey,
          paymentIntentId: paymentIntentId || "",
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        `Transfer failed for seller ${split.pubkey} on subscription ${subscriptionId}:`,
        error
      );
      failedTransfers.push({
        pubkey: split.pubkey,
        amountCents: split.amountCents,
        error: msg,
      });
    }
  }

  if (failedTransfers.length > 0) {
    console.error(
      `TRANSFER_FAILURES subscription=${subscriptionId} invoice=${
        invoice.id
      } transferGroup=${transferGroup} failures=${JSON.stringify(
        failedTransfers
      )}`
    );

    try {
      const dbSubscription = await getSubscriptionByStripeId(subscriptionId);
      const sellerPubkey = dbSubscription?.seller_pubkey;
      let alertEmail: string | null = null;

      if (sellerPubkey) {
        alertEmail = await getSellerNotificationEmail(sellerPubkey);
      }

      if (!alertEmail) {
        const { fromEmail } =
          await import("@/utils/email/sendgrid-client").then((m) =>
            m.getUncachableSendGridClient()
          );
        alertEmail = fromEmail;
      }

      if (alertEmail) {
        await sendTransferFailureAlert(alertEmail, {
          subscriptionId,
          invoiceId: invoice.id,
          failures: failedTransfers.map((f) => ({
            sellerPubkey: f.pubkey,
            amountCents: f.amountCents,
            error: f.error,
          })),
        });
      }
    } catch (emailErr) {
      console.error("Failed to send transfer failure alert email:", emailErr);
    }

    if (failedTransfers.length >= nonPlatformSplits.length) {
      throw new Error(
        `All seller transfers failed for subscription ${subscriptionId}`
      );
    }
  }
}
