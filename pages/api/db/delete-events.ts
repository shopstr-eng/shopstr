import type { NextApiRequest, NextApiResponse } from "next";
import { deleteCachedEventsByIds } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

// Bulk delete; tight per-IP cap.
const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "delete-events", RATE_LIMIT)) return;

  try {
    const { eventIds } = req.body;
    await deleteCachedEventsByIds(eventIds);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to delete cached events:", error);
    res.status(500).json({ error: "Failed to delete cached events" });
  }
}
