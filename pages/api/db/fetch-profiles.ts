import type { NextApiRequest, NextApiResponse } from "next";
import { fetchAllProfilesFromDb } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

// Returns the full profile set; bigger payload than fetch-profile so the
// per-IP ceiling is somewhat tighter.
const RATE_LIMIT = { limit: 300, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "fetch-profiles", RATE_LIMIT)) return;

  try {
    const profiles = await fetchAllProfilesFromDb();
    res.status(200).json(profiles);
  } catch (error) {
    console.error("Failed to fetch profiles from database:", error);
    res.status(500).json({ error: "Failed to fetch profiles" });
  }
}
