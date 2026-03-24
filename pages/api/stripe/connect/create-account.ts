import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import {
  getStripeConnectAccount,
  upsertStripeConnectAccount,
} from "@/utils/db/db-service";
import { verifyNostrAuth } from "@/utils/stripe/verify-nostr-auth";

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
    const { pubkey, signedEvent } = req.body;

    if (!pubkey) {
      return res.status(400).json({ error: "pubkey is required" });
    }

    const authResult = verifyNostrAuth(signedEvent, pubkey);
    if (!authResult.valid) {
      return res
        .status(401)
        .json({ error: authResult.error || "Authentication failed" });
    }

    const existing = await getStripeConnectAccount(pubkey);
    if (existing && existing.stripe_account_id) {
      return res.status(200).json({
        accountId: existing.stripe_account_id,
        alreadyExists: true,
      });
    }

    const account = await stripe.accounts.create({
      type: "express",
      metadata: {
        pubkey,
      },
    });

    await upsertStripeConnectAccount(pubkey, account.id, false, false, false);

    return res.status(200).json({
      accountId: account.id,
      alreadyExists: false,
    });
  } catch (error) {
    console.error("Stripe Connect account creation error:", error);
    return res.status(500).json({
      error: "Failed to create Stripe Connect account",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
