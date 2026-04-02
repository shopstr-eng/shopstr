import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import {
  getStripeConnectAccount,
  upsertStripeConnectAccount,
} from "@/utils/db/db-service";
import { buildStripeCreateAccountProof } from "@/utils/mcp/request-proof";
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
    const { pubkey } = req.body || {};

    if (!pubkey || typeof pubkey !== "string" || !pubkey.trim()) {
      return res.status(400).json({ error: "pubkey is required" });
    }

    const normalizedPubkey = pubkey.trim();

    const signedEvent = extractSignedEventFromRequest(req);
    const proofResult = await verifyAndConsumeSignedRequestProof(
      signedEvent,
      buildStripeCreateAccountProof(normalizedPubkey)
    );

    if (!proofResult.ok) {
      return res.status(proofResult.status).json({ error: proofResult.error });
    }

    const existing = await getStripeConnectAccount(normalizedPubkey);
    if (existing && existing.stripe_account_id) {
      return res.status(200).json({
        accountId: existing.stripe_account_id,
        alreadyExists: true,
      });
    }

    const account = await stripe.accounts.create({
      type: "express",
      metadata: {
        pubkey: normalizedPubkey,
      },
    });

    await upsertStripeConnectAccount(
      normalizedPubkey,
      account.id,
      false,
      false,
      false
    );

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
