import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import {
  getStripeConnectAccount,
  upsertStripeConnectAccount,
} from "@/utils/db/db-service";
import { buildStripeAccountStatusProof } from "@/utils/mcp/request-proof";
import {
  extractSignedEventFromRequest,
  verifyAndConsumeSignedRequestProof,
} from "@/utils/mcp/request-proof-server";
import { verifyNostrAuth } from "@/utils/stripe/verify-nostr-auth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-09-30.clover",
});
import { applyRateLimit } from "@/utils/rate-limit";

// Rate limit: per-IP cap to bound abuse of payment endpoints.
const RATE_LIMIT = { limit: 60, windowMs: 60000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "stripe-connect-account-status", RATE_LIMIT))
    return;

  try {
    const { pubkey } = req.body || {};

    if (!pubkey || typeof pubkey !== "string" || !pubkey.trim()) {
      return res.status(400).json({ error: "pubkey is required" });
    }
    const normalizedPubkey = pubkey.trim();

    const signedEvent = extractSignedEventFromRequest(req);
    const proofResult = await verifyAndConsumeSignedRequestProof(
      signedEvent,
      buildStripeAccountStatusProof(normalizedPubkey)
    );

    if (!proofResult.ok) {
      const authResult = verifyNostrAuth(
        signedEvent,
        normalizedPubkey,
        "stripe-connect"
      );
      if (!authResult.valid) {
        return res.status(proofResult.status).json({
          error:
            proofResult.error || authResult.error || "Authentication failed",
        });
      }
    }

    const connectAccount = await getStripeConnectAccount(normalizedPubkey);

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
      normalizedPubkey,
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
