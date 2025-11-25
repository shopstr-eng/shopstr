import type { NextApiRequest, NextApiResponse } from "next";
import { deleteCachedEventsByIds } from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { eventIds } = req.body;
    await deleteCachedEventsByIds(eventIds);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to delete cached events:", error);
    res.status(500).json({ error: "Failed to delete cached events" });
  }
}
