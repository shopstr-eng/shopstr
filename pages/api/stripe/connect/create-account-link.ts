import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { getStripeConnectAccount } from "@/utils/db/db-service";
import { buildStripeCreateAccountLinkProof } from "@/utils/mcp/request-proof";
import {
  extractSignedEventFromRequest,
  verifyAndConsumeSignedRequestProof,
} from "@/utils/mcp/request-proof-server";

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
    const { accountId, returnPath, refreshPath, pubkey } = req.body || {};

    if (!accountId || !pubkey || typeof pubkey !== "string" || !pubkey.trim()) {
      return res
        .status(400)
        .json({ error: "accountId and pubkey are required" });
    }

    const normalizedPubkey = pubkey.trim();

    const signedEvent = extractSignedEventFromRequest(req);
    const proofResult = await verifyAndConsumeSignedRequestProof(
      signedEvent,
      buildStripeCreateAccountLinkProof({
        pubkey: normalizedPubkey,
        accountId,
      })
    );

    if (!proofResult.ok) {
      return res.status(proofResult.status).json({ error: proofResult.error });
    }

    const connectAccount = await getStripeConnectAccount(normalizedPubkey);
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
