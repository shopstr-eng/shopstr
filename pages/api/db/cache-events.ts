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
    if (!Array.isArray(events)) {
      return res
        .status(400)
        .json({ error: "Invalid request body: expected an array of events" });
    }

    // Handle large batches by splitting them
    if (events.length > 100) {
      const chunks = [];
      for (let i = 0; i < events.length; i += 100) {
        chunks.push(events.slice(i, i + 100));
      }

      for (const chunk of chunks) {
        await cacheEvents(chunk);
      }
    } else {
      await cacheEvents(events);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to cache events:", error);
    res.status(500).json({ error: "Failed to cache events" });
  }
}
