import { Pool } from "pg";
import { NostrEvent } from "../types/types";

let pool: Pool | null = null;
let tablesInitialized = false;

// Initialize the database connection pool
export function getDbPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    // Use pooled connection for better performance
    const poolUrl = databaseUrl.replace(".us-east-2", "-pooler.us-east-2");
    pool = new Pool({
      connectionString: poolUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Auto-create tables on first connection
    initializeTables().catch((error) => {
      console.error("Failed to initialize database tables:", error);
    });
  }
  return pool;
}

// Auto-create all tables if they don't exist
async function initializeTables(): Promise<void> {
  if (tablesInitialized) return;

  const dbPool = getDbPool();
  const client = await dbPool.connect();

  try {
    await client.query(`
      -- Products table (kind 30402 - listings)
      CREATE TABLE IF NOT EXISTS product_events (
          id TEXT PRIMARY KEY,
          pubkey TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          kind INTEGER NOT NULL,
          tags JSONB NOT NULL,
          content TEXT NOT NULL,
          sig TEXT NOT NULL,
          cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT product_events_kind_check CHECK (kind = 30402)
      );

      CREATE INDEX IF NOT EXISTS idx_product_events_pubkey ON product_events(pubkey);
      CREATE INDEX IF NOT EXISTS idx_product_events_created_at ON product_events(created_at DESC);

      -- Reviews table (kind 31555)
      CREATE TABLE IF NOT EXISTS review_events (
          id TEXT PRIMARY KEY,
          pubkey TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          kind INTEGER NOT NULL,
          tags JSONB NOT NULL,
          content TEXT NOT NULL,
          sig TEXT NOT NULL,
          cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT review_events_kind_check CHECK (kind = 31555)
      );

      CREATE INDEX IF NOT EXISTS idx_review_events_pubkey ON review_events(pubkey);

      -- Messages table (kind 1059 - gift wrapped DM)
      CREATE TABLE IF NOT EXISTS message_events (
          id TEXT PRIMARY KEY,
          pubkey TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          kind INTEGER NOT NULL,
          tags JSONB NOT NULL,
          content TEXT NOT NULL,
          sig TEXT NOT NULL,
          cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT message_events_kind_check CHECK (kind = 1059)
      );

      CREATE INDEX IF NOT EXISTS idx_message_events_pubkey ON message_events(pubkey);
      CREATE INDEX IF NOT EXISTS idx_message_events_created_at ON message_events(created_at DESC);

      -- Profile events (kind 0 - user profile, kind 30019 - shop profile)
      CREATE TABLE IF NOT EXISTS profile_events (
          id TEXT PRIMARY KEY,
          pubkey TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          kind INTEGER NOT NULL,
          tags JSONB NOT NULL,
          content TEXT NOT NULL,
          sig TEXT NOT NULL,
          cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT profile_events_kind_check CHECK (kind IN (0, 30019))
      );

      CREATE INDEX IF NOT EXISTS idx_profile_events_pubkey ON profile_events(pubkey);
      CREATE INDEX IF NOT EXISTS idx_profile_events_kind ON profile_events(kind);

      -- Wallet events (kind 7375 - proofs, kind 7376 - spending history, kind 17375 - wallet config, kind 37375 - wallet state)
      CREATE TABLE IF NOT EXISTS wallet_events (
          id TEXT PRIMARY KEY,
          pubkey TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          kind INTEGER NOT NULL,
          tags JSONB NOT NULL,
          content TEXT NOT NULL,
          sig TEXT NOT NULL,
          cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT wallet_events_kind_check CHECK (kind IN (7375, 7376, 17375, 37375))
      );

      CREATE INDEX IF NOT EXISTS idx_wallet_events_pubkey ON wallet_events(pubkey);
      CREATE INDEX IF NOT EXISTS idx_wallet_events_kind ON wallet_events(kind);

      -- Community events (kind 34550 - community definition, kind 1111 - posts, kind 4550 - approvals)
      CREATE TABLE IF NOT EXISTS community_events (
          id TEXT PRIMARY KEY,
          pubkey TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          kind INTEGER NOT NULL,
          tags JSONB NOT NULL,
          content TEXT NOT NULL,
          sig TEXT NOT NULL,
          cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT community_events_kind_check CHECK (kind IN (34550, 1111, 4550))
      );

      CREATE INDEX IF NOT EXISTS idx_community_events_pubkey ON community_events(pubkey);
      CREATE INDEX IF NOT EXISTS idx_community_events_kind ON community_events(kind);

      -- Relay/config events (kind 10002 - relays, kind 10063 - blossom servers, kind 30405 - cart/saved)
      CREATE TABLE IF NOT EXISTS config_events (
          id TEXT PRIMARY KEY,
          pubkey TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          kind INTEGER NOT NULL,
          tags JSONB NOT NULL,
          content TEXT NOT NULL,
          sig TEXT NOT NULL,
          cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT config_events_kind_check CHECK (kind IN (10002, 10063, 30405))
      );

      CREATE INDEX IF NOT EXISTS idx_config_events_pubkey ON config_events(pubkey);
    `);

    tablesInitialized = true;
    console.log("Database tables initialized successfully");
  } catch (error) {
    console.error("Failed to initialize tables:", error);
    throw error;
  } finally {
    client.release();
  }
}

// Map event kinds to table names
function getTableForKind(kind: number): string | null {
  // Products
  if (kind === 30402) return "product_events";

  // Reviews
  if (kind === 31555) return "review_events";

  // Messages
  if (kind === 1059) return "message_events";

  // Profiles
  if (kind === 0 || kind === 30019) return "profile_events";

  // Wallet
  if ([7375, 7376, 17375, 37375].includes(kind)) return "wallet_events";

  // Community
  if ([34550, 1111, 4550].includes(kind)) return "community_events";

  // Config
  if ([10002, 10063, 30405].includes(kind)) return "config_events";

  return null;
}

// Cache a single event to the database
export async function cacheEvent(event: NostrEvent): Promise<void> {
  const table = getTableForKind(event.kind);
  if (!table) {
    console.warn(`No table mapping for event kind ${event.kind}`);
    return;
  }

  const dbPool = getDbPool();
  const client = await dbPool.connect();

  try {
    const query = {
      text: `INSERT INTO ${table} (id, pubkey, created_at, kind, tags, content, sig)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO UPDATE SET
               pubkey = EXCLUDED.pubkey,
               created_at = EXCLUDED.created_at,
               tags = EXCLUDED.tags,
               content = EXCLUDED.content,
               sig = EXCLUDED.sig,
               cached_at = CURRENT_TIMESTAMP`,
      values: [
        event.id,
        event.pubkey,
        event.created_at,
        event.kind,
        JSON.stringify(event.tags),
        event.content,
        event.sig,
      ] as any[],
    };
    await client.query(query);
  } catch (error) {
    console.error(`Failed to cache event ${event.id}:`, error);
  } finally {
    client.release();
  }
}

// Cache multiple events in a batch
export async function cacheEvents(events: NostrEvent[]): Promise<void> {
  if (events.length === 0) return;

  const eventsByTable = new Map<string, NostrEvent[]>();

  // Group events by table
  for (const event of events) {
    const table = getTableForKind(event.kind);
    if (table) {
      if (!eventsByTable.has(table)) {
        eventsByTable.set(table, []);
      }
      eventsByTable.get(table)!.push(event);
    }
  }

  const dbPool = getDbPool();
  const client = await dbPool.connect();

  try {
    await client.query("BEGIN");

    for (const [table, tableEvents] of eventsByTable.entries()) {
      for (const event of tableEvents) {
        const query = {
          text: `INSERT INTO ${table} (id, pubkey, created_at, kind, tags, content, sig)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (id) DO UPDATE SET
                   pubkey = EXCLUDED.pubkey,
                   created_at = EXCLUDED.created_at,
                   tags = EXCLUDED.tags,
                   content = EXCLUDED.content,
                   sig = EXCLUDED.sig,
                   cached_at = CURRENT_TIMESTAMP`,
          values: [
            event.id,
            event.pubkey,
            event.created_at,
            event.kind,
            JSON.stringify(event.tags),
            event.content,
            event.sig,
          ] as any[],
        };
        await client.query(query);
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to cache events batch:", error);
  } finally {
    client.release();
  }
}

// Fetch events from cache by kind and optional filters
export async function fetchCachedEvents(
  kind: number,
  filters?: {
    pubkey?: string;
    limit?: number;
    since?: number;
    until?: number;
  }
): Promise<NostrEvent[]> {
  const table = getTableForKind(kind);
  if (!table) return [];

  const dbPool = getDbDbPool();
  const client = await dbPool.connect();

  try {
    let query = `SELECT id, pubkey, created_at, kind, tags, content, sig FROM ${table} WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.pubkey) {
      query += ` AND pubkey = $${paramIndex++}`;
      params.push(filters.pubkey);
    }

    if (filters?.since) {
      query += ` AND created_at >= $${paramIndex++}`;
      params.push(filters.since);
    }

    if (filters?.until) {
      query += ` AND created_at <= $${paramIndex++}`;
      params.push(filters.until);
    }

    query += " ORDER BY created_at DESC";

    if (filters?.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(filters.limit);
    }

    const result = await client.query(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      pubkey: row.pubkey,
      created_at: row.created_at,
      kind: row.kind,
      tags: row.tags,
      content: row.content,
      sig: row.sig,
    }));
  } catch (error) {
    console.error("Failed to fetch cached events:", error);
    return [];
  } finally {
    client.release();
  }
}

// Delete cached event by ID
export async function deleteCachedEvent(
  eventId: string,
  kind: number
): Promise<void> {
  const table = getTableForKind(kind);
  if (!table) return;

  const dbPool = getDbPool();
  const client = await dbPool.connect();

  try {
    await client.query(`DELETE FROM ${table} WHERE id = $1`, [eventId]);
  } catch (error) {
    console.error(`Failed to delete cached event ${eventId}:`, error);
  } finally {
    client.release();
  }
}

// Delete cached events by IDs across all tables
export async function deleteCachedEventsByIds(
  eventIds: string[]
): Promise<void> {
  if (eventIds.length === 0) return;

  const dbPool = getDbPool();
  const client = await dbPool.connect();

  // All tables that can store events
  const tables = [
    "product_events",
    "review_events",
    "message_events",
    "profile_events",
    "wallet_events",
    "community_events",
    "config_events",
  ];

  try {
    await client.query("BEGIN");

    for (const table of tables) {
      await client.query(`DELETE FROM ${table} WHERE id = ANY($1)`, [eventIds]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to delete cached events:", error);
  } finally {
    client.release();
  }
}

// Close the database pool
export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}