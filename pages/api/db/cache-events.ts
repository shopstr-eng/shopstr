
import type { NextApiRequest, NextApiResponse } from "next";
import { cacheEvents } from "@/utils/db/db-service";
import { NostrEvent } from "@/utils/types/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const events: NostrEvent[] = req.body;
    await cacheEvents(events);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to cache events:", error);
    res.status(500).json({ error: "Failed to cache events" });
  }
}
