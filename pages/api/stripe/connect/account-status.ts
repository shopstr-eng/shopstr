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

    const connectAccount = await getStripeConnectAccount(pubkey);

    if (!connectAccount) {
      return res.status(200).json({
        hasAccount: false,
        onboardingComplete: false,
        chargesEnabled: false,
        payoutsEnabled: false,
      });
    }

    const account = await stripe.accounts.retrieve(
      connectAccount.stripe_account_id
    );

    const onboardingComplete = account.details_submitted || false;
    const chargesEnabled = account.charges_enabled || false;
    const payoutsEnabled = account.payouts_enabled || false;

    await upsertStripeConnectAccount(
      pubkey,
      connectAccount.stripe_account_id,
      onboardingComplete,
      chargesEnabled,
      payoutsEnabled
    );

    return res.status(200).json({
      hasAccount: true,
      accountId: connectAccount.stripe_account_id,
      onboardingComplete,
      chargesEnabled,
      payoutsEnabled,
    });
  } catch (error) {
    console.error("Stripe Connect account status error:", error);
    return res.status(500).json({
      error: "Failed to check account status",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
