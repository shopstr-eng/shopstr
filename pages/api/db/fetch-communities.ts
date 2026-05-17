import type { NextApiRequest, NextApiResponse } from "next";
import { fetchAllCommunitiesFromDb } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 600, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "fetch-communities", RATE_LIMIT)) return;

  try {
    const communities = await fetchAllCommunitiesFromDb();
    res.status(200).json(communities);
  } catch (error) {
    console.error("Failed to fetch communities from database:", error);
    res.status(500).json({ error: "Failed to fetch communities" });
  }
}
