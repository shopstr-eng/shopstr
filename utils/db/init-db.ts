import { PoolClient } from "pg";

export async function ensureFailedRelayPublishesTable(
  client: PoolClient
): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS failed_relay_publishes (
      event_id TEXT PRIMARY KEY,
      owner_pubkey TEXT,
      event_data TEXT NOT NULL,
      relays TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      retry_count INTEGER DEFAULT 0
    )
  `);

  await client.query(`
    ALTER TABLE failed_relay_publishes
    ADD COLUMN IF NOT EXISTS event_data TEXT
  `);

  await client.query(`
    ALTER TABLE failed_relay_publishes
    ADD COLUMN IF NOT EXISTS owner_pubkey TEXT
  `);

  // Legacy rows pre-dating the owner_pubkey column have NULL ownership and
  // can no longer be listed, retried, cleared, or claimed by anyone, so they
  // would otherwise sit in the table forever. Drop them once on schema setup.
  await client.query(`
    DELETE FROM failed_relay_publishes
    WHERE owner_pubkey IS NULL
  `);
}

export default ensureFailedRelayPublishesTable;
