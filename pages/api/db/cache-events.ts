import type { NextApiRequest, NextApiResponse } from "next";
import { cacheEvents, isDatabaseConfigured } from "@/utils/db/db-service";
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

  if (!isDatabaseConfigured()) {
    return res.status(200).json({
      success: true,
      skipped: true,
      reason: "DATABASE_URL is not configured",
    });
  }

  try {
    const events: NostrEvent[] = req.body;
    if (!Array.isArray(events)) {
      return res
        .status(400)
        .json({ error: "Invalid request body: expected an array of events" });
    }

    const validEvents = events.filter(
      (event) =>
        event &&
        typeof event.id === "string" &&
        typeof event.pubkey === "string" &&
        typeof event.created_at === "number" &&
        typeof event.kind === "number" &&
        Array.isArray(event.tags) &&
        typeof event.content === "string" &&
        typeof event.sig === "string"
    );

    console.log("cache-events request", {
      received: events.length,
      valid: validEvents.length,
      sample: validEvents.slice(0, 3).map((event) => ({
        id: event.id,
        kind: event.kind,
        pubkey: event.pubkey,
      })),
    });

    if (validEvents.length === 0) {
      return res.status(400).json({
        error: "No valid events provided",
      });
    }

    // Handle large batches by splitting them
    if (validEvents.length > 100) {
      const chunks = [];
      for (let i = 0; i < validEvents.length; i += 100) {
        chunks.push(validEvents.slice(i, i + 100));
      }

      for (const chunk of chunks) {
        await cacheEvents(chunk);
      }
    } else {
      await cacheEvents(validEvents);
    }

    res.status(200).json({
      success: true,
      received: events.length,
      cached: validEvents.length,
      skipped: events.length - validEvents.length,
    });
  } catch (error) {
    console.error("Failed to cache events:", error);
    res.status(500).json({
      error: "Failed to cache events",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
