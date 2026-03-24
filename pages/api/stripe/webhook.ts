import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { getStripeConnectAccount } from "@/utils/db/db-service";

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  try {
    const rawBody = await getRawBody(req);

    if (webhookSecret) {
      const sig = req.headers["stripe-signature"] as string;
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } else {
      event = JSON.parse(rawBody.toString()) as Stripe.Event;
      console.warn(
        "STRIPE_WEBHOOK_SECRET not set — accepting unverified webhook"
      );
    }
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
        console.error(
          `Invoice payment failed: ${invoice.id}, subscription: ${
            (invoice as any).subscription
          }`
        );
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
    const nonPlatformSplits = sellerSplits.filter(
      (s) => s.pubkey !== process.env.NEXT_PUBLIC_MILK_MARKET_PK
    );
    if (failedTransfers.length >= nonPlatformSplits.length) {
      throw new Error(
        `All seller transfers failed for subscription ${subscriptionId}`
      );
    }
  }
}
