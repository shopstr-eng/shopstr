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
    // Extract the endpoint ID and construct proper pooler URL
    const url = new URL(databaseUrl);
    const hostname = url.hostname;
    // Match pattern like: ep-lucky-union-aefj3mfs.us-east-2.aws.neon.tech
    // Transform to: ep-lucky-union-aefj3mfs-pooler.us-east-2.aws.neon.tech
    const poolerHostname = hostname.replace(/^([^.]+)\./, "$1-pooler.");
    url.hostname = poolerHostname;
    const poolUrl = url.toString();

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

      -- Stripe Connect accounts table
      CREATE TABLE IF NOT EXISTS stripe_connect_accounts (
          id SERIAL PRIMARY KEY,
          pubkey TEXT NOT NULL UNIQUE,
          stripe_account_id TEXT NOT NULL,
          onboarding_complete BOOLEAN DEFAULT FALSE,
          charges_enabled BOOLEAN DEFAULT FALSE,
          payouts_enabled BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_stripe_connect_pubkey ON stripe_connect_accounts(pubkey);
      CREATE INDEX IF NOT EXISTS idx_stripe_connect_account_id ON stripe_connect_accounts(stripe_account_id);

      -- Notification emails table for buyers and sellers
      CREATE TABLE IF NOT EXISTS notification_emails (
          id SERIAL PRIMARY KEY,
          pubkey TEXT,
          email TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('buyer', 'seller')),
          order_id TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_notification_emails_pubkey ON notification_emails(pubkey);
      CREATE INDEX IF NOT EXISTS idx_notification_emails_order_id ON notification_emails(order_id);
      CREATE INDEX IF NOT EXISTS idx_notification_emails_role ON notification_emails(role);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_emails_seller_unique ON notification_emails(pubkey) WHERE role = 'seller';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_emails_buyer_order_unique ON notification_emails(order_id) WHERE role = 'buyer';

      -- Subscriptions table for recurring product subscriptions
      CREATE TABLE IF NOT EXISTS subscriptions (
          id SERIAL PRIMARY KEY,
          stripe_subscription_id TEXT NOT NULL UNIQUE,
          stripe_customer_id TEXT NOT NULL,
          buyer_pubkey TEXT,
          buyer_email TEXT NOT NULL,
          seller_pubkey TEXT NOT NULL,
          product_event_id TEXT NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1,
          variant_info JSONB,
          frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'every_2_weeks', 'monthly', 'every_2_months', 'quarterly')),
          discount_percent DECIMAL(5,2) NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
          base_price NUMERIC(12,2) NOT NULL,
          subscription_price NUMERIC(12,2) NOT NULL,
          currency TEXT NOT NULL DEFAULT 'usd',
          shipping_address JSONB,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'canceled')),
          next_billing_date TIMESTAMP,
          next_shipping_date TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_buyer_pubkey ON subscriptions(buyer_pubkey);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_buyer_email ON subscriptions(buyer_email);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_seller_pubkey ON subscriptions(seller_pubkey);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

      -- Subscription notifications table
      CREATE TABLE IF NOT EXISTS subscription_notifications (
          id SERIAL PRIMARY KEY,
          subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK (type IN ('renewal_reminder', 'address_change', 'cancellation')),
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          method TEXT NOT NULL CHECK (method IN ('email', 'nostr', 'both'))
      );

      CREATE INDEX IF NOT EXISTS idx_subscription_notifications_subscription_id ON subscription_notifications(subscription_id);
      CREATE INDEX IF NOT EXISTS idx_subscription_notifications_type ON subscription_notifications(type);
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'message_events' AND column_name = 'is_read'
        ) THEN
          ALTER TABLE message_events ADD COLUMN is_read BOOLEAN DEFAULT FALSE;
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
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_message_events_is_read ON message_events(is_read);
      CREATE INDEX IF NOT EXISTS idx_message_events_order_id ON message_events(order_id);
    `);

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
export async function markMessagesAsRead(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;

  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    await client.query(
      `UPDATE message_events SET is_read = TRUE WHERE id = ANY($1)`,
      [messageIds]
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

// Update order status in database
export async function updateOrderStatus(
  orderId: string,
  status: string,
  messageId?: string
): Promise<void> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();

    if (messageId) {
      await client.query(
        `UPDATE message_events SET order_status = $1, order_id = $2 WHERE id = $3`,
        [status, orderId, messageId]
      );
    }

    await client.query(
      `UPDATE message_events SET order_status = $1 WHERE order_id = $2`,
      [status, orderId]
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

// Get Stripe Connect account by pubkey
export async function getStripeConnectAccount(pubkey: string): Promise<{
  stripe_account_id: string;
  onboarding_complete: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
} | null> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const result = await client.query(
      `SELECT stripe_account_id, onboarding_complete, charges_enabled, payouts_enabled FROM stripe_connect_accounts WHERE pubkey = $1`,
      [pubkey]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  } catch (error) {
    console.error("Failed to get Stripe Connect account:", error);
    return null;
  } finally {
    if (client) client.release();
  }
}

// Create or update Stripe Connect account
export async function upsertStripeConnectAccount(
  pubkey: string,
  stripeAccountId: string,
  onboardingComplete: boolean = false,
  chargesEnabled: boolean = false,
  payoutsEnabled: boolean = false
): Promise<void> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    await client.query(
      `INSERT INTO stripe_connect_accounts (pubkey, stripe_account_id, onboarding_complete, charges_enabled, payouts_enabled, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (pubkey) DO UPDATE SET
         stripe_account_id = EXCLUDED.stripe_account_id,
         onboarding_complete = EXCLUDED.onboarding_complete,
         charges_enabled = EXCLUDED.charges_enabled,
         payouts_enabled = EXCLUDED.payouts_enabled,
         updated_at = CURRENT_TIMESTAMP`,
      [
        pubkey,
        stripeAccountId,
        onboardingComplete,
        chargesEnabled,
        payoutsEnabled,
      ] as any[]
    );
  } catch (error) {
    console.error("Failed to upsert Stripe Connect account:", error);
    throw error;
  } finally {
    if (client) client.release();
  }
}

// Save notification email for a buyer (per order) or seller (per pubkey)
export async function saveNotificationEmail(
  email: string,
  role: "buyer" | "seller",
  pubkey?: string,
  orderId?: string
): Promise<void> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();

    if (role === "seller" && pubkey) {
      const sellerQuery = `INSERT INTO notification_emails (pubkey, email, role, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (pubkey) WHERE role = 'seller'
         DO UPDATE SET email = EXCLUDED.email, updated_at = CURRENT_TIMESTAMP`;
      await client.query(sellerQuery, [pubkey, email, role]);
    } else if (role === "buyer" && orderId) {
      const buyerQuery = `INSERT INTO notification_emails (pubkey, email, role, order_id, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (order_id) WHERE role = 'buyer'
         DO UPDATE SET email = EXCLUDED.email, pubkey = EXCLUDED.pubkey, updated_at = CURRENT_TIMESTAMP`;
      const pubkeyValue: string = pubkey || "";
      await client.query(buyerQuery, [pubkeyValue, email, role, orderId]);
    }
  } catch (error) {
    console.error("Failed to save notification email:", error);
    throw error;
  } finally {
    if (client) client.release();
  }
}

// Get notification email for a seller by pubkey
export async function getSellerNotificationEmail(
  pubkey: string
): Promise<string | null> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const result = await client.query(
      `SELECT email FROM notification_emails WHERE pubkey = $1 AND role = 'seller' ORDER BY updated_at DESC LIMIT 1`,
      [pubkey]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].email;
  } catch (error) {
    console.error("Failed to get seller notification email:", error);
    return null;
  } finally {
    if (client) client.release();
  }
}

// Get buyer notification email for a specific order
export async function getBuyerNotificationEmail(
  orderId: string
): Promise<string | null> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const result = await client.query(
      `SELECT email FROM notification_emails WHERE order_id = $1 AND role = 'buyer' ORDER BY updated_at DESC LIMIT 1`,
      [orderId]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].email;
  } catch (error) {
    console.error("Failed to get buyer notification email:", error);
    return null;
  } finally {
    if (client) client.release();
  }
}

export async function getUserAuthEmail(pubkey: string): Promise<string | null> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();

    const tableCheck = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('email_auth', 'oauth_auth')`
    );
    const existingTables = new Set(
      tableCheck.rows.map((r: { table_name: string }) => r.table_name)
    );

    if (existingTables.has("email_auth")) {
      const result = await client.query(
        `SELECT email FROM email_auth WHERE pubkey = $1 LIMIT 1`,
        [pubkey]
      );
      if (result.rows.length > 0) return result.rows[0].email;
    }

    if (existingTables.has("oauth_auth")) {
      const result = await client.query(
        `SELECT email FROM oauth_auth WHERE pubkey = $1 LIMIT 1`,
        [pubkey]
      );
      if (result.rows.length > 0) return result.rows[0].email;
    }

    return null;
  } catch (error) {
    console.error("Failed to get user auth email:", error);
    return null;
  } finally {
    if (client) client.release();
  }
}

export interface SubscriptionRecord {
  id: number;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  buyer_pubkey: string | null;
  buyer_email: string;
  seller_pubkey: string;
  product_event_id: string;
  product_title: string | null;
  quantity: number;
  variant_info: any;
  frequency: string;
  discount_percent: number;
  base_price: number;
  subscription_price: number;
  currency: string;
  shipping_address: any;
  status: string;
  next_billing_date: string | null;
  next_shipping_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionNotificationRecord {
  id: number;
  subscription_id: number;
  type: string;
  sent_at: string;
  method: string;
}

export async function createSubscription(data: {
  stripe_subscription_id: string;
  stripe_customer_id: string;
  buyer_pubkey?: string | null;
  buyer_email: string;
  seller_pubkey: string;
  product_event_id: string;
  product_title?: string | null;
  quantity?: number;
  variant_info?: any;
  frequency: string;
  discount_percent: number;
  base_price: number;
  subscription_price: number;
  currency?: string;
  shipping_address?: any;
  status?: string;
  next_billing_date?: Date | null;
  next_shipping_date?: Date | null;
}): Promise<SubscriptionRecord> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const result = await client.query(
      `INSERT INTO subscriptions (
        stripe_subscription_id, stripe_customer_id, buyer_pubkey, buyer_email,
        seller_pubkey, product_event_id, product_title, quantity, variant_info, frequency,
        discount_percent, base_price, subscription_price, currency,
        shipping_address, status, next_billing_date, next_shipping_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        data.stripe_subscription_id,
        data.stripe_customer_id,
        data.buyer_pubkey || null,
        data.buyer_email,
        data.seller_pubkey,
        data.product_event_id,
        data.product_title || null,
        data.quantity || 1,
        data.variant_info ? JSON.stringify(data.variant_info) : null,
        data.frequency,
        data.discount_percent,
        data.base_price,
        data.subscription_price,
        data.currency || "usd",
        data.shipping_address ? JSON.stringify(data.shipping_address) : null,
        data.status || "active",
        data.next_billing_date || null,
        data.next_shipping_date || null,
      ] as any[]
    );
    return result.rows[0];
  } catch (error) {
    console.error("Failed to create subscription:", error);
    throw error;
  } finally {
    if (client) client.release();
  }
}

export async function getSubscriptionByStripeId(
  stripeSubscriptionId: string
): Promise<SubscriptionRecord | null> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const result = await client.query(
      `SELECT * FROM subscriptions WHERE stripe_subscription_id = $1`,
      [stripeSubscriptionId]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  } catch (error) {
    console.error("Failed to get subscription:", error);
    return null;
  } finally {
    if (client) client.release();
  }
}

export async function getSubscriptionById(
  id: number
): Promise<SubscriptionRecord | null> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const result = await client.query(
      `SELECT * FROM subscriptions WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  } catch (error) {
    console.error("Failed to get subscription by id:", error);
    return null;
  } finally {
    if (client) client.release();
  }
}

export async function getSubscriptionsByBuyerPubkey(
  buyerPubkey: string
): Promise<SubscriptionRecord[]> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const result = await client.query(
      `SELECT * FROM subscriptions WHERE buyer_pubkey = $1 ORDER BY created_at DESC`,
      [buyerPubkey]
    );
    return result.rows;
  } catch (error) {
    console.error("Failed to get subscriptions by buyer pubkey:", error);
    return [];
  } finally {
    if (client) client.release();
  }
}

export async function getSubscriptionsByBuyerEmail(
  buyerEmail: string
): Promise<SubscriptionRecord[]> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const result = await client.query(
      `SELECT * FROM subscriptions WHERE buyer_email = $1 ORDER BY created_at DESC`,
      [buyerEmail]
    );
    return result.rows;
  } catch (error) {
    console.error("Failed to get subscriptions by buyer email:", error);
    return [];
  } finally {
    if (client) client.release();
  }
}

export async function getSubscriptionsBySellerPubkey(
  sellerPubkey: string
): Promise<SubscriptionRecord[]> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const result = await client.query(
      `SELECT * FROM subscriptions WHERE seller_pubkey = $1 ORDER BY created_at DESC`,
      [sellerPubkey]
    );
    return result.rows;
  } catch (error) {
    console.error("Failed to get subscriptions by seller pubkey:", error);
    return [];
  } finally {
    if (client) client.release();
  }
}

export async function updateSubscriptionStatus(
  stripeSubscriptionId: string,
  status: string
): Promise<void> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    await client.query(
      `UPDATE subscriptions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = $2`,
      [status, stripeSubscriptionId]
    );
  } catch (error) {
    console.error("Failed to update subscription status:", error);
    throw error;
  } finally {
    if (client) client.release();
  }
}

export async function updateSubscriptionShippingAddress(
  stripeSubscriptionId: string,
  shippingAddress: any
): Promise<void> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    await client.query(
      `UPDATE subscriptions SET shipping_address = $1, updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = $2`,
      [JSON.stringify(shippingAddress), stripeSubscriptionId]
    );
  } catch (error) {
    console.error("Failed to update subscription shipping address:", error);
    throw error;
  } finally {
    if (client) client.release();
  }
}

export async function updateSubscriptionBillingDate(
  stripeSubscriptionId: string,
  nextBillingDate: Date,
  nextShippingDate?: Date
): Promise<void> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    if (nextShippingDate) {
      await client.query(
        `UPDATE subscriptions SET next_billing_date = $1, next_shipping_date = $2, updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = $3`,
        [nextBillingDate, nextShippingDate, stripeSubscriptionId] as any[]
      );
    } else {
      await client.query(
        `UPDATE subscriptions SET next_billing_date = $1, updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = $2`,
        [nextBillingDate, stripeSubscriptionId] as any[]
      );
    }
  } catch (error) {
    console.error("Failed to update subscription billing date:", error);
    throw error;
  } finally {
    if (client) client.release();
  }
}

export async function deleteSubscription(
  stripeSubscriptionId: string
): Promise<void> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    await client.query(
      `DELETE FROM subscriptions WHERE stripe_subscription_id = $1`,
      [stripeSubscriptionId]
    );
  } catch (error) {
    console.error("Failed to delete subscription:", error);
    throw error;
  } finally {
    if (client) client.release();
  }
}

export async function createSubscriptionNotification(data: {
  subscription_id: number;
  type: string;
  method: string;
}): Promise<SubscriptionNotificationRecord> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const result = await client.query(
      `INSERT INTO subscription_notifications (subscription_id, type, method)
       VALUES ($1, $2, $3) RETURNING *`,
      [data.subscription_id, data.type, data.method] as any[]
    );
    return result.rows[0] as SubscriptionNotificationRecord;
  } catch (error) {
    console.error("Failed to create subscription notification:", error);
    throw error;
  } finally {
    if (client) client.release();
  }
}

export async function getSubscriptionNotifications(
  subscriptionId: number
): Promise<SubscriptionNotificationRecord[]> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const result = await client.query(
      `SELECT * FROM subscription_notifications WHERE subscription_id = $1 ORDER BY sent_at DESC`,
      [subscriptionId]
    );
    return result.rows;
  } catch (error) {
    console.error("Failed to get subscription notifications:", error);
    return [];
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
