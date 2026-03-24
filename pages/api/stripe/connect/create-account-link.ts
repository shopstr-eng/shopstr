import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { getStripeConnectAccount } from "@/utils/db/db-service";
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
    const { accountId, returnPath, refreshPath, pubkey, signedEvent } =
      req.body;

    if (!accountId || !pubkey || !signedEvent) {
      return res
        .status(400)
        .json({ error: "accountId, pubkey, and signedEvent are required" });
    }

    const authResult = verifyNostrAuth(signedEvent, pubkey);
    if (!authResult.valid) {
      return res
        .status(401)
        .json({ error: authResult.error || "Authentication failed" });
    }

    const connectAccount = await getStripeConnectAccount(pubkey);
    if (!connectAccount || connectAccount.stripe_account_id !== accountId) {
      return res
        .status(403)
        .json({ error: "Account does not belong to this user" });
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      (process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : "http://localhost:3000");

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}${
        refreshPath || "/onboarding/stripe-connect?refresh=true"
      }`,
      return_url: `${baseUrl}${
        returnPath || "/onboarding/stripe-connect?success=true"
      }`,
      type: "account_onboarding",
    });

    return res.status(200).json({
      url: accountLink.url,
    });
  } catch (error) {
    console.error("Stripe account link creation error:", error);
    return res.status(500).json({
      error: "Failed to create account link",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
