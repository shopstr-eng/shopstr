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
    const { eventId, incrementRetry } = req.body;

    if (!eventId) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    client = await dbPool.connect();

    await client.query(`
      CREATE TABLE IF NOT EXISTS failed_relay_publishes (
        event_id TEXT PRIMARY KEY,
        relays TEXT NOT NULL,
        event_data TEXT,
        created_at BIGINT NOT NULL,
        retry_count INTEGER DEFAULT 0
      )
    `);

    if (incrementRetry) {
      // Increment retry count
      await client.query(
        `UPDATE failed_relay_publishes SET retry_count = retry_count + 1 WHERE event_id = $1`,
        [eventId]
      );
    } else {
      // Remove successful publish
      await client.query(
        `DELETE FROM failed_relay_publishes WHERE event_id = $1`,
        [eventId]
      );
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error clearing failed relay publish:", error);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    if (client) {
      client.release();
    }
  }
}
