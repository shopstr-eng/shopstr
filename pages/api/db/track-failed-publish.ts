import type { NextApiRequest, NextApiResponse } from "next";
import {
  ensureFailedRelayPublishesTable,
  getDbPool,
} from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

// Spikes during relay outages while a client retries every failed publish;
// generous enough to absorb that, bounded enough to stop a runaway loop.
const RATE_LIMIT = { limit: 300, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "track-failed-publish", RATE_LIMIT)) return;

  const dbPool = getDbPool();
  let client;

  try {
    const { eventId, event, relays } = req.body;

    if (!eventId || !event || !relays || !Array.isArray(relays)) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    client = await dbPool.connect();
    await ensureFailedRelayPublishesTable(client);

    // Insert or update the failed publish record
    await client.query(
      `INSERT INTO failed_relay_publishes (event_id, event_data, relays, created_at, retry_count)
       VALUES ($1, $2, $3, $4, 0)
       ON CONFLICT (event_id) DO UPDATE SET
         event_data = EXCLUDED.event_data,
         relays = EXCLUDED.relays,
         created_at = EXCLUDED.created_at`,
      [
        eventId,
        event ? JSON.stringify(event) : null,
        JSON.stringify(relays),
        Math.floor(Date.now() / 1000),
      ]
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error tracking failed relay publish:", error);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    if (client) {
      client.release();
    }
  }
}
