import type { NextApiRequest, NextApiResponse } from "next";
import { getDbPool } from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const dbPool = getDbPool();
  let client;

  try {
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

    await client.query(`
      ALTER TABLE failed_relay_publishes
      ADD COLUMN IF NOT EXISTS event_data TEXT
    `);

    // Get all failed publishes with retry count < 5 (limit retries)
    const result = await client.query(
      `SELECT event_id, relays, retry_count, event_data
       FROM failed_relay_publishes
       WHERE retry_count < 5
         AND event_data IS NOT NULL
       ORDER BY created_at ASC
       LIMIT 50`
    );

    const failedPublishes = result.rows
      .map((row: any) => {
        try {
          return {
            eventId: row.event_id,
            relays: JSON.parse(row.relays),
            event: JSON.parse(row.event_data),
            retryCount: row.retry_count,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return res.status(200).json(failedPublishes);
  } catch (error) {
    console.error("Error getting failed relay publishes:", error);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    if (client) {
      client.release();
    }
  }
}
