import type { NextApiRequest, NextApiResponse } from "next";
import { type Event, verifyEvent } from "nostr-tools";
import { cacheEvent } from "@/utils/db/db-service";
import { isCacheableEventShape } from "@/utils/db/cache-event-policy";
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
    if (!isCacheableEventShape(event)) {
      return res
        .status(400)
        .json({ error: "Event kind is not permitted for caching" });
    }
    if (!verifyEvent(event as Event)) {
      return res.status(401).json({ error: "Invalid or unsigned Nostr event" });
    }
    await cacheEvent(event);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to cache event:", error);
    res.status(500).json({ error: "Failed to cache event" });
  }
}
