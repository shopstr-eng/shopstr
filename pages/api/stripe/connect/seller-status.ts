import type { NextApiRequest, NextApiResponse } from "next";
import { getStripeConnectAccount } from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { pubkey } = req.body;

    if (!pubkey) {
      return res.status(400).json({ error: "pubkey is required" });
    }

    const connectAccount = await getStripeConnectAccount(pubkey);

    if (!connectAccount) {
      return res.status(200).json({
        hasStripeAccount: false,
        chargesEnabled: false,
      });
    }

    return res.status(200).json({
      hasStripeAccount: true,
      chargesEnabled: connectAccount.charges_enabled,
      onboardingComplete: connectAccount.onboarding_complete,
      connectedAccountId: connectAccount.charges_enabled
        ? connectAccount.stripe_account_id
        : undefined,
    });
  } catch (error) {
    console.error("Seller Stripe status check error:", error);
    return res.status(500).json({
      error: "Failed to check seller status",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
