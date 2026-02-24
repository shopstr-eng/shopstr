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

    // Get all failed publishes with retry count < 5 (limit retries)
    const result = await client.query(
      `SELECT event_id, event_data, relays, retry_count
       FROM failed_relay_publishes
       WHERE retry_count < 5
       ORDER BY created_at ASC
       LIMIT 50`
    );

    const failedPublishes = result.rows
      .filter((row: any) => row.event_data)
      .map((row: any) => ({
        eventId: row.event_id,
        relays: JSON.parse(row.relays),
        event: JSON.parse(row.event_data),
        retryCount: row.retry_count,
      }));

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
