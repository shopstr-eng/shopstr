import type { NextApiRequest, NextApiResponse } from "next";
import { cacheEvent } from "@/utils/db/db-service";
import { NostrEvent } from "@/utils/types/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const event: NostrEvent = req.body;
    await cacheEvent(event);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to cache event:", error);
    res.status(500).json({ error: "Failed to cache event" });
  }
}
