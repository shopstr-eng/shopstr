import type { NextApiRequest, NextApiResponse } from "next";
import { fetchCachedEvents } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 300, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "fetch-reviews", RATE_LIMIT)) return;

  try {
    const reviews = await fetchCachedEvents(31555);
    res.status(200).json(reviews);
  } catch (error) {
    console.error("Failed to fetch reviews from database:", error);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
}
