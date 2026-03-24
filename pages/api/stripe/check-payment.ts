import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-09-30.clover",
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { invoiceId, connectedAccountId } = req.body;

    if (!invoiceId) {
      return res.status(400).json({ error: "Invoice ID is required" });
    }

    const stripeOptions = connectedAccountId
      ? { stripeAccount: connectedAccountId }
      : undefined;

    const invoice = await stripe.invoices.retrieve(invoiceId, stripeOptions);

    return res.status(200).json({
      paid: invoice.status === "paid",
      status: invoice.status,
      amountPaid: invoice.amount_paid,
    });
  } catch (error) {
    console.error("Stripe payment check error:", error);
    return res.status(500).json({
      error: "Failed to check payment status",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
