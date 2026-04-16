import type { NextApiRequest, NextApiResponse } from "next";
import { type Event, verifyEvent } from "nostr-tools";
import { cacheEvents } from "@/utils/db/db-service";
import {
  CACHE_EVENTS_MAX_BATCH_SIZE,
  isCacheableEventShape,
} from "@/utils/db/cache-event-policy";
import { NostrEvent } from "@/utils/types/types";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4mb",
    },
  },
};

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

    if (events.length > CACHE_EVENTS_MAX_BATCH_SIZE) {
      return res
        .status(413)
        .json({ error: "Too many events in a single request" });
    }

    if (events.some((event) => !isCacheableEventShape(event))) {
      return res
        .status(400)
        .json({ error: "Event kind is not permitted for caching" });
    }

    if (events.some((event) => !verifyEvent(event as Event))) {
      return res.status(401).json({ error: "Invalid or unsigned Nostr event" });
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
