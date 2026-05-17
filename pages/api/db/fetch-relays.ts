import type { NextApiRequest, NextApiResponse } from "next";
import { fetchCachedEvents } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 600, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "fetch-relays", RATE_LIMIT)) return;

  try {
    const { pubkey } = req.query;
    if (typeof pubkey !== "string") {
      return res.status(400).json({ error: "Invalid pubkey parameter" });
    }

    const relays = await fetchCachedEvents(10002, { pubkey });
    res.status(200).json(relays);
  } catch (error) {
    console.error("Failed to fetch relay config from database:", error);
    res.status(500).json({ error: "Failed to fetch relay config" });
  }
}
