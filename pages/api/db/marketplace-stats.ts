import type { NextApiRequest, NextApiResponse } from "next";
import { fetchMarketplaceStats } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

// Heavier aggregate query. Response is already cached for 5 minutes via the
// Cache-Control header below, so a tighter per-IP cap is fine.
const RATE_LIMIT = { limit: 120, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "marketplace-stats", RATE_LIMIT)) return;

  try {
    const stats = await fetchMarketplaceStats();
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");
    res.status(200).json(stats);
  } catch (error) {
    console.error("Failed to fetch marketplace stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
}
