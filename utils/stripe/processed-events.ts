import type { PoolClient } from "pg";
import { getDbPool } from "@/utils/db/db-service";

let tableInitialized = false;

async function ensureTable(client: PoolClient): Promise<void> {
  if (tableInitialized) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS stripe_processed_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      processed_at BIGINT NOT NULL
    )
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_stripe_processed_events_processed_at
       ON stripe_processed_events(processed_at)`
  );
  tableInitialized = true;
}

/**
 * Atomically claim a Stripe webhook event for processing.
 * Returns `true` when this caller should process the event, `false` when it
 * has already been processed (or is being processed by another worker).
 */
export async function claimStripeEvent(
  eventId: string,
  eventType: string
): Promise<boolean> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const result = await client.query(
      `INSERT INTO stripe_processed_events (event_id, event_type, processed_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [eventId, eventType, Date.now()]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

/**
 * Best-effort cleanup helper: drop processed-event records older than
 * `maxAgeMs`. Stripe replays events for ~30 days, so default to 45 days.
 */
export async function pruneStripeProcessedEvents(
  maxAgeMs: number = 45 * 24 * 60 * 60 * 1000
): Promise<number> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const result = await client.query(
      `DELETE FROM stripe_processed_events WHERE processed_at < $1`,
      [Date.now() - maxAgeMs]
    );
    return result.rowCount ?? 0;
  } finally {
    client.release();
  }
}
