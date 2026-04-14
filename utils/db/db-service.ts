import { Pool, PoolClient } from "pg";
import { NostrEvent } from "../types/types";
import { findListingBySlug } from "../url-slugs";

let pool: Pool | null = null;
let tablesInitialized = false;
let initializingTables = false;

// Queue for serializing cache operations
let cacheQueue: Promise<void> = Promise.resolve();

export async function ensureFailedRelayPublishesTable(
  client: PoolClient
): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS failed_relay_publishes (
      event_id TEXT PRIMARY KEY,
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
}

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
      max: 10, // Increased pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 20000, // Increased timeout
      allowExitOnIdle: true,
    });

    // Handle pool errors
    pool.on("error", (err) => {
      console.error("Unexpected error on idle database client", err);
    });

    // Auto-create tables on first connection (only once)
    if (!tablesInitialized && !initializingTables) {
      initializingTables = true;
      initializeTables().catch((error) => {
        console.error("Failed to initialize database tables:", error);
        initializingTables = false;
      });
    }
  }
  return pool;
}

// Auto-create all tables if they don't exist
async function initializeTables(): Promise<void> {
  if (tablesInitialized) return;

  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();

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
      CREATE INDEX IF NOT EXISTS idx_review_events_tags ON review_events USING gin (tags jsonb_path_ops);

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
          is_read BOOLEAN DEFAULT FALSE,
          order_status TEXT DEFAULT NULL,
          order_id TEXT DEFAULT NULL,
          CONSTRAINT message_events_kind_check CHECK (kind = 1059)
      );

      CREATE INDEX IF NOT EXISTS idx_message_events_pubkey ON message_events(pubkey);
      CREATE INDEX IF NOT EXISTS idx_message_events_created_at ON message_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_message_events_is_read ON message_events(is_read);
      CREATE INDEX IF NOT EXISTS idx_message_events_order_id ON message_events(order_id);
      CREATE INDEX IF NOT EXISTS idx_message_events_tags_p ON message_events USING gin (tags jsonb_path_ops);

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

      -- Discount codes table
      CREATE TABLE IF NOT EXISTS discount_codes (
          id SERIAL PRIMARY KEY,
          code TEXT NOT NULL,
          pubkey TEXT NOT NULL,
          discount_percentage DECIMAL(5,2) NOT NULL CHECK (discount_percentage > 0 AND discount_percentage <= 100),
          expiration BIGINT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(code, pubkey)
      );

      CREATE INDEX IF NOT EXISTS idx_discount_codes_pubkey ON discount_codes(pubkey);
      CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code);

      -- MCP API Keys table
      CREATE TABLE IF NOT EXISTS mcp_api_keys (
          id SERIAL PRIMARY KEY,
          key_prefix TEXT NOT NULL,
          key_hash TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          pubkey TEXT NOT NULL,
          permissions TEXT NOT NULL DEFAULT 'read' CHECK (permissions IN ('read', 'read_write')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_used_at TIMESTAMP,
          is_active BOOLEAN DEFAULT TRUE
      );

      CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_key_hash ON mcp_api_keys(key_hash);
      CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_pubkey ON mcp_api_keys(pubkey);

      -- MCP Orders table
      CREATE TABLE IF NOT EXISTS mcp_orders (
          id SERIAL PRIMARY KEY,
          order_id TEXT NOT NULL UNIQUE,
          api_key_id INTEGER REFERENCES mcp_api_keys(id),
          buyer_pubkey TEXT NOT NULL,
          seller_pubkey TEXT NOT NULL,
          product_id TEXT NOT NULL,
          product_title TEXT,
          quantity INTEGER NOT NULL DEFAULT 1,
          amount_total NUMERIC(12,2) NOT NULL,
          currency TEXT NOT NULL DEFAULT 'sats',
          shipping_address JSONB,
          payment_ref TEXT,
          payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'paid', 'failed', 'refunded')),
          order_status TEXT NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_mcp_orders_order_id ON mcp_orders(order_id);
      CREATE INDEX IF NOT EXISTS idx_mcp_orders_buyer_pubkey ON mcp_orders(buyer_pubkey);
      CREATE INDEX IF NOT EXISTS idx_mcp_orders_seller_pubkey ON mcp_orders(seller_pubkey);
      CREATE INDEX IF NOT EXISTS idx_mcp_orders_api_key_id ON mcp_orders(api_key_id);

      -- Shop slugs table (storefront URL slugs)
      CREATE TABLE IF NOT EXISTS shop_slugs (
          pubkey TEXT PRIMARY KEY,
          slug TEXT NOT NULL UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_shop_slugs_slug ON shop_slugs(slug);

      -- Custom domains table (storefront custom domains)
      CREATE TABLE IF NOT EXISTS custom_domains (
          pubkey TEXT PRIMARY KEY,
          domain TEXT NOT NULL UNIQUE,
          shop_slug TEXT NOT NULL,
          verified BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_custom_domains_domain ON custom_domains(domain);
    `);

    // Migration: Add is_read, order_status, order_id columns to existing message_events tables
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'message_events' AND column_name = 'is_read'
        ) THEN
          ALTER TABLE message_events ADD COLUMN is_read BOOLEAN DEFAULT FALSE;
          CREATE INDEX IF NOT EXISTS idx_message_events_is_read ON message_events(is_read);
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'message_events' AND column_name = 'order_status'
        ) THEN
          ALTER TABLE message_events ADD COLUMN order_status TEXT DEFAULT NULL;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'message_events' AND column_name = 'order_id'
        ) THEN
          ALTER TABLE message_events ADD COLUMN order_id TEXT DEFAULT NULL;
          CREATE INDEX IF NOT EXISTS idx_message_events_order_id ON message_events(order_id);
        END IF;
      END $$;
    `);

    await ensureFailedRelayPublishesTable(client);

    tablesInitialized = true;
    initializingTables = false;
  } catch (error) {
    console.error("Failed to initialize tables:", error);
    initializingTables = false;
    throw error;
  } finally {
    if (client) {
      client.release();
    }
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

// Helper function to check if event kind should only keep latest per pubkey
function shouldKeepOnlyLatest(kind: number): boolean {
  // Wallet config (17375), wallet state (37375), relay list (10002), blossom servers (10063)
  // User profile (0), shop profile (30019), community definition (34550)
  return [17375, 37375, 10002, 10063, 0, 30019, 34550].includes(kind);
}

// Helper function to check if event is a review (needs special handling per product)
function isReviewEvent(kind: number): boolean {
  return kind === 31555;
}

export function buildReviewDTagFilter(dTag: string): string {
  return JSON.stringify([["d", dTag]]);
}

// Cache a single event to the database
export async function cacheEvent(event: NostrEvent): Promise<void> {
  const table = getTableForKind(event.kind);
  if (!table) {
    console.warn(`No table mapping for event kind ${event.kind}`);
    return;
  }

  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    // For events that should only keep the latest version per pubkey
    if (shouldKeepOnlyLatest(event.kind)) {
      await client.query("BEGIN");

      // Delete older events from the same pubkey with the same kind
      const deleteQuery = {
        text: `DELETE FROM ${table} WHERE pubkey = $1 AND kind = $2`,
        values: [event.pubkey, event.kind] as any[],
      };
      await client.query(deleteQuery);

      // Insert the new event
      const insertQuery = {
        text: `INSERT INTO ${table} (id, pubkey, created_at, kind, tags, content, sig)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
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
      await client.query(insertQuery);

      await client.query("COMMIT");
    } else if (isReviewEvent(event.kind)) {
      // For reviews, keep only the latest per pubkey per product
      await client.query("BEGIN");

      // Extract the product identifier from the 'd' tag (format: "30402:merchant_pubkey:product_d_tag")
      const dTag = event.tags.find((tag) => tag[0] === "d")?.[1];

      if (dTag) {
        // Delete older reviews from the same pubkey for the same product
        const deleteQuery = {
          text: `DELETE FROM ${table} WHERE pubkey = $1 AND kind = $2 AND tags @> $3::jsonb`,
          values: [
            event.pubkey,
            event.kind,
            buildReviewDTagFilter(dTag),
          ] as any[],
        };
        await client.query(deleteQuery);
      }

      // Insert the new review
      const insertQuery = {
        text: `INSERT INTO ${table} (id, pubkey, created_at, kind, tags, content, sig)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
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
      await client.query(insertQuery);

      await client.query("COMMIT");
    } else {
      // For other events, use the normal upsert behavior
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
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Failed to rollback transaction:", rollbackError);
      }
    }
    console.error("Failed to cache event %s:", event.id, error);
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Cache multiple events in a batch with retry logic for deadlocks
export async function cacheEvents(events: NostrEvent[]): Promise<void> {
  if (events.length === 0) return;

  // Queue the operation to prevent overwhelming the pool
  return new Promise((resolve, reject) => {
    cacheQueue = cacheQueue
      .then(async () => {
        const maxRetries = 3;
        let attempt = 0;

        while (attempt < maxRetries) {
          try {
            await cacheEventsTransaction(events);
            resolve();
            return;
          } catch (error: any) {
            const isDeadlock = error?.code === "40P01";
            const isConnectionError =
              error?.message?.includes("Connection terminated") ||
              error?.message?.includes("Connection timeout");

            if ((isDeadlock || isConnectionError) && attempt < maxRetries - 1) {
              attempt++;
              const delay = 100 * Math.pow(2, attempt);
              await new Promise((res) => setTimeout(res, delay));
            } else {
              reject(error);
              return;
            }
          }
        }
      })
      .catch(reject);
  });
}

// Internal function to perform the actual transaction
async function cacheEventsTransaction(events: NostrEvent[]): Promise<void> {
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
  let client;

  try {
    client = await dbPool.connect();
    await client.query("BEGIN");

    for (const [table, tableEvents] of eventsByTable.entries()) {
      // Group events by type
      const latestOnlyEvents = tableEvents.filter((e) =>
        shouldKeepOnlyLatest(e.kind)
      );
      const reviewEvents = tableEvents.filter((e) => isReviewEvent(e.kind));
      const regularEvents = tableEvents.filter(
        (e) => !shouldKeepOnlyLatest(e.kind) && !isReviewEvent(e.kind)
      );

      // Handle latest-only events (per pubkey) - batch by pubkey+kind to reduce queries
      const latestByPubkeyKind = new Map<string, NostrEvent>();
      for (const event of latestOnlyEvents) {
        const key = `${event.pubkey}:${event.kind}`;
        const existing = latestByPubkeyKind.get(key);
        if (!existing || event.created_at > existing.created_at) {
          latestByPubkeyKind.set(key, event);
        }
      }

      for (const event of latestByPubkeyKind.values()) {
        // First, lock and delete old rows
        await client.query(
          `DELETE FROM ${table} WHERE pubkey = $1 AND kind = $2 AND id != $3`,
          [event.pubkey, event.kind, event.id] as any[]
        );

        // Then insert/update with ON CONFLICT
        const upsertQuery = {
          text: `
            INSERT INTO ${table} (id, pubkey, created_at, kind, tags, content, sig)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO UPDATE SET
              pubkey = EXCLUDED.pubkey,
              created_at = EXCLUDED.created_at,
              tags = EXCLUDED.tags,
              content = EXCLUDED.content,
              sig = EXCLUDED.sig,
              cached_at = CURRENT_TIMESTAMP
          `,
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
        await client.query(upsertQuery);
      }

      // Handle review events (latest per pubkey per product) - batch by pubkey+dtag
      const latestReviewByPubkeyDtag = new Map<string, NostrEvent>();
      for (const event of reviewEvents) {
        const dTag = event.tags.find((tag) => tag[0] === "d")?.[1];
        if (dTag) {
          const key = `${event.pubkey}:${dTag}`;
          const existing = latestReviewByPubkeyDtag.get(key);
          if (!existing || event.created_at > existing.created_at) {
            latestReviewByPubkeyDtag.set(key, event);
          }
        }
      }

      for (const event of latestReviewByPubkeyDtag.values()) {
        const dTag = event.tags.find((tag) => tag[0] === "d")?.[1];

        if (dTag) {
          // First, lock and delete old rows
          await client.query(
            `DELETE FROM ${table} WHERE pubkey = $1 AND kind = $2 AND tags @> $3::jsonb AND id != $4`,
            [
              event.pubkey,
              event.kind,
              buildReviewDTagFilter(dTag),
              event.id,
            ] as any[]
          );

          // Then insert/update with ON CONFLICT
          const upsertQuery = {
            text: `
              INSERT INTO ${table} (id, pubkey, created_at, kind, tags, content, sig)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              ON CONFLICT (id) DO UPDATE SET
                pubkey = EXCLUDED.pubkey,
                created_at = EXCLUDED.created_at,
                tags = EXCLUDED.tags,
                content = EXCLUDED.content,
                sig = EXCLUDED.sig,
                cached_at = CURRENT_TIMESTAMP
            `,
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
          await client.query(upsertQuery);
        }
      }

      // Handle regular events with upsert
      for (const event of regularEvents) {
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
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Failed to rollback transaction:", rollbackError);
      }
    }
    console.error("Failed to cache events batch:", error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
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

  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    let query = `SELECT id, pubkey, created_at, kind, tags, content, sig FROM ${table} WHERE kind = $1`;
    const params: any[] = [kind];
    let paramIndex = 2;

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
    if (client) {
      client.release();
    }
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
  let client;

  try {
    client = await dbPool.connect();
    await client.query(`DELETE FROM ${table} WHERE id = $1`, [eventId]);
  } catch (error) {
    console.error(`Failed to delete cached event ${eventId}:`, error);
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Delete cached events by IDs across all tables
export async function deleteCachedEventsByIds(
  eventIds: string[]
): Promise<void> {
  if (eventIds.length === 0) return;

  const dbPool = getDbPool();
  let client;

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
    client = await dbPool.connect();
    await client.query("BEGIN");

    for (const table of tables) {
      await client.query(`DELETE FROM ${table} WHERE id = ANY($1)`, [eventIds]);
    }

    await client.query("COMMIT");
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Failed to rollback transaction:", rollbackError);
      }
    }
    console.error("Failed to delete cached events:", error);
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Fetch all products from database
export async function fetchAllProductsFromDb(): Promise<NostrEvent[]> {
  return fetchCachedEvents(30402);
}

// Fetch all reviews from database
export async function fetchAllReviewsFromDb(): Promise<NostrEvent[]> {
  return fetchCachedEvents(31555);
}

// Fetch all messages from database with read status
export async function fetchAllMessagesFromDb(
  pubkey?: string
): Promise<(NostrEvent & { is_read: boolean })[]> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    let query = `SELECT id, pubkey, created_at, kind, tags, content, sig, COALESCE(is_read, FALSE) as is_read 
                 FROM message_events WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (pubkey) {
      query += ` AND EXISTS (SELECT 1 FROM jsonb_array_elements(tags) elem WHERE elem->>0 = 'p' AND elem->>1 = $${paramIndex++})`;
      params.push(pubkey);
    }

    query += " ORDER BY created_at DESC";

    const result = await client.query(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      pubkey: row.pubkey,
      created_at: row.created_at,
      kind: row.kind,
      tags: row.tags,
      content: row.content,
      sig: row.sig,
      is_read: row.is_read,
    }));
  } catch (error) {
    console.error("Failed to fetch messages from database:", error);
    return [];
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Mark messages as read in database
export async function markMessagesAsRead(
  messageIds: string[],
  pubkey: string
): Promise<void> {
  if (messageIds.length === 0) return;

  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    await client.query(
      `UPDATE message_events
       SET is_read = TRUE
       WHERE id = ANY($1)
       AND (
         pubkey = $2
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(tags) elem
           WHERE elem->>0 = 'p' AND elem->>1 = $2
         )
       )`,
      [messageIds, pubkey] as any[]
    );
  } catch (error) {
    console.error("Failed to mark messages as read:", error);
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Get unread message count for a user
export async function getUnreadMessageCount(pubkey: string): Promise<number> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const result = await client.query(
      `SELECT COUNT(*) FROM message_events WHERE pubkey = $1 AND (is_read = FALSE OR is_read IS NULL)`,
      [pubkey]
    );
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    console.error("Failed to get unread message count:", error);
    return 0;
  } finally {
    if (client) {
      client.release();
    }
  }
}

export async function getOrderParticipants(orderId: string): Promise<{
  buyerPubkey: string | null;
  sellerPubkey: string | null;
}> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const result = await client.query<{ tags: string[][] }>(
      `SELECT tags
       FROM message_events
       WHERE order_id = $1
       ORDER BY created_at DESC`,
      [orderId] as any[]
    );

    let buyerPubkey: string | null = null;
    let sellerPubkey: string | null = null;

    for (const row of result.rows) {
      const tags = Array.isArray(row.tags) ? (row.tags as string[][]) : [];

      if (!buyerPubkey) {
        const buyerTag = tags.find((tag) => tag[0] === "b");
        if (buyerTag?.[1]) {
          buyerPubkey = buyerTag[1];
        }
      }

      if (!sellerPubkey) {
        const itemTag = tags.find((tag) => tag[0] === "item");
        const productAddress =
          tags.find((tag) => tag[0] === "a")?.[1] || itemTag?.[1];
        const addressParts = productAddress?.split(":");
        if (addressParts && addressParts.length >= 2 && addressParts[1]) {
          sellerPubkey = addressParts[1];
        }
      }

      if (buyerPubkey && sellerPubkey) {
        break;
      }
    }

    return { buyerPubkey, sellerPubkey };
  } catch (error) {
    console.error("Failed to get order participants:", error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Update order status in database
export async function updateOrderStatus(
  orderId: string,
  status: string,
  pubkey: string,
  messageId?: string
): Promise<void> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();

    if (messageId) {
      await client.query(
        `UPDATE message_events
         SET order_status = $1
         WHERE id = $2
         AND order_id = $3
         AND (
           pubkey = $4
           OR EXISTS (
             SELECT 1
             FROM jsonb_array_elements(tags) elem
             WHERE elem->>0 = 'p' AND elem->>1 = $4
           )
         )`,
        [status, messageId, orderId, pubkey]
      );
    }

    await client.query(
      `UPDATE message_events
       SET order_status = $1
       WHERE order_id = $2
       AND (
         pubkey = $3
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(tags) elem
           WHERE elem->>0 = 'p' AND elem->>1 = $3
         )
       )`,
      [status, orderId, pubkey]
    );
  } catch (error) {
    console.error("Failed to update order status:", error);
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Get order statuses from database
export async function getOrderStatuses(
  orderIds: string[]
): Promise<Record<string, string>> {
  if (orderIds.length === 0) return {};

  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();

    const result = await client.query(
      `SELECT DISTINCT ON (order_id) order_id, order_status 
       FROM message_events 
       WHERE order_id = ANY($1) AND order_status IS NOT NULL
       ORDER BY order_id, created_at DESC`,
      [orderIds]
    );

    const statuses: Record<string, string> = {};
    for (const row of result.rows) {
      if (row.order_id && row.order_status) {
        statuses[row.order_id] = row.order_status;
      }
    }

    return statuses;
  } catch (error) {
    console.error("Failed to get order statuses:", error);
    return {};
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Fetch all profiles from database (both user and shop profiles)
export async function fetchAllProfilesFromDb(): Promise<NostrEvent[]> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const query = `SELECT id, pubkey, created_at, kind, tags, content, sig 
                   FROM profile_events 
                   ORDER BY created_at DESC`;

    const result = await client.query(query);

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
    console.error("Failed to fetch profiles from database:", error);
    return [];
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Fetch wallet events from database
export async function fetchAllWalletEventsFromDb(
  pubkey: string
): Promise<NostrEvent[]> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const query = `SELECT id, pubkey, created_at, kind, tags, content, sig 
                   FROM wallet_events 
                   WHERE pubkey = $1
                   ORDER BY created_at DESC`;

    const result = await client.query(query, [pubkey]);

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
    console.error("Failed to fetch wallet events from database:", error);
    return [];
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Fetch all communities from database
export async function fetchAllCommunitiesFromDb(): Promise<NostrEvent[]> {
  return fetchCachedEvents(34550);
}

// Fetch relay config events from database
export async function fetchRelayConfigFromDb(
  pubkey: string
): Promise<NostrEvent[]> {
  return fetchCachedEvents(10002, { pubkey });
}

// Fetch blossom server config from database
export async function fetchBlossomConfigFromDb(
  pubkey: string
): Promise<NostrEvent[]> {
  return fetchCachedEvents(10063, { pubkey });
}

// Add discount code
export async function addDiscountCode(
  code: string,
  pubkey: string,
  discountPercentage: number,
  expiration?: number
): Promise<void> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const query = {
      text: `INSERT INTO discount_codes (code, pubkey, discount_percentage, expiration)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (code, pubkey) DO UPDATE SET
               discount_percentage = EXCLUDED.discount_percentage,
               expiration = EXCLUDED.expiration`,
      values: [code, pubkey, discountPercentage, expiration || null] as any[],
    };
    await client.query(query);
  } catch (error) {
    console.error("Failed to add discount code:", error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Get discount codes for a merchant
export async function getDiscountCodesByPubkey(pubkey: string): Promise<
  Array<{
    code: string;
    discount_percentage: number;
    expiration: number | null;
  }>
> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const result = await client.query(
      `SELECT code, discount_percentage, expiration FROM discount_codes WHERE pubkey = $1 ORDER BY created_at DESC`,
      [pubkey]
    );
    return result.rows;
  } catch (error) {
    console.error("Failed to fetch discount codes:", error);
    return [];
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Validate and get discount code
export async function validateDiscountCode(
  code: string,
  pubkey: string
): Promise<{ valid: boolean; discount_percentage?: number }> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const result = await client.query(
      `SELECT discount_percentage, expiration FROM discount_codes WHERE code = $1 AND pubkey = $2`,
      [code, pubkey]
    );

    if (result.rows.length === 0) {
      return { valid: false };
    }

    const { discount_percentage, expiration } = result.rows[0];

    // Check if code is expired
    if (expiration && Date.now() / 1000 > expiration) {
      return { valid: false };
    }

    return { valid: true, discount_percentage };
  } catch (error) {
    console.error("Failed to validate discount code:", error);
    return { valid: false };
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Delete discount code
export async function deleteDiscountCode(
  code: string,
  pubkey: string
): Promise<void> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    await client.query(
      `DELETE FROM discount_codes WHERE code = $1 AND pubkey = $2`,
      [code, pubkey]
    );
  } catch (error) {
    console.error("Failed to delete discount code:", error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Marketplace stats: listing count + distinct seller count
export async function fetchMarketplaceStats(): Promise<{
  listingCount: number;
  sellerCount: number;
}> {
  const dbPool = getDbPool();
  let client;
  try {
    client = await dbPool.connect();
    const result = await client.query<{
      listing_count: string;
      seller_count: string;
    }>(
      `SELECT COUNT(*) AS listing_count, COUNT(DISTINCT pubkey) AS seller_count FROM product_events`
    );
    const row = result.rows[0];
    return {
      listingCount: parseInt(row?.listing_count ?? "0", 10) || 0,
      sellerCount: parseInt(row?.seller_count ?? "0", 10) || 0,
    };
  } catch (err) {
    console.error("fetchMarketplaceStats error:", err);
    return { listingCount: 0, sellerCount: 0 };
  } finally {
    if (client) client.release();
  }
}

// Close the database pool
export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

function profileNameToSlug(name: string): string {
  if (!name) return "";
  return name
    .trim()
    .replace(/[#?&\/\\%=+<>{}|^~\[\]`@!$*()"';:,]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function fetchProductByIdFromDb(
  id: string
): Promise<NostrEvent | null> {
  const dbPool = getDbPool();
  let client;
  try {
    client = await dbPool.connect();
    const result = await client.query(
      `SELECT id, pubkey, created_at, kind, tags, content, sig
       FROM product_events WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      pubkey: row.pubkey,
      created_at: row.created_at,
      kind: row.kind,
      tags: row.tags,
      content: row.content,
      sig: row.sig,
    };
  } catch (error) {
    console.error("Failed to fetch product by id:", error);
    return null;
  } finally {
    if (client) client.release();
  }
}

export async function fetchProductByDTagAndPubkey(
  dTag: string,
  pubkey: string
): Promise<NostrEvent | null> {
  const dbPool = getDbPool();
  let client;
  try {
    client = await dbPool.connect();
    const result = await client.query(
      `SELECT id, pubkey, created_at, kind, tags, content, sig
       FROM product_events
       WHERE pubkey = $1
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(tags) t
           WHERE t->>0 = 'd' AND t->>1 = $2
         )
       ORDER BY created_at DESC LIMIT 1`,
      [pubkey, dTag]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      pubkey: row.pubkey,
      created_at: row.created_at,
      kind: row.kind,
      tags: row.tags,
      content: row.content,
      sig: row.sig,
    };
  } catch (error) {
    console.error("Failed to fetch product by d-tag and pubkey:", error);
    return null;
  } finally {
    if (client) client.release();
  }
}

export async function fetchProductByListingSlug(
  slug: string
): Promise<NostrEvent | null> {
  const dbPool = getDbPool();
  let client;
  try {
    client = await dbPool.connect();
    const result = await client.query(
      `SELECT id, pubkey, created_at, kind, tags, content, sig
       FROM product_events
       WHERE EXISTS (
         SELECT 1 FROM jsonb_array_elements(tags) t WHERE t->>0 = 'title'
       )
       ORDER BY created_at DESC`
    );
    const matchingRow = findListingBySlug(
      slug,
      result.rows
        .map((row) => {
          const tags: string[][] = row.tags;
          const titleTag = tags.find((t) => t[0] === "title");
          const title = titleTag?.[1];

          if (!title) {
            return null;
          }

          return {
            row,
            id: row.id,
            pubkey: row.pubkey,
            title,
          };
        })
        .filter(
          (
            candidate
          ): candidate is {
            row: (typeof result.rows)[number];
            id: string;
            pubkey: string;
            title: string;
          } => candidate !== null
        )
    );

    if (!matchingRow) return null;

    const row = matchingRow.row;
    return {
      id: row.id,
      pubkey: row.pubkey,
      created_at: row.created_at,
      kind: row.kind,
      tags: row.tags,
      content: row.content,
      sig: row.sig,
    };
  } catch (error) {
    console.error("Failed to fetch product by listing slug:", error);
    return null;
  } finally {
    if (client) client.release();
  }
}

export async function fetchShopProfileByPubkeyFromDb(
  pubkey: string
): Promise<NostrEvent | null> {
  const dbPool = getDbPool();
  let client;
  try {
    client = await dbPool.connect();
    const result = await client.query(
      `SELECT id, pubkey, created_at, kind, tags, content, sig
       FROM profile_events
       WHERE pubkey = $1 AND kind = 30019
       ORDER BY created_at DESC LIMIT 1`,
      [pubkey]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      pubkey: row.pubkey,
      created_at: row.created_at,
      kind: row.kind,
      tags: row.tags,
      content: row.content,
      sig: row.sig,
    };
  } catch (error) {
    console.error("Failed to fetch shop profile by pubkey:", error);
    return null;
  } finally {
    if (client) client.release();
  }
}

export async function fetchProfilePubkeyByNameSlug(
  nameSlug: string
): Promise<string | null> {
  const dbPool = getDbPool();
  let client;
  try {
    client = await dbPool.connect();
    const result = await client.query(
      `SELECT pubkey, content FROM profile_events WHERE kind = 0 ORDER BY created_at DESC`
    );
    const pubkeySuffixMatch = nameSlug.match(/^(.+)-([a-f0-9]{8})$/);
    const baseSlug = pubkeySuffixMatch?.[1];
    const pubkeyFragment = pubkeySuffixMatch?.[2];

    let exactMatch: string | null = null;
    let exactMatchCount = 0;
    let disambiguatedMatch: string | null = null;

    for (const row of result.rows) {
      let profileName: string | undefined;
      try {
        const content = JSON.parse(row.content);
        profileName = content.name;
      } catch {
        continue;
      }
      if (!profileName) continue;
      const slug = profileNameToSlug(profileName);

      if (slug === nameSlug) {
        exactMatchCount += 1;
        if (exactMatchCount > 1) {
          return null;
        }

        exactMatch = row.pubkey;
      }

      if (
        !exactMatch &&
        !disambiguatedMatch &&
        baseSlug &&
        pubkeyFragment &&
        slug === baseSlug &&
        row.pubkey.startsWith(pubkeyFragment)
      ) {
        disambiguatedMatch = row.pubkey;
      }
    }

    if (exactMatch) {
      return exactMatch;
    }

    return disambiguatedMatch;
  } catch (error) {
    console.error("Failed to fetch profile pubkey by name slug:", error);
    return null;
  } finally {
    if (client) client.release();
  }
}

export async function fetchShopPubkeyBySlug(
  slug: string
): Promise<string | null> {
  const dbPool = getDbPool();
  let client;
  try {
    client = await dbPool.connect();
    const result = await client.query(
      `SELECT pubkey FROM shop_slugs WHERE slug = $1 LIMIT 1`,
      [slug.toLowerCase().trim()]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].pubkey;
  } catch (error) {
    console.error("Failed to fetch shop pubkey by slug:", error);
    return null;
  } finally {
    if (client) client.release();
  }
}

export async function fetchCommunityByPubkeyAndIdentifier(
  pubkey: string,
  identifier: string
): Promise<NostrEvent | null> {
  const dbPool = getDbPool();
  let client;
  try {
    client = await dbPool.connect();
    const result = await client.query(
      `SELECT id, pubkey, created_at, kind, tags, content, sig
       FROM community_events
       WHERE pubkey = $1 AND kind = 34550
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(tags) t
           WHERE t->>0 = 'd' AND t->>1 = $2
         )
       ORDER BY created_at DESC LIMIT 1`,
      [pubkey, identifier]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      pubkey: row.pubkey,
      created_at: row.created_at,
      kind: row.kind,
      tags: row.tags,
      content: row.content,
      sig: row.sig,
    };
  } catch (error) {
    console.error("Failed to fetch community by pubkey and identifier:", error);
    return null;
  } finally {
    if (client) client.release();
  }
}
