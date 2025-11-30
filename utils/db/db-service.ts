import { Pool } from "pg";
import { NostrEvent } from "../types/types";

let pool: Pool | null = null;
let tablesInitialized = false;
let initializingTables = false;

// Queue for serializing cache operations
let cacheQueue: Promise<void> = Promise.resolve();

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
    `);

    tablesInitialized = true;
    initializingTables = false;
    console.log("Database tables initialized successfully");
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
          text: `DELETE FROM ${table} WHERE pubkey = $1 AND kind = $2 AND tags::text LIKE $3`,
          values: [event.pubkey, event.kind, `%"d","${dTag}"%`] as any[],
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
              console.log(
                `Database error detected (${
                  isDeadlock ? "deadlock" : "connection error"
                }), retrying in ${delay}ms (attempt ${attempt}/${maxRetries})...`
              );
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
            `DELETE FROM ${table} WHERE pubkey = $1 AND kind = $2 AND tags::text LIKE $3 AND id != $4`,
            [event.pubkey, event.kind, `%"d","${dTag}"%`, event.id] as any[]
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

// Fetch all messages from database
export async function fetchAllMessagesFromDb(
  pubkey?: string
): Promise<NostrEvent[]> {
  return fetchCachedEvents(1059, { pubkey });
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

// Close the database pool
export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
