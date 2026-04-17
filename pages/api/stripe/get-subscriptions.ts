import type { NextApiRequest, NextApiResponse } from "next";
import {
  getSubscriptionsByBuyerPubkey,
  getSubscriptionsByBuyerEmail,
} from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

// Rate limit: per-IP cap to bound abuse of payment endpoints.
const RATE_LIMIT = { limit: 120, windowMs: 60000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "stripe-get-subscriptions", RATE_LIMIT)) return;

  try {
    const { pubkey, email } = req.query;

    if (!pubkey && !email) {
      return res
        .status(400)
        .json({ error: "Either pubkey or email query parameter is required" });
    }

    let subscriptions;

    if (pubkey && typeof pubkey === "string") {
      subscriptions = await getSubscriptionsByBuyerPubkey(pubkey);
    } else if (email && typeof email === "string") {
      subscriptions = await getSubscriptionsByBuyerEmail(email);
    } else {
      return res.status(400).json({ error: "Invalid query parameters" });
    }

    return res.status(200).json({
      success: true,
      subscriptions,
    });
  } catch (error) {
    console.error("Failed to fetch subscriptions:", error);
    return res.status(500).json({
      error: "Failed to fetch subscriptions",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
