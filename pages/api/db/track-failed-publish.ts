import type { NextApiRequest, NextApiResponse } from "next";
import { getDbPool } from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const dbPool = getDbPool();
  let client;

  try {
    const { eventId, relays } = req.body;

    if (!eventId || !relays || !Array.isArray(relays)) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    client = await dbPool.connect();

    // Create table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS failed_relay_publishes (
        event_id TEXT PRIMARY KEY,
        relays TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        retry_count INTEGER DEFAULT 0
      )
    `);

    // Insert or update the failed publish record
    await client.query(
      `INSERT INTO failed_relay_publishes (event_id, relays, created_at, retry_count)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (event_id) DO UPDATE SET
         relays = EXCLUDED.relays,
         created_at = EXCLUDED.created_at`,
      [eventId, JSON.stringify(relays), Math.floor(Date.now() / 1000)]
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
