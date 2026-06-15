/**
 * @jest-environment node
 */

jest.setTimeout(180000);

import {
  ensureFailedRelayPublishesTable,
  getTableForKind,
  shouldKeepOnlyLatest,
  isReviewEvent,
  buildReviewDTagFilter,
  profileNameToSlug,
} from "../db-service";
import type { NostrEvent } from "../../types/types";
import type { QueryConfig } from "pg";

type DbServiceModule = typeof import("../db-service");

type SharedPostgresContainer = {
  getHost(): string;
  getMappedPort(port: number): number;
  stop(): Promise<unknown>;
};

type QueryInput = string | QueryConfig<unknown[]>;

type MockDbClient = {
  query: jest.Mock;
  release: jest.Mock;
};

type MockDbPool = {
  connect: jest.Mock;
  on: jest.Mock;
  end?: jest.Mock;
};

type FakePoolOptions = {
  connectionString: string;
  [key: string]: unknown;
};

let sharedPostgresContainer: SharedPostgresContainer | null = null;
let sharedPostgresHost = "";
let sharedPostgresPort = 0;

async function ensureSharedPostgresContainer(): Promise<void> {
  if (sharedPostgresContainer) return;
  const { PostgreSqlContainer } = await import("@testcontainers/postgresql");
  const container = await new PostgreSqlContainer("postgres:15-alpine")
    .withDatabase("shopstr")
    .withUsername("shopstr")
    .withPassword("shopstr")
    .start();
  sharedPostgresContainer = container;

  sharedPostgresHost = container.getHost();
  sharedPostgresPort = container.getMappedPort(5432);
}

function getDatabaseUrl(dbName: string): string {
  return `postgres://shopstr:shopstr@${sharedPostgresHost}:${sharedPostgresPort}/${dbName}`;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function withIsolatedDatabase<T>(
  callback: (databaseUrl: string) => Promise<T>
): Promise<T> {
  await ensureSharedPostgresContainer();

  // Unit tests in this file mock `pg`; ensure admin DB operations always use
  // the real driver.
  jest.unmock("pg");

  const dbName = `shopstr_test_${Date.now()}_${Math.floor(
    Math.random() * 1_000_000
  )}`;
  const adminUrl = getDatabaseUrl("postgres");
  const testDbUrl = getDatabaseUrl(dbName);

  const { Pool } = await import("pg");
  const adminPool = new Pool({ connectionString: adminUrl });
  const adminClient = await adminPool.connect();

  try {
    await adminClient.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
  } finally {
    adminClient.release();
    await adminPool.end();
  }

  try {
    return await callback(testDbUrl);
  } finally {
    const cleanupPool = new Pool({ connectionString: adminUrl });
    const cleanupClient = await cleanupPool.connect();
    try {
      await cleanupClient.query(
        `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
         WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [dbName]
      );
      await cleanupClient.query(
        `DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)}`
      );
    } finally {
      cleanupClient.release();
      await cleanupPool.end();
    }
  }
}

async function withPostgresTestContainer<T>(
  callback: (databaseUrl: string) => Promise<T>
): Promise<T> {
  return withIsolatedDatabase(callback);
}

async function withPostgresDbService<T>(
  callback: (db: DbServiceModule) => Promise<T>
): Promise<T> {
  return withPostgresTestContainer(async (databaseUrl) => {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL = databaseUrl;

    try {
      let result: T | undefined;
      await jest.isolateModulesAsync(async () => {
        jest.resetModules();
        jest.unmock("pg");
        const db = await import("../db-service");

        try {
          result = await callback(db);
        } finally {
          await db.closeDbPool();
        }
      });

      return result as T;
    } finally {
      process.env.DATABASE_URL = prev;
    }
  });
}

async function waitForTables(
  db: DbServiceModule,
  tableNames: string[]
): Promise<void> {
  const deadline = Date.now() + 10000;
  const pool = db.getDbPool();

  while (Date.now() < deadline) {
    const client = await pool.connect();
    try {
      const result = await client.query<{ tablename: string }>(
        `SELECT tablename
         FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename = ANY($1::text[])`,
        [tableNames]
      );

      if (result.rows.length === tableNames.length) {
        return;
      }
    } finally {
      client.release();
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for tables: ${tableNames.join(", ")}`);
}

async function waitForColumns(
  db: DbServiceModule,
  tableName: string,
  columnNames: string[]
): Promise<void> {
  const deadline = Date.now() + 10000;
  const pool = db.getDbPool();

  while (Date.now() < deadline) {
    const client = await pool.connect();
    try {
      const result = await client.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
           AND column_name = ANY($2::text[])`,
        [tableName, columnNames]
      );

      if (result.rows.length === columnNames.length) {
        return;
      }
    } finally {
      client.release();
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    `Timed out waiting for columns on ${tableName}: ${columnNames.join(", ")}`
  );
}

async function withLegacyPostgresDbService<T>(
  callback: (db: DbServiceModule) => Promise<T>
): Promise<T> {
  return withPostgresTestContainer(async (databaseUrl) => {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL = databaseUrl;

    try {
      const { Pool } = await import("pg");
      const setupPool = new Pool({ connectionString: databaseUrl });
      const client = await setupPool.connect();

      try {
        await client.query(`
          CREATE TABLE message_events (
              id TEXT PRIMARY KEY,
              pubkey TEXT NOT NULL,
              created_at BIGINT NOT NULL,
              kind INTEGER NOT NULL,
              tags JSONB NOT NULL,
              content TEXT NOT NULL,
              sig TEXT NOT NULL,
              cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE failed_relay_publishes (
              event_id TEXT PRIMARY KEY,
              event_data TEXT NOT NULL,
              relays TEXT NOT NULL,
              created_at BIGINT NOT NULL,
              retry_count INTEGER DEFAULT 0
          );

          INSERT INTO failed_relay_publishes (
            event_id,
            event_data,
            relays,
            created_at,
            retry_count
          ) VALUES (
            'legacy-failed',
            '{}',
            '[]',
            1,
            0
          );
        `);
      } finally {
        client.release();
        await setupPool.end();
      }

      try {
        let result: T | undefined;

        await jest.isolateModulesAsync(async () => {
          jest.resetModules();
          jest.unmock("pg");

          const db = await import("../db-service");

          try {
            result = await callback(db);
          } finally {
            await db.closeDbPool();
          }
        });

        return result as T;
      } finally {
        process.env.DATABASE_URL = prev;
      }
    } catch (error) {
      process.env.DATABASE_URL = prev;
      throw error;
    }
  });
}

function productEvent(overrides: Partial<NostrEvent>): NostrEvent {
  return {
    id: "product-event",
    pubkey: "seller",
    created_at: 1,
    kind: 30402,
    tags: [],
    content: "content",
    sig: "sig",
    ...overrides,
  };
}

function latestOnlyEvent(overrides: Partial<NostrEvent>): NostrEvent {
  return {
    id: "latest-only-event",
    pubkey: "latest-owner",
    created_at: 1,
    kind: 17375,
    tags: [],
    content: "content",
    sig: "sig",
    ...overrides,
  };
}

function reviewEvent(overrides: Partial<NostrEvent>): NostrEvent {
  return {
    id: "review-event",
    pubkey: "review-owner",
    created_at: 1,
    kind: 31555,
    tags: [["d", "listing-1"]],
    content: "content",
    sig: "sig",
    ...overrides,
  };
}

async function withMockedDbService<T>(
  client: MockDbClient,
  callback: (db: DbServiceModule, pool: MockDbPool) => Promise<T>
): Promise<T> {
  let result: T | undefined;

  await jest.isolateModulesAsync(async () => {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://test@localhost/testdb";
    try {
      const pool: MockDbPool = {
        connect: jest.fn(async () => client),
        on: jest.fn(),
        end: jest.fn(async () => undefined),
      };

      jest.doMock("pg", () => ({
        Pool: class {
          constructor() {
            return pool;
          }
        },
      }));

      const db = await import("../db-service");
      result = await callback(db, pool);
    } finally {
      process.env.DATABASE_URL = prev;
    }
  });

  return result as T;
}

describe("db-service helpers", () => {
  afterAll(async () => {
    if (sharedPostgresContainer) {
      await sharedPostgresContainer.stop();
      sharedPostgresContainer = null;
      sharedPostgresHost = "";
      sharedPostgresPort = 0;
    }
  });

  test("getTableForKind maps known kinds and returns null for unknown", () => {
    expect(getTableForKind(30402)).toBe("product_events");
    expect(getTableForKind(31555)).toBe("review_events");
    expect(getTableForKind(1059)).toBe("message_events");
    expect(getTableForKind(0)).toBe("profile_events");
    expect(getTableForKind(999999)).toBeNull();
  });

  const maybeItTc = process.env.RUN_TESTCONTAINERS === "1" ? test : test.skip;

  maybeItTc("testcontainers: initialize + failed publish flow", async () => {
    await withPostgresTestContainer(async (databaseUrl) => {
      const prev = process.env.DATABASE_URL;
      process.env.DATABASE_URL = databaseUrl;

      try {
        const { Pool } = await import("pg");
        const prepPool = new Pool({
          connectionString: process.env.DATABASE_URL,
        });
        const client = await prepPool.connect();
        try {
          // Use the inline ensure function exported from db-service to prepare table
          const dbSvc = await import("../db-service");
          await dbSvc.ensureFailedRelayPublishesTable(client);
        } finally {
          client.release();
          await prepPool.end();
        }

        const db = await import("../db-service");

        const event: NostrEvent = {
          id: `tc-${Date.now()}`,
          pubkey: "owner-tc",
          created_at: Math.floor(Date.now() / 1000),
          kind: 0,
          tags: [],
          content: "x",
          sig: "s",
        };

        const inserted = await db.trackFailedRelayPublishRecord({
          eventId: event.id,
          ownerPubkey: "owner-tc",
          event,
          relays: ["tc-relay"],
        });
        expect(inserted).toBe(true);

        const rows = await db.getFailedRelayPublishesForOwner("owner-tc");
        expect(rows.length).toBeGreaterThanOrEqual(1);
        expect(rows.some((r) => r?.eventId === event.id)).toBe(true);

        await db.closeDbPool();
      } finally {
        process.env.DATABASE_URL = prev;
      }
    });
  });

  test("trackFailedRelayPublishRecord returns false when ownership conflict blocks update", async () => {
    await jest.isolateModulesAsync(async () => {
      const prev = process.env.DATABASE_URL;
      process.env.DATABASE_URL = "postgres://test@localhost/testdb";

      try {
        const queries: Array<string | { text?: string }> = [];
        const client: MockDbClient = {
          query: jest.fn(async (q: QueryInput) => {
            queries.push(q);
            const text = typeof q === "string" ? q : q.text || "";

            if (text.includes("INSERT INTO failed_relay_publishes")) {
              return { rows: [], rowCount: 0 };
            }

            return { rows: [], rowCount: 1 };
          }),
          release: jest.fn(),
        };

        const pool: MockDbPool = {
          connect: jest.fn(async () => client),
          on: jest.fn(),
          end: jest.fn(async () => undefined),
        };

        jest.doMock("pg", () => ({
          Pool: class {
            constructor() {
              return pool;
            }
          },
        }));

        const db = await import("../db-service");

        const inserted = await db.trackFailedRelayPublishRecord({
          eventId: "failed-relay-1",
          ownerPubkey: "owner-a",
          event: {
            id: "failed-relay-1",
            pubkey: "owner-a",
            created_at: 1,
            kind: 0,
            tags: [],
            content: "x",
            sig: "s",
          } as NostrEvent,
          relays: ["relay-a"],
        });

        expect(inserted).toBe(false);
        expect(
          queries.some((query) =>
            (typeof query === "string" ? query : query.text || "").includes(
              "WHERE failed_relay_publishes.owner_pubkey = EXCLUDED.owner_pubkey"
            )
          )
        ).toBe(true);
        expect(client.release).toHaveBeenCalled();
      } finally {
        process.env.DATABASE_URL = prev;
      }
    });
  });

  test("getFailedRelayPublishesForOwner drops malformed rows and releases client", async () => {
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      const client: MockDbClient = {
        query: jest.fn(async (q: QueryInput) => {
          const text = typeof q === "string" ? q : q.text || "";

          if (
            text.includes("SELECT event_id, event_data, relays, retry_count")
          ) {
            return {
              rows: [
                {
                  event_id: "malformed-event",
                  event_data: "{",
                  relays: "[]",
                  retry_count: 1,
                },
                {
                  event_id: "valid-event",
                  event_data: JSON.stringify({
                    id: "valid-event",
                    pubkey: "owner-1",
                    created_at: 1,
                    kind: 0,
                    tags: [],
                    content: "x",
                    sig: "s",
                  }),
                  relays: JSON.stringify(["relay-1"]),
                  retry_count: 2,
                },
                {
                  event_id: "missing-data",
                  event_data: null,
                  relays: JSON.stringify(["relay-2"]),
                  retry_count: 0,
                },
              ],
              rowCount: 3,
            };
          }

          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await expect(
          mod.getFailedRelayPublishesForOwner("owner-1")
        ).resolves.toEqual([
          {
            eventId: "valid-event",
            relays: ["relay-1"],
            event: {
              id: "valid-event",
              pubkey: "owner-1",
              created_at: 1,
              kind: 0,
              tags: [],
              content: "x",
              sig: "s",
            },
            retryCount: 2,
          },
        ]);
      });

      expect(client.release).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to parse row:",
        "malformed-event",
        expect.any(Error)
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("ensureFailedRelayPublishesTable creates and migrates failed publish storage", async () => {
    const queries: string[] = [];
    const client = {
      query: jest.fn(async (q: string) => {
        queries.push(q);
        return { rows: [], rowCount: 1 };
      }),
      release: jest.fn(),
    };

    await ensureFailedRelayPublishesTable(client);

    expect(
      queries.some((query) => query.includes("CREATE TABLE IF NOT EXISTS"))
    ).toBe(true);
    expect(
      queries.some((query) =>
        query.includes("ADD COLUMN IF NOT EXISTS event_data")
      )
    ).toBe(true);
    expect(
      queries.some((query) =>
        query.includes("ADD COLUMN IF NOT EXISTS owner_pubkey")
      )
    ).toBe(true);
    expect(
      queries.some((query) =>
        query.includes("DELETE FROM failed_relay_publishes")
      )
    ).toBe(true);
  });

  test("clear and increment failed relay publishes scope updates by owner and release clients", async () => {
    const queries: Array<{ text: string; params?: unknown[] }> = [];
    const client: MockDbClient = {
      query: jest.fn(async (q: QueryInput, params?: unknown[]) => {
        const text = typeof q === "string" ? q : q.text || "";
        queries.push({ text, params });
        return { rows: [], rowCount: 1 };
      }),
      release: jest.fn(),
    };

    await withMockedDbService(client, async (mod) => {
      await mod.clearFailedRelayPublishForOwner("event-1", "owner-1");
      await mod.incrementFailedRelayPublishRetryForOwner("event-2", "owner-2");
    });

    expect(
      queries.some(
        (query) =>
          query.text.includes("DELETE FROM failed_relay_publishes") &&
          query.text.includes("WHERE event_id = $1 AND owner_pubkey = $2") &&
          query.params?.[0] === "event-1" &&
          query.params?.[1] === "owner-1"
      )
    ).toBe(true);
    expect(
      queries.some(
        (query) =>
          query.text.includes("UPDATE failed_relay_publishes") &&
          query.text.includes("SET retry_count = retry_count + 1") &&
          query.params?.[0] === "event-2" &&
          query.params?.[1] === "owner-2"
      )
    ).toBe(true);
    expect(client.release.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  maybeItTc(
    "initializeTables creates tables and applies message/relay migrations",
    async () => {
      await withLegacyPostgresDbService(async (db) => {
        await waitForTables(db, ["product_events", "discount_codes"]);
        await waitForColumns(db, "message_events", [
          "is_read",
          "order_status",
          "order_id",
        ]);
        await waitForColumns(db, "failed_relay_publishes", ["owner_pubkey"]);

        const pool = db.getDbPool();
        const client = await pool.connect();

        try {
          const messageColumns = await client.query<{ column_name: string }>(
            `SELECT column_name
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'message_events'
               AND column_name IN ('is_read', 'order_id', 'order_status')
             ORDER BY column_name`
          );

          expect(messageColumns.rows.map((row) => row.column_name)).toEqual([
            "is_read",
            "order_id",
            "order_status",
          ]);

          const legacyRows = await client.query<{ count: string }>(
            `SELECT COUNT(*) AS count
             FROM failed_relay_publishes
             WHERE owner_pubkey IS NULL`
          );

          expect(Number(legacyRows.rows[0]?.count ?? 0)).toBe(0);

          const productColumns = await client.query<{ table_name: string }>(
            `SELECT table_name
             FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_name = 'product_events'`
          );

          expect(productColumns.rows).toHaveLength(1);
        } finally {
          client.release();
        }
      });
    }
  );

  test("shouldKeepOnlyLatest returns true for configured kinds", () => {
    const trueKinds = [17375, 37375, 10002, 10063, 0, 30019, 34550];
    for (const k of trueKinds) {
      expect(shouldKeepOnlyLatest(k)).toBe(true);
    }

    expect(shouldKeepOnlyLatest(30402)).toBe(false);
    expect(shouldKeepOnlyLatest(31555)).toBe(false);
  });

  test("isReviewEvent identifies review kind", () => {
    expect(isReviewEvent(31555)).toBe(true);
    expect(isReviewEvent(30402)).toBe(false);
  });

  test("buildReviewDTagFilter returns JSON array filter for d tag", () => {
    const json = buildReviewDTagFilter("my-d-tag");
    expect(json).toBe(JSON.stringify([["d", "my-d-tag"]]));
  });

  test("profileNameToSlug sanitizes and slugifies names", () => {
    expect(profileNameToSlug("")).toBe("");
    expect(profileNameToSlug("   Hello   World  ")).toBe("Hello-World");
    expect(profileNameToSlug("Shop #1 / Best!!")).toBe("Shop-1-Best");
    expect(profileNameToSlug("--Leading and trailing--")).toBe(
      "Leading-and-trailing"
    );
    expect(profileNameToSlug("Multiple   spaces")).toBe("Multiple-spaces");
    // Removes many special characters
    expect(profileNameToSlug("Name@with*weird^chars%and+symbols")).toBe(
      "Namewithweirdcharsandsymbols"
    );
  });

  test("profileNameToSlug returns empty for only-special-chars names", () => {
    expect(profileNameToSlug("!!!@@@###")).toBe("");
  });

  test("cacheEvents short-circuits on empty input (no DB calls)", async () => {
    await jest.isolateModulesAsync(async () => {
      const prev = process.env.DATABASE_URL;
      process.env.DATABASE_URL = "postgres://test@localhost/testdb";
      try {
        let connectCalled = false;
        const pool: MockDbPool = {
          connect: jest.fn(async () => {
            connectCalled = true;
            return { query: jest.fn(), release: jest.fn() };
          }),
          on: jest.fn(),
        };

        jest.doMock("pg", () => ({
          Pool: class {
            constructor() {
              return pool;
            }
          },
        }));

        const mod = await import("../db-service");
        await mod.cacheEvents([]);
        expect(connectCalled).toBe(false);
      } finally {
        process.env.DATABASE_URL = prev;
      }
    });
  });

  test("cacheEvent returns early for unknown kind (no DB calls)", async () => {
    await jest.isolateModulesAsync(async () => {
      const prev = process.env.DATABASE_URL;
      process.env.DATABASE_URL = "postgres://test@localhost/testdb";
      try {
        let connectCalled = false;
        const pool: MockDbPool = {
          connect: jest.fn(async () => {
            connectCalled = true;
            return { query: jest.fn(), release: jest.fn() };
          }),
          on: jest.fn(),
        };

        jest.doMock("pg", () => ({
          Pool: class {
            constructor() {
              return pool;
            }
          },
        }));

        const mod = await import("../db-service");
        await mod.cacheEvent({
          id: "e1",
          pubkey: "p1",
          created_at: Date.now(),
          kind: 999999,
          tags: [],
          content: "x",
          sig: "s",
        } as NostrEvent);
        expect(connectCalled).toBe(false);
      } finally {
        process.env.DATABASE_URL = prev;
      }
    });
  });

  test("cacheEvent upserts regular events with ON CONFLICT", async () => {
    await jest.isolateModulesAsync(async () => {
      const prev = process.env.DATABASE_URL;
      process.env.DATABASE_URL = "postgres://test@localhost/testdb";

      let mod: typeof import("../db-service") | undefined;

      try {
        const queries: Array<string | { text?: string }> = [];
        const client: MockDbClient = {
          query: jest.fn(async (q: QueryInput) => {
            queries.push(q);
            return { rows: [], rowCount: 1 };
          }),
          release: jest.fn(),
        };

        const pool: MockDbPool = {
          connect: jest.fn(async () => client),
          on: jest.fn(),
          end: jest.fn(async () => undefined),
        };

        jest.doMock("pg", () => ({
          Pool: class {
            constructor() {
              return pool;
            }
          },
        }));

        mod = await import("../db-service");

        const event = {
          id: "regular-1",
          pubkey: "seller-1",
          created_at: 123,
          kind: 30402,
          tags: [["d", "listing-1"]],
          content: "regular content",
          sig: "regular-sig",
        } as NostrEvent;

        await mod.cacheEvent(event);

        expect(pool.connect).toHaveBeenCalled();
        expect(
          queries.some(
            (query) =>
              typeof query === "object" &&
              typeof query.text === "string" &&
              query.text.includes("ON CONFLICT (id) DO UPDATE SET")
          )
        ).toBe(true);
        expect(client.query).toHaveBeenCalledWith(
          expect.objectContaining({
            text: expect.stringContaining("INSERT INTO product_events"),
          })
        );
      } finally {
        if (mod) {
          await mod.closeDbPool();
        }
        process.env.DATABASE_URL = prev;
      }
    });
  });

  test("cacheEvent logs rollback failures when single-event caching fails", async () => {
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      const insertError = new Error("single insert failed");
      const rollbackError = new Error("single rollback failed");
      const client: MockDbClient = {
        query: jest.fn(async (q: QueryInput) => {
          const text = typeof q === "string" ? q : q.text || "";

          if (text === "ROLLBACK") {
            throw rollbackError;
          }

          if (text.includes("INSERT INTO product_events")) {
            throw insertError;
          }

          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await expect(
          mod.cacheEvent(
            productEvent({
              id: "single-cache-fail",
              pubkey: "seller-1",
              created_at: 10,
            })
          )
        ).resolves.toBeUndefined();
      });

      expect(client.release).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to rollback transaction:",
        rollbackError
      );
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to cache event %s:",
        "single-cache-fail",
        insertError
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("cacheEvents retries once after a synthetic deadlock and then succeeds", async () => {
    await jest.isolateModulesAsync(async () => {
      const prev = process.env.DATABASE_URL;
      process.env.DATABASE_URL = "postgres://test@localhost/testdb";

      let mod: typeof import("../db-service") | undefined;
      let insertAttempts = 0;

      try {
        const client: MockDbClient = {
          query: jest.fn(async (q: QueryInput) => {
            const text = typeof q === "string" ? q : q.text || q;

            if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
              return { rows: [], rowCount: 1 };
            }

            if (
              typeof text === "string" &&
              text.includes("INSERT INTO product_events")
            ) {
              insertAttempts += 1;
              if (insertAttempts === 1) {
                const error = new Error("synthetic deadlock") as Error & {
                  code: string;
                };
                error.code = "40P01";
                throw error;
              }
            }

            return { rows: [], rowCount: 1 };
          }),
          release: jest.fn(),
        };

        const pool: MockDbPool = {
          connect: jest.fn(async () => client),
          on: jest.fn(),
          end: jest.fn(async () => undefined),
        };

        jest.doMock("pg", () => ({
          Pool: class {
            constructor() {
              return pool;
            }
          },
        }));

        mod = await import("../db-service");

        await mod.cacheEvents([
          productEvent({
            id: "retry-product-1",
            pubkey: "retry-seller",
            created_at: 10,
          }),
        ]);

        expect(pool.connect).toHaveBeenCalledTimes(3);
        expect(insertAttempts).toBe(2);
      } finally {
        if (mod) {
          await mod.closeDbPool();
        }
        process.env.DATABASE_URL = prev;
      }
    });
  });

  test("cacheEvents rejects non-retryable query errors and releases client", async () => {
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      const insertError = new Error("insert failed");
      const client: MockDbClient = {
        query: jest.fn(async (q: QueryInput) => {
          const text = typeof q === "string" ? q : q.text || "";

          if (text.includes("INSERT INTO product_events")) {
            throw insertError;
          }

          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await expect(
          mod.cacheEvents([
            productEvent({
              id: "non-retry-product-1",
              pubkey: "seller-1",
              created_at: 10,
            }),
          ])
        ).rejects.toThrow(insertError);
      });

      expect(client.release).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to cache events batch:",
        insertError
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("cacheEvents logs rollback failures when transaction rollback fails", async () => {
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      const insertError = new Error("insert failed before rollback");
      const rollbackError = new Error("rollback failed");
      const client: MockDbClient = {
        query: jest.fn(async (q: QueryInput) => {
          const text = typeof q === "string" ? q : q.text || "";

          if (text === "ROLLBACK") {
            throw rollbackError;
          }

          if (text.includes("INSERT INTO product_events")) {
            throw insertError;
          }

          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await expect(
          mod.cacheEvents([
            productEvent({
              id: "rollback-product-1",
              pubkey: "seller-1",
              created_at: 10,
            }),
          ])
        ).rejects.toThrow(insertError);
      });

      expect(client.release).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to rollback transaction:",
        rollbackError
      );
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to cache events batch:",
        insertError
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("cacheEvents groups events and runs transaction (calls BEGIN)", async () => {
    // Use isolated module loading so we can mock 'pg.Pool' before the module is imported
    const queries: string[] = [];
    const client: MockDbClient & { on: jest.Mock } = {
      query: jest.fn(async (q: QueryInput) => {
        const text = typeof q === "string" ? q : q.text || "";
        queries.push(text.trim().split("\n")[0] ?? "");
        return { rows: [], rowCount: 1 };
      }),
      release: jest.fn(),
      on: jest.fn(),
    };

    const pool: MockDbPool = {
      connect: jest.fn(async () => client),
      on: jest.fn(),
    };

    await jest.isolateModulesAsync(async () => {
      const prev = process.env.DATABASE_URL;
      process.env.DATABASE_URL = "postgres://test@localhost/testdb";
      try {
        jest.doMock("pg", () => ({
          Pool: class {
            constructor() {
              return pool;
            }
          },
        }));
        const mod = await import("../db-service");

        const events = [
          {
            id: "a1",
            pubkey: "u1",
            created_at: 1,
            kind: 17375,
            tags: [],
            content: "",
            sig: "",
          },
          {
            id: "r1",
            pubkey: "u1",
            created_at: 2,
            kind: 31555,
            tags: [["d", "prod1"]],
            content: "",
            sig: "",
          },
          {
            id: "p1",
            pubkey: "u2",
            created_at: 3,
            kind: 30402,
            tags: [],
            content: "",
            sig: "",
          },
        ];

        await mod.cacheEvents(events as NostrEvent[]);

        // Expect that a transaction was started
        expect(queries.some((q) => /BEGIN/i.test(q))).toBe(true);
        expect(queries.some((q) => /COMMIT/i.test(q))).toBe(true);
      } finally {
        process.env.DATABASE_URL = prev;
      }
    });
  });

  describe("getDbPool / closeDbPool (unit)", () => {
    test("getDbPool throws when DATABASE_URL is not configured", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        delete process.env.DATABASE_URL;

        try {
          const mod = await import("../db-service");
          expect(() => mod.getDbPool()).toThrow(
            "DATABASE_URL environment variable is not set"
          );
        } finally {
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("getDbPool registers and logs idle pool errors", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@db.us-east-2/testdb";
        const errorSpy = jest
          .spyOn(console, "error")
          .mockImplementation(() => undefined);
        let idleErrorHandler: ((error: Error) => void) | undefined;

        try {
          const client: MockDbClient = {
            query: jest.fn(async () => ({ rows: [], rowCount: 1 })),
            release: jest.fn(),
          };
          const pool: MockDbPool = {
            connect: jest.fn(async () => client),
            on: jest.fn((event: string, handler: (error: Error) => void) => {
              if (event === "error") {
                idleErrorHandler = handler;
              }
            }),
            end: jest.fn(async () => undefined),
          };

          jest.doMock("pg", () => ({
            Pool: class {
              constructor(options: FakePoolOptions) {
                expect(options.connectionString).toBe(
                  "postgres://test@db-pooler.us-east-2/testdb"
                );
                return pool;
              }
            },
          }));

          const mod = await import("../db-service");
          mod.getDbPool();

          const idleError = new Error("idle client failed");
          idleErrorHandler?.(idleError);

          expect(pool.on).toHaveBeenCalledWith("error", expect.any(Function));
          expect(errorSpy).toHaveBeenCalledWith(
            "Unexpected error on idle database client",
            idleError
          );

          await mod.closeDbPool();
        } finally {
          errorSpy.mockRestore();
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("getDbPool constructs pg.Pool and closeDbPool ends it", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@localhost/testdb";
        try {
          let constructed = false;
          const client = {
            query: jest.fn(async () => ({ rows: [], rowCount: 1 })),
            release: jest.fn(),
          };
          class FakePool {
            opts: FakePoolOptions;
            ended = false;
            constructor(opts: FakePoolOptions) {
              constructed = true;
              this.opts = opts;
            }
            async connect() {
              return client;
            }
            on() {
              return;
            }
            async end() {
              this.ended = true;
            }
          }

          jest.doMock("pg", () => ({ Pool: FakePool }));

          const mod = await import("../db-service");
          const pool = mod.getDbPool();
          expect(constructed).toBe(true);
          expect(pool).toBeInstanceOf(FakePool);

          // close should call end() and allow recreation on next getDbPool
          await mod.closeDbPool();

          const pool2 = mod.getDbPool();
          expect(pool2).toBeInstanceOf(FakePool);
        } finally {
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("fetchProductByListingSlug maps JSONB tags to slug candidates and delegates matching", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@localhost/testdb";
        try {
          const rows = [
            {
              id: "product-1",
              pubkey: "seller1234abcd",
              created_at: 123,
              kind: 30402,
              tags: [
                ["title", "Listing A"],
                ["d", "listing-a"],
              ],
              content: "matched content",
              sig: "sig-1",
            },
          ];
          const matchingCandidate = {
            row: rows[0],
            id: "product-1",
            pubkey: "seller1234abcd",
            title: "Listing A",
          };

          const client: MockDbClient = {
            query: jest.fn(async () => ({ rows, rowCount: 1 })),
            release: jest.fn(),
          };

          const pool: MockDbPool = {
            connect: jest.fn(async () => client),
            on: jest.fn(),
            end: jest.fn(async () => undefined),
          };

          const findListingBySlug = jest.fn(() => matchingCandidate);

          jest.doMock("../../url-slugs", () => ({
            findListingBySlug,
          }));

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool;
              }
            },
          }));

          const mod = await import("../db-service");
          const event =
            await mod.fetchProductByListingSlug("Listing-A-seller12");

          expect(findListingBySlug).toHaveBeenCalledWith("Listing-A-seller12", [
            matchingCandidate,
          ]);
          expect(event).toEqual({
            id: "product-1",
            pubkey: "seller1234abcd",
            created_at: 123,
            kind: 30402,
            tags: [
              ["title", "Listing A"],
              ["d", "listing-a"],
            ],
            content: "matched content",
            sig: "sig-1",
          });
        } finally {
          jest.unmock("../../url-slugs");
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("fetchProductByListingSlug ignores rows without title tags and returns null when nothing matches", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@localhost/testdb";
        try {
          const rows = [
            {
              id: "product-no-title-1",
              pubkey: "seller-1",
              created_at: 123,
              kind: 30402,
              tags: [["price", "10"]],
              content: "untitled-1",
              sig: "sig-1",
            },
            {
              id: "product-no-title-2",
              pubkey: "seller-2",
              created_at: 124,
              kind: 30402,
              tags: [["d", "listing-a"]],
              content: "untitled-2",
              sig: "sig-2",
            },
          ];
          const client: MockDbClient = {
            query: jest.fn(async () => ({ rows, rowCount: 2 })),
            release: jest.fn(),
          };

          const pool: MockDbPool = {
            connect: jest.fn(async () => client),
            on: jest.fn(),
            end: jest.fn(async () => undefined),
          };

          const findListingBySlug = jest.fn(() => null);

          jest.doMock("../../url-slugs", () => ({
            findListingBySlug,
          }));

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool;
              }
            },
          }));

          const mod = await import("../db-service");
          await expect(
            mod.fetchProductByListingSlug("Listing-A")
          ).resolves.toBeNull();
          expect(findListingBySlug).toHaveBeenCalledWith("Listing-A", []);
          expect(client.release).toHaveBeenCalled();
        } finally {
          jest.unmock("../../url-slugs");
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("fetchMarketplaceStats returns zeros when query fails", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@localhost/testdb";
        const errorSpy = jest
          .spyOn(console, "error")
          .mockImplementation(() => undefined);
        try {
          const client: MockDbClient = {
            query: jest.fn(async () => {
              throw new Error("stats query failed");
            }),
            release: jest.fn(),
          };

          const pool: MockDbPool = {
            connect: jest.fn(async () => client),
            on: jest.fn(),
            end: jest.fn(async () => undefined),
          };

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool;
              }
            },
          }));

          const mod = await import("../db-service");
          await expect(mod.fetchMarketplaceStats()).resolves.toEqual({
            listingCount: 0,
            sellerCount: 0,
          });
          expect(client.release).toHaveBeenCalled();
          expect(errorSpy).toHaveBeenCalledWith(
            "fetchMarketplaceStats error:",
            expect.any(Error)
          );
        } finally {
          errorSpy.mockRestore();
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("fetchMarketplaceStats falls back to zero when aggregate row values are missing", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@localhost/testdb";
        try {
          const client: MockDbClient = {
            query: jest.fn(async () => ({ rows: [{}] })),
            release: jest.fn(),
          };

          const pool: MockDbPool = {
            connect: jest.fn(async () => client),
            on: jest.fn(),
            end: jest.fn(async () => undefined),
          };

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool;
              }
            },
          }));

          const mod = await import("../db-service");
          await expect(mod.fetchMarketplaceStats()).resolves.toEqual({
            listingCount: 0,
            sellerCount: 0,
          });
          expect(client.release).toHaveBeenCalled();
        } finally {
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("fetchProductByIdFromDb returns null on query error and releases client", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@localhost/testdb";
        const errorSpy = jest
          .spyOn(console, "error")
          .mockImplementation(() => undefined);
        try {
          const client: MockDbClient = {
            query: jest.fn(async () => {
              throw new Error("product by id failed");
            }),
            release: jest.fn(),
          };

          const pool: MockDbPool = {
            connect: jest.fn(async () => client),
            on: jest.fn(),
            end: jest.fn(async () => undefined),
          };

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool;
              }
            },
          }));

          const mod = await import("../db-service");
          await expect(
            mod.fetchProductByIdFromDb("product-x")
          ).resolves.toBeNull();
          expect(client.release).toHaveBeenCalled();
          expect(errorSpy).toHaveBeenCalledWith(
            "Failed to fetch product by id:",
            expect.any(Error)
          );
        } finally {
          errorSpy.mockRestore();
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("fetchProductByDTagAndPubkey returns null on query error and releases client", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@localhost/testdb";
        const errorSpy = jest
          .spyOn(console, "error")
          .mockImplementation(() => undefined);
        try {
          const client: MockDbClient = {
            query: jest.fn(async () => {
              throw new Error("product by d-tag failed");
            }),
            release: jest.fn(),
          };

          const pool: MockDbPool = {
            connect: jest.fn(async () => client),
            on: jest.fn(),
            end: jest.fn(async () => undefined),
          };

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool;
              }
            },
          }));

          const mod = await import("../db-service");
          await expect(
            mod.fetchProductByDTagAndPubkey("listing-x", "seller-x")
          ).resolves.toBeNull();
          expect(client.release).toHaveBeenCalled();
          expect(errorSpy).toHaveBeenCalledWith(
            "Failed to fetch product by d-tag and pubkey:",
            expect.any(Error)
          );
        } finally {
          errorSpy.mockRestore();
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("validateDiscountCode returns invalid on query error and releases client", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@localhost/testdb";
        const errorSpy = jest
          .spyOn(console, "error")
          .mockImplementation(() => undefined);
        try {
          const client: MockDbClient = {
            query: jest.fn(async () => {
              throw new Error("validate discount failed");
            }),
            release: jest.fn(),
          };

          const pool: MockDbPool = {
            connect: jest.fn(async () => client),
            on: jest.fn(),
            end: jest.fn(async () => undefined),
          };

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool;
              }
            },
          }));

          const mod = await import("../db-service");
          await expect(
            mod.validateDiscountCode("SAVE10", "merchant-1")
          ).resolves.toEqual({ valid: false });
          expect(client.release).toHaveBeenCalled();
          expect(errorSpy).toHaveBeenCalledWith(
            "Failed to validate discount code:",
            expect.any(Error)
          );
        } finally {
          errorSpy.mockRestore();
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("deleteDiscountCode logs, rethrows query errors, and releases client", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@localhost/testdb";
        const errorSpy = jest
          .spyOn(console, "error")
          .mockImplementation(() => undefined);
        try {
          const deleteError = new Error("delete discount failed");
          const client: MockDbClient = {
            query: jest.fn(async (queryText: string) => {
              if (queryText.includes("DELETE FROM discount_codes")) {
                throw deleteError;
              }

              return { rows: [], rowCount: 1 };
            }),
            release: jest.fn(),
          };

          const pool: MockDbPool = {
            connect: jest.fn(async () => client),
            on: jest.fn(),
            end: jest.fn(async () => undefined),
          };

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool;
              }
            },
          }));

          const mod = await import("../db-service");
          await expect(
            mod.deleteDiscountCode("SAVE10", "merchant-1")
          ).rejects.toThrow(deleteError);
          expect(client.release).toHaveBeenCalled();
          expect(errorSpy).toHaveBeenCalledWith(
            "Failed to delete discount code:",
            deleteError
          );
        } finally {
          errorSpy.mockRestore();
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("fetchProductByListingSlug returns null on query error and releases client", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@localhost/testdb";
        const errorSpy = jest
          .spyOn(console, "error")
          .mockImplementation(() => undefined);
        try {
          const client: MockDbClient = {
            query: jest.fn(async () => {
              throw new Error("listing slug failed");
            }),
            release: jest.fn(),
          };

          const pool: MockDbPool = {
            connect: jest.fn(async () => client),
            on: jest.fn(),
            end: jest.fn(async () => undefined),
          };

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool;
              }
            },
          }));

          const mod = await import("../db-service");
          await expect(
            mod.fetchProductByListingSlug("listing-a")
          ).resolves.toBeNull();
          expect(client.release).toHaveBeenCalled();
          expect(errorSpy).toHaveBeenCalledWith(
            "Failed to fetch product by listing slug:",
            expect.any(Error)
          );
        } finally {
          errorSpy.mockRestore();
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("fetchShopProfileByPubkeyFromDb returns null on query error and releases client", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@localhost/testdb";
        const errorSpy = jest
          .spyOn(console, "error")
          .mockImplementation(() => undefined);
        try {
          const client: MockDbClient = {
            query: jest.fn(async () => {
              throw new Error("shop profile failed");
            }),
            release: jest.fn(),
          };

          const pool: MockDbPool = {
            connect: jest.fn(async () => client),
            on: jest.fn(),
            end: jest.fn(async () => undefined),
          };

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool;
              }
            },
          }));

          const mod = await import("../db-service");
          await expect(
            mod.fetchShopProfileByPubkeyFromDb("shop-owner")
          ).resolves.toBeNull();
          expect(client.release).toHaveBeenCalled();
          expect(errorSpy).toHaveBeenCalledWith(
            "Failed to fetch shop profile by pubkey:",
            expect.any(Error)
          );
        } finally {
          errorSpy.mockRestore();
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("fetchProfilePubkeyByNameSlug skips invalid JSON profile content", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@localhost/testdb";
        try {
          const client: MockDbClient = {
            query: jest.fn(async () => ({
              rows: [
                { pubkey: "bad-json-pubkey", content: "{" },
                {
                  pubkey: "valid-pubkey",
                  content: JSON.stringify({ name: "Valid Shop" }),
                },
              ],
              rowCount: 2,
            })),
            release: jest.fn(),
          };

          const pool: MockDbPool = {
            connect: jest.fn(async () => client),
            on: jest.fn(),
            end: jest.fn(async () => undefined),
          };

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool;
              }
            },
          }));

          const mod = await import("../db-service");
          await expect(
            mod.fetchProfilePubkeyByNameSlug("Valid-Shop")
          ).resolves.toBe("valid-pubkey");
          expect(client.release).toHaveBeenCalled();
        } finally {
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("fetchProfilePubkeyByNameSlug returns null on query error and releases client", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@localhost/testdb";
        const errorSpy = jest
          .spyOn(console, "error")
          .mockImplementation(() => undefined);
        try {
          const client: MockDbClient = {
            query: jest.fn(async () => {
              throw new Error("profile slug failed");
            }),
            release: jest.fn(),
          };

          const pool: MockDbPool = {
            connect: jest.fn(async () => client),
            on: jest.fn(),
            end: jest.fn(async () => undefined),
          };

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool;
              }
            },
          }));

          const mod = await import("../db-service");
          await expect(
            mod.fetchProfilePubkeyByNameSlug("Shop")
          ).resolves.toBeNull();
          expect(client.release).toHaveBeenCalled();
          expect(errorSpy).toHaveBeenCalledWith(
            "Failed to fetch profile pubkey by name slug:",
            expect.any(Error)
          );
        } finally {
          errorSpy.mockRestore();
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("fetchShopPubkeyBySlug returns null on query error and releases client", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@localhost/testdb";
        const errorSpy = jest
          .spyOn(console, "error")
          .mockImplementation(() => undefined);
        try {
          const client: MockDbClient = {
            query: jest.fn(async () => {
              throw new Error("shop slug failed");
            }),
            release: jest.fn(),
          };

          const pool: MockDbPool = {
            connect: jest.fn(async () => client),
            on: jest.fn(),
            end: jest.fn(async () => undefined),
          };

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool;
              }
            },
          }));

          const mod = await import("../db-service");
          await expect(mod.fetchShopPubkeyBySlug("shop")).resolves.toBeNull();
          expect(client.release).toHaveBeenCalled();
          expect(errorSpy).toHaveBeenCalledWith(
            "Failed to fetch shop pubkey by slug:",
            expect.any(Error)
          );
        } finally {
          errorSpy.mockRestore();
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("fetchCommunityByPubkeyAndIdentifier returns null on query error and releases client", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@localhost/testdb";
        const errorSpy = jest
          .spyOn(console, "error")
          .mockImplementation(() => undefined);
        try {
          const client: MockDbClient = {
            query: jest.fn(async () => {
              throw new Error("community lookup failed");
            }),
            release: jest.fn(),
          };

          const pool: MockDbPool = {
            connect: jest.fn(async () => client),
            on: jest.fn(),
            end: jest.fn(async () => undefined),
          };

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool;
              }
            },
          }));

          const mod = await import("../db-service");
          await expect(
            mod.fetchCommunityByPubkeyAndIdentifier(
              "community-owner",
              "community-id"
            )
          ).resolves.toBeNull();
          expect(client.release).toHaveBeenCalled();
          expect(errorSpy).toHaveBeenCalledWith(
            "Failed to fetch community by pubkey and identifier:",
            expect.any(Error)
          );
        } finally {
          errorSpy.mockRestore();
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("getUnreadMessageCount returns zero on query error and releases client", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const client: MockDbClient = {
          query: jest.fn(async () => {
            throw new Error("unread count failed");
          }),
          release: jest.fn(),
        };

        await withMockedDbService(client, async (mod) => {
          await expect(mod.getUnreadMessageCount("buyer-1")).resolves.toBe(0);
        });

        expect(client.release).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to get unread message count:",
          expect.any(Error)
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    test("getOrderParticipants logs, rethrows query errors, and releases client", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const orderError = new Error("order participants failed");
        const client: MockDbClient = {
          query: jest.fn(async () => {
            throw orderError;
          }),
          release: jest.fn(),
        };

        await withMockedDbService(client, async (mod) => {
          await expect(mod.getOrderParticipants("order-1")).rejects.toThrow(
            orderError
          );
        });

        expect(client.release).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to get order participants:",
          orderError
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    test("updateOrderStatus logs query errors and releases client", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const client: MockDbClient = {
          query: jest.fn(async () => {
            throw new Error("update order status failed");
          }),
          release: jest.fn(),
        };

        await withMockedDbService(client, async (mod) => {
          await expect(
            mod.updateOrderStatus("order-1", "paid", "buyer-1", "message-1")
          ).resolves.toBeUndefined();
        });

        expect(client.release).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to update order status:",
          expect.any(Error)
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    test("getOrderStatuses returns empty object on query error and releases client", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const client: MockDbClient = {
          query: jest.fn(async () => {
            throw new Error("order statuses failed");
          }),
          release: jest.fn(),
        };

        await withMockedDbService(client, async (mod) => {
          await expect(
            mod.getOrderStatuses(["order-1", "order-2"])
          ).resolves.toEqual({});
        });

        expect(client.release).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to get order statuses:",
          expect.any(Error)
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    test("fetchAllProfilesFromDb returns empty array on query error and releases client", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const client: MockDbClient = {
          query: jest.fn(async () => {
            throw new Error("fetch profiles failed");
          }),
          release: jest.fn(),
        };

        await withMockedDbService(client, async (mod) => {
          await expect(mod.fetchAllProfilesFromDb()).resolves.toEqual([]);
        });

        expect(client.release).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to fetch profiles from database:",
          expect.any(Error)
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    test("fetchAllWalletEventsFromDb returns empty array on query error and releases client", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const client: MockDbClient = {
          query: jest.fn(async () => {
            throw new Error("fetch wallet failed");
          }),
          release: jest.fn(),
        };

        await withMockedDbService(client, async (mod) => {
          await expect(
            mod.fetchAllWalletEventsFromDb("wallet-owner")
          ).resolves.toEqual([]);
        });

        expect(client.release).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to fetch wallet events from database:",
          expect.any(Error)
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    test("addDiscountCode logs, rethrows query errors, and releases client", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const discountError = new Error("add discount failed");
        const client: MockDbClient = {
          query: jest.fn(async () => {
            throw discountError;
          }),
          release: jest.fn(),
        };

        await withMockedDbService(client, async (mod) => {
          await expect(
            mod.addDiscountCode("SAVE10", "merchant-1", 10)
          ).rejects.toThrow(discountError);
        });

        expect(client.release).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to add discount code:",
          discountError
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    test("getDiscountCodesByPubkey returns empty array on query error and releases client", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const client: MockDbClient = {
          query: jest.fn(async () => {
            throw new Error("fetch discounts failed");
          }),
          release: jest.fn(),
        };

        await withMockedDbService(client, async (mod) => {
          await expect(
            mod.getDiscountCodesByPubkey("merchant-1")
          ).resolves.toEqual([]);
        });

        expect(client.release).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to fetch discount codes:",
          expect.any(Error)
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    test("getDiscountCodesByPubkey maps numeric fields and null expirations", async () => {
      const client: MockDbClient = {
        query: jest.fn(async (q: QueryInput) => {
          const text = typeof q === "string" ? q : q.text || "";
          if (text.includes("FROM discount_codes WHERE pubkey = $1")) {
            return {
              rows: [
                {
                  code: "SAVE10",
                  discount_percentage: "10.5",
                  expiration: null,
                },
                {
                  code: "SAVE20",
                  discount_percentage: "20",
                  expiration: "12345",
                },
              ],
              rowCount: 2,
            };
          }
          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await expect(
          mod.getDiscountCodesByPubkey("merchant-1")
        ).resolves.toEqual([
          {
            code: "SAVE10",
            discount_percentage: 10.5,
            expiration: null,
          },
          {
            code: "SAVE20",
            discount_percentage: 20,
            expiration: 12345,
          },
        ]);
      });

      expect(client.release).toHaveBeenCalled();
    });

    test("validateDiscountCode returns invalid for expired discount code", async () => {
      const client: MockDbClient = {
        query: jest.fn(async () => ({
          rows: [
            {
              discount_percentage: "15",
              expiration: Math.floor(Date.now() / 1000) - 60,
            },
          ],
          rowCount: 1,
        })),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await expect(
          mod.validateDiscountCode("SAVE15", "merchant-1")
        ).resolves.toEqual({ valid: false });
      });

      expect(client.release).toHaveBeenCalled();
    });

    test("validateDiscountCode returns invalid for missing codes and valid for active codes", async () => {
      const client: MockDbClient = {
        query: jest.fn(async (_q: QueryInput, params?: unknown[]) => {
          if (params?.[0] === "MISSING") {
            return { rows: [], rowCount: 0 };
          }

          return {
            rows: [
              {
                discount_percentage: "12.5",
                expiration: Math.floor(Date.now() / 1000) + 60,
              },
            ],
            rowCount: 1,
          };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await expect(
          mod.validateDiscountCode("MISSING", "merchant-1")
        ).resolves.toEqual({ valid: false });
        await expect(
          mod.validateDiscountCode("SAVE12", "merchant-1")
        ).resolves.toEqual({
          valid: true,
          discount_percentage: 12.5,
        });
      });

      expect(client.release).toHaveBeenCalled();
    });

    test("fetchCachedEvents returns empty array on query error and releases client", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const client: MockDbClient = {
          query: jest.fn(async (q: QueryInput) => {
            const text = typeof q === "string" ? q : q.text || "";
            if (text.includes("FROM product_events WHERE kind = $1")) {
              throw new Error("fetch cached failed");
            }
            return { rows: [], rowCount: 1 };
          }),
          release: jest.fn(),
        };

        await withMockedDbService(client, async (mod) => {
          await expect(mod.fetchCachedEvents(30402)).resolves.toEqual([]);
        });

        expect(client.release).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to fetch cached events:",
          expect.any(Error)
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    test("deleteCachedEvent logs query errors and releases client", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const deleteError = new Error("delete cached failed");
        const client: MockDbClient = {
          query: jest.fn(async (q: QueryInput) => {
            const text = typeof q === "string" ? q : q.text || "";
            if (text.includes("DELETE FROM product_events")) {
              throw deleteError;
            }
            return { rows: [], rowCount: 1 };
          }),
          release: jest.fn(),
        };

        await withMockedDbService(client, async (mod) => {
          await expect(
            mod.deleteCachedEvent("cached-event-1", 30402)
          ).resolves.toBeUndefined();
        });

        expect(client.release).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to delete cached event cached-event-1:",
          deleteError
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    test("deleteCachedEventsByIds logs rollback failures and releases client", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const deleteError = new Error("delete cached batch failed");
        const rollbackError = new Error("rollback cached batch failed");
        const client: MockDbClient = {
          query: jest.fn(async (q: QueryInput) => {
            const text = typeof q === "string" ? q : q.text || "";

            if (text === "ROLLBACK") {
              throw rollbackError;
            }

            if (text.includes("WITH refs AS")) {
              throw deleteError;
            }

            return { rows: [], rowCount: 1 };
          }),
          release: jest.fn(),
        };

        await withMockedDbService(client, async (mod) => {
          await expect(
            mod.deleteCachedEventsByIds(["cached-event-1"])
          ).resolves.toBeUndefined();
        });

        expect(client.release).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to rollback transaction:",
          rollbackError
        );
        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to delete cached events:",
          deleteError
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    test("cachedEventsBelongToPubkey logs, rethrows query errors, and releases client", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const ownershipError = new Error("ownership lookup failed");
        const client: MockDbClient = {
          query: jest.fn(async (q: QueryInput) => {
            const text = typeof q === "string" ? q : q.text || "";
            if (text.includes("UNION ALL")) {
              throw ownershipError;
            }
            return { rows: [], rowCount: 1 };
          }),
          release: jest.fn(),
        };

        await withMockedDbService(client, async (mod) => {
          await expect(
            mod.cachedEventsBelongToPubkey(["event-1"], "owner-1")
          ).rejects.toThrow(ownershipError);
        });

        expect(client.release).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to verify cached event ownership:",
          ownershipError
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    test("fetchAllProductsFromDb returns empty array on query error and releases client", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const client: MockDbClient = {
          query: jest.fn(async (q: QueryInput) => {
            const text = typeof q === "string" ? q : q.text || "";
            if (text.includes("FROM product_events p")) {
              throw new Error("fetch products failed");
            }
            return { rows: [], rowCount: 1 };
          }),
          release: jest.fn(),
        };

        await withMockedDbService(client, async (mod) => {
          await expect(mod.fetchAllProductsFromDb()).resolves.toEqual([]);
        });

        expect(client.release).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to fetch products from database:",
          expect.any(Error)
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    test("fetchAllMessagesFromDb returns empty array on query error and releases client", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const client: MockDbClient = {
          query: jest.fn(async (q: QueryInput) => {
            const text = typeof q === "string" ? q : q.text || "";
            if (text.includes("FROM message_events WHERE 1=1")) {
              throw new Error("fetch messages failed");
            }
            return { rows: [], rowCount: 1 };
          }),
          release: jest.fn(),
        };

        await withMockedDbService(client, async (mod) => {
          await expect(mod.fetchAllMessagesFromDb("user-1")).resolves.toEqual(
            []
          );
        });

        expect(client.release).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to fetch messages from database:",
          expect.any(Error)
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    test("markMessagesAsRead logs query errors and releases client", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const client: MockDbClient = {
          query: jest.fn(async (q: QueryInput) => {
            const text = typeof q === "string" ? q : q.text || "";
            if (text.includes("UPDATE message_events")) {
              throw new Error("mark read failed");
            }
            return { rows: [], rowCount: 1 };
          }),
          release: jest.fn(),
        };

        await withMockedDbService(client, async (mod) => {
          await expect(
            mod.markMessagesAsRead(["message-1"], "user-1")
          ).resolves.toBeUndefined();
        });

        expect(client.release).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to mark messages as read:",
          expect.any(Error)
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    test("fetchRelevantReportsFromDb returns empty array without connecting when no IDs are provided", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@localhost/testdb";
        try {
          const client: MockDbClient = {
            query: jest.fn(async () => ({ rows: [], rowCount: 1 })),
            release: jest.fn(),
          };

          const pool: MockDbPool = {
            connect: jest.fn(async () => client),
            on: jest.fn(),
            end: jest.fn(async () => undefined),
          };

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool;
              }
            },
          }));

          const mod = await import("../db-service");
          await expect(mod.fetchRelevantReportsFromDb([], [])).resolves.toEqual(
            []
          );
          expect(pool.connect).not.toHaveBeenCalled();
        } finally {
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("fetchRelevantReportsFromDb builds profile-only report filters with bounded limit", async () => {
      let reportQuery = "";
      let reportParams: unknown[] = [];
      const client: MockDbClient = {
        query: jest.fn(async (q: QueryInput, params?: unknown[]) => {
          const text = typeof q === "string" ? q : q.text || "";
          if (text.includes("FROM report_events")) {
            reportQuery = text;
            reportParams = params || [];
            return {
              rows: [
                {
                  id: "report-1",
                  pubkey: "reporter-1",
                  created_at: 10,
                  kind: 1984,
                  tags: [["p", "profile-1"]],
                  content: "profile report",
                  sig: "sig-report-1",
                },
              ],
              rowCount: 1,
            };
          }
          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await expect(
          mod.fetchRelevantReportsFromDb([], ["profile-1"], 999)
        ).resolves.toHaveLength(1);
      });

      expect(reportQuery).toContain("elem->>0 = 'p'");
      expect(reportQuery).not.toContain("elem->>0 = 'e'");
      expect(reportParams).toEqual([["profile-1"], 500]);
      expect(client.release).toHaveBeenCalled();
    });

    test("fetchRelevantReportsFromDb builds product-only report filters with minimum bounded limit", async () => {
      let reportQuery = "";
      let reportParams: unknown[] = [];
      const client: MockDbClient = {
        query: jest.fn(async (q: QueryInput, params?: unknown[]) => {
          const text = typeof q === "string" ? q : q.text || "";
          if (text.includes("FROM report_events")) {
            reportQuery = text;
            reportParams = params || [];
          }
          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await expect(
          mod.fetchRelevantReportsFromDb(["product-1"], [], 0)
        ).resolves.toEqual([]);
      });

      expect(reportQuery).toContain("elem->>0 = 'e'");
      expect(reportQuery).not.toContain("elem->>0 = 'p'");
      expect(reportParams).toEqual([["product-1"], 1]);
      expect(client.release).toHaveBeenCalled();
    });

    test("fetchRelevantReportsFromDb combines profile and product filters with OR", async () => {
      let reportQuery = "";
      let reportParams: unknown[] = [];
      const client: MockDbClient = {
        query: jest.fn(async (q: QueryInput, params?: unknown[]) => {
          const text = typeof q === "string" ? q : q.text || "";
          if (text.includes("FROM report_events")) {
            reportQuery = text;
            reportParams = params || [];
          }
          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await expect(
          mod.fetchRelevantReportsFromDb(["product-1"], ["profile-1"], 50)
        ).resolves.toEqual([]);
      });

      expect(reportQuery).toContain("elem->>0 = 'p'");
      expect(reportQuery).toContain("elem->>0 = 'e'");
      expect(reportQuery).toMatch(/\)\s+OR\s+EXISTS/);
      expect(reportParams).toEqual([["profile-1"], ["product-1"], 50]);
      expect(client.release).toHaveBeenCalled();
    });

    test("fetchRelevantReportsFromDb returns empty array on query error and releases client", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const client: MockDbClient = {
          query: jest.fn(async (q: QueryInput) => {
            const text = typeof q === "string" ? q : q.text || "";
            if (text.includes("FROM report_events")) {
              throw new Error("fetch reports failed");
            }
            return { rows: [], rowCount: 1 };
          }),
          release: jest.fn(),
        };

        await withMockedDbService(client, async (mod) => {
          await expect(
            mod.fetchRelevantReportsFromDb(["product-1"], ["profile-1"])
          ).resolves.toEqual([]);
        });

        expect(client.release).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to fetch relevant reports from database:",
          expect.any(Error)
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    test("cacheEvent replaces latest-only events inside a transaction", async () => {
      const queries: string[] = [];
      const client: MockDbClient = {
        query: jest.fn(async (q: QueryInput) => {
          const text = typeof q === "string" ? q : q.text || "";
          queries.push(text);
          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await mod.cacheEvent(
          latestOnlyEvent({
            id: "wallet-latest-1",
            pubkey: "wallet-owner",
            kind: 17375,
          })
        );
      });

      expect(queries).toContain("BEGIN");
      expect(
        queries.some((query) => query.includes("DELETE FROM wallet_events"))
      ).toBe(true);
      expect(
        queries.some((query) => query.includes("INSERT INTO wallet_events"))
      ).toBe(true);
      expect(queries).toContain("COMMIT");
      expect(client.release).toHaveBeenCalled();
    });

    test("cacheEvent replaces reviews for the same d tag inside a transaction", async () => {
      const queries: Array<{ text: string; values?: unknown[] }> = [];
      const client: MockDbClient = {
        query: jest.fn(async (q: QueryInput) => {
          if (typeof q === "string") {
            queries.push({ text: q });
          } else {
            queries.push({
              text: q.text || "",
              values: q.values,
            });
          }
          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await mod.cacheEvent(
          reviewEvent({
            id: "review-latest-1",
            pubkey: "reviewer-1",
            tags: [["d", "product-d-tag"]],
          })
        );
      });

      expect(queries.some((query) => query.text === "BEGIN")).toBe(true);
      expect(
        queries.some(
          (query) =>
            query.text.includes("DELETE FROM review_events") &&
            query.values?.[2] === JSON.stringify([["d", "product-d-tag"]])
        )
      ).toBe(true);
      expect(
        queries.some((query) =>
          query.text.includes("INSERT INTO review_events")
        )
      ).toBe(true);
      expect(queries.some((query) => query.text === "COMMIT")).toBe(true);
      expect(client.release).toHaveBeenCalled();
    });

    test("fetchCachedEvents applies all filters and maps event rows", async () => {
      let cachedQuery = "";
      let cachedParams: unknown[] = [];
      const client: MockDbClient = {
        query: jest.fn(async (q: QueryInput, params?: unknown[]) => {
          const text = typeof q === "string" ? q : q.text || "";
          if (text.includes("FROM product_events WHERE kind = $1")) {
            cachedQuery = text;
            cachedParams = params || [];
            return {
              rows: [
                {
                  id: "cached-1",
                  pubkey: "seller-1",
                  created_at: 20,
                  kind: 30402,
                  tags: [["d", "listing-1"]],
                  content: "cached content",
                  sig: "sig-cached-1",
                },
              ],
              rowCount: 1,
            };
          }
          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await expect(
          mod.fetchCachedEvents(30402, {
            pubkey: "seller-1",
            since: 10,
            until: 30,
            limit: 5,
            offset: 2,
          })
        ).resolves.toEqual([
          {
            id: "cached-1",
            pubkey: "seller-1",
            created_at: 20,
            kind: 30402,
            tags: [["d", "listing-1"]],
            content: "cached content",
            sig: "sig-cached-1",
          },
        ]);
      });

      expect(cachedQuery).toContain("pubkey = $2");
      expect(cachedQuery).toContain("created_at >= $3");
      expect(cachedQuery).toContain("created_at <= $4");
      expect(cachedQuery).toContain("LIMIT $5");
      expect(cachedQuery).toContain("OFFSET $6");
      expect(cachedParams).toEqual([30402, "seller-1", 10, 30, 5, 2]);
      expect(client.release).toHaveBeenCalled();
    });

    test("deleteCachedEventsByIds deletes product refs, other tables, and commits", async () => {
      const queries: string[] = [];
      const client: MockDbClient = {
        query: jest.fn(async (q: QueryInput) => {
          const text = typeof q === "string" ? q : q.text || "";
          queries.push(text);
          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await mod.deleteCachedEventsByIds(["event-1", "event-2"]);
      });

      expect(queries).toContain("BEGIN");
      expect(queries.some((query) => query.includes("WITH refs AS"))).toBe(
        true
      );
      expect(
        queries.some((query) => query.includes("DELETE FROM review_events"))
      ).toBe(true);
      expect(queries).toContain("COMMIT");
      expect(client.release).toHaveBeenCalled();
    });

    test("cachedEventsBelongToPubkey returns true only when every unique event is owned", async () => {
      const client: MockDbClient = {
        query: jest.fn(async (q: QueryInput) => {
          const text = typeof q === "string" ? q : q.text || "";
          if (text.includes("UNION ALL")) {
            return {
              rows: [
                { id: "event-1", pubkey: "owner-1" },
                { id: "event-2", pubkey: "owner-1" },
              ],
              rowCount: 2,
            };
          }
          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await expect(
          mod.cachedEventsBelongToPubkey(
            ["event-1", "event-1", "event-2"],
            "owner-1"
          )
        ).resolves.toBe(true);
      });

      expect(client.release).toHaveBeenCalled();
    });

    test("cachedEventsBelongToPubkey returns false for foreign or missing rows", async () => {
      const client: MockDbClient = {
        query: jest.fn(async (q: QueryInput) => {
          const text = typeof q === "string" ? q : q.text || "";
          if (text.includes("UNION ALL")) {
            return {
              rows: [{ id: "event-1", pubkey: "other-owner" }],
              rowCount: 1,
            };
          }
          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await expect(
          mod.cachedEventsBelongToPubkey(["event-1", "event-2"], "owner-1")
        ).resolves.toBe(false);
      });

      expect(client.release).toHaveBeenCalled();
    });

    test("fetchAllProductsFromDb maps rows from the latest-product query", async () => {
      const client: MockDbClient = {
        query: jest.fn(async (q: QueryInput) => {
          const text = typeof q === "string" ? q : q.text || "";
          if (text.includes("FROM product_events p")) {
            return {
              rows: [
                {
                  id: "product-1",
                  pubkey: "seller-1",
                  created_at: 20,
                  kind: 30402,
                  tags: [["d", "listing-1"]],
                  content: "product content",
                  sig: "sig-product-1",
                },
              ],
              rowCount: 1,
            };
          }
          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await expect(mod.fetchAllProductsFromDb(25, 5)).resolves.toEqual([
          {
            id: "product-1",
            pubkey: "seller-1",
            created_at: 20,
            kind: 30402,
            tags: [["d", "listing-1"]],
            content: "product content",
            sig: "sig-product-1",
          },
        ]);
      });

      expect(client.release).toHaveBeenCalled();
    });

    test("fetchAllMessagesFromDb maps rows with read status", async () => {
      const client: MockDbClient = {
        query: jest.fn(async (q: QueryInput) => {
          const text = typeof q === "string" ? q : q.text || "";
          if (text.includes("FROM message_events WHERE 1=1")) {
            return {
              rows: [
                {
                  id: "message-1",
                  pubkey: "sender-1",
                  created_at: 20,
                  kind: 1059,
                  tags: [["p", "recipient-1"]],
                  content: "message content",
                  sig: "sig-message-1",
                  is_read: false,
                },
              ],
              rowCount: 1,
            };
          }
          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await expect(mod.fetchAllMessagesFromDb()).resolves.toEqual([
          {
            id: "message-1",
            pubkey: "sender-1",
            created_at: 20,
            kind: 1059,
            tags: [["p", "recipient-1"]],
            content: "message content",
            sig: "sig-message-1",
            is_read: false,
          },
        ]);
      });

      expect(client.release).toHaveBeenCalled();
    });

    test("order helpers map participants, statuses, and status updates", async () => {
      const queries: Array<{ text: string; params?: unknown[] }> = [];
      const client: MockDbClient = {
        query: jest.fn(async (q: QueryInput, params?: unknown[]) => {
          const text = typeof q === "string" ? q : q.text || "";
          queries.push({ text, params });

          if (
            text.includes("SELECT tags") &&
            text.includes("FROM message_events")
          ) {
            return {
              rows: [
                {
                  tags: [
                    ["b", "buyer-1"],
                    ["item", "30402:seller-1:listing-1"],
                  ],
                },
              ],
              rowCount: 1,
            };
          }

          if (text.includes("SELECT DISTINCT ON (order_id)")) {
            return {
              rows: [
                { order_id: "order-1", order_status: "paid" },
                { order_id: "order-2", order_status: null },
              ],
              rowCount: 2,
            };
          }

          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await expect(mod.getOrderParticipants("order-1")).resolves.toEqual({
          buyerPubkey: "buyer-1",
          sellerPubkey: "seller-1",
        });
        await expect(
          mod.getOrderStatuses(["order-1", "order-2"])
        ).resolves.toEqual({ "order-1": "paid" });
        await expect(
          mod.updateOrderStatus("order-1", "shipped", "seller-1")
        ).resolves.toBeUndefined();
      });

      expect(
        queries.some(
          (query) =>
            query.text.includes("UPDATE message_events") &&
            query.params?.[0] === "shipped"
        )
      ).toBe(true);
      expect(client.release).toHaveBeenCalled();
    });

    test("profile and wallet fetch helpers map event rows", async () => {
      const client: MockDbClient = {
        query: jest.fn(async (q: QueryInput) => {
          const text = typeof q === "string" ? q : q.text || "";

          if (text.includes("FROM profile_events") && !text.includes("WHERE")) {
            return {
              rows: [
                {
                  id: "profile-1",
                  pubkey: "profile-owner",
                  created_at: 20,
                  kind: 0,
                  tags: [],
                  content: '{"name":"Profile"}',
                  sig: "sig-profile-1",
                },
              ],
              rowCount: 1,
            };
          }

          if (text.includes("FROM wallet_events")) {
            return {
              rows: [
                {
                  id: "wallet-1",
                  pubkey: "wallet-owner",
                  created_at: 30,
                  kind: 17375,
                  tags: [],
                  content: "wallet content",
                  sig: "sig-wallet-1",
                },
              ],
              rowCount: 1,
            };
          }

          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await expect(mod.fetchAllProfilesFromDb()).resolves.toEqual([
          {
            id: "profile-1",
            pubkey: "profile-owner",
            created_at: 20,
            kind: 0,
            tags: [],
            content: '{"name":"Profile"}',
            sig: "sig-profile-1",
          },
        ]);
        await expect(
          mod.fetchAllWalletEventsFromDb("wallet-owner")
        ).resolves.toEqual([
          {
            id: "wallet-1",
            pubkey: "wallet-owner",
            created_at: 30,
            kind: 17375,
            tags: [],
            content: "wallet content",
            sig: "sig-wallet-1",
          },
        ]);
      });

      expect(client.release).toHaveBeenCalled();
    });

    test("thin cached fetch wrappers delegate to fetchCachedEvents", async () => {
      const queriedTables: string[] = [];
      const client: MockDbClient = {
        query: jest.fn(async (q: QueryInput) => {
          const text = typeof q === "string" ? q : q.text || "";
          const tableMatch = text.match(/FROM (\w+_events) WHERE kind = \$1/);
          if (tableMatch?.[1]) {
            queriedTables.push(tableMatch[1]);
          }
          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await expect(mod.fetchAllReviewsFromDb()).resolves.toEqual([]);
        await expect(mod.fetchAllCommunitiesFromDb()).resolves.toEqual([]);
        await expect(mod.fetchRelayConfigFromDb("owner-1")).resolves.toEqual(
          []
        );
        await expect(mod.fetchBlossomConfigFromDb("owner-1")).resolves.toEqual(
          []
        );
      });

      expect(queriedTables).toEqual([
        "review_events",
        "community_events",
        "config_events",
        "config_events",
      ]);
      expect(client.release).toHaveBeenCalled();
    });

    test("product, shop, slug, and community lookup helpers map rows and null results", async () => {
      const client: MockDbClient = {
        query: jest.fn(async (q: QueryInput, params?: unknown[]) => {
          const text = typeof q === "string" ? q : q.text || "";

          if (text.includes("FROM product_events WHERE id = $1")) {
            if (params?.[0] === "missing-product") {
              return { rows: [], rowCount: 0 };
            }
            return {
              rows: [
                {
                  id: "product-1",
                  pubkey: "seller-1",
                  created_at: 20,
                  kind: 30402,
                  tags: [["d", "listing-1"]],
                  content: "product content",
                  sig: "sig-product-1",
                },
              ],
              rowCount: 1,
            };
          }

          if (
            text.includes("FROM product_events") &&
            text.includes("WHERE pubkey = $1")
          ) {
            if (params?.[1] === "missing-d-tag") {
              return { rows: [], rowCount: 0 };
            }
            return {
              rows: [
                {
                  id: "product-d-tag-1",
                  pubkey: "seller-1",
                  created_at: 30,
                  kind: 30402,
                  tags: [["d", "listing-1"]],
                  content: "d tag content",
                  sig: "sig-product-d-tag-1",
                },
              ],
              rowCount: 1,
            };
          }

          if (
            text.includes("FROM profile_events") &&
            text.includes("kind = 30019")
          ) {
            return {
              rows: [
                {
                  id: "shop-profile-1",
                  pubkey: "shop-owner",
                  created_at: 40,
                  kind: 30019,
                  tags: [],
                  content: '{"name":"Shop"}',
                  sig: "sig-shop-profile-1",
                },
              ],
              rowCount: 1,
            };
          }

          if (text.includes("FROM shop_slugs")) {
            return params?.[0] === "missing-shop"
              ? { rows: [], rowCount: 0 }
              : { rows: [{ pubkey: "shop-owner" }], rowCount: 1 };
          }

          if (text.includes("FROM community_events")) {
            return params?.[1] === "missing-community"
              ? { rows: [], rowCount: 0 }
              : {
                  rows: [
                    {
                      id: "community-1",
                      pubkey: "community-owner",
                      created_at: 50,
                      kind: 34550,
                      tags: [["d", "community-1"]],
                      content: "community content",
                      sig: "sig-community-1",
                    },
                  ],
                  rowCount: 1,
                };
          }

          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await expect(
          mod.fetchProductByIdFromDb("product-1")
        ).resolves.toMatchObject({
          id: "product-1",
        });
        await expect(
          mod.fetchProductByIdFromDb("missing-product")
        ).resolves.toBeNull();
        await expect(
          mod.fetchProductByDTagAndPubkey("listing-1", "seller-1")
        ).resolves.toMatchObject({ id: "product-d-tag-1" });
        await expect(
          mod.fetchProductByDTagAndPubkey("missing-d-tag", "seller-1")
        ).resolves.toBeNull();
        await expect(
          mod.fetchShopProfileByPubkeyFromDb("shop-owner")
        ).resolves.toMatchObject({ id: "shop-profile-1" });
        await expect(mod.fetchShopPubkeyBySlug(" Shop-One ")).resolves.toBe(
          "shop-owner"
        );
        await expect(
          mod.fetchShopPubkeyBySlug("missing-shop")
        ).resolves.toBeNull();
        await expect(
          mod.fetchCommunityByPubkeyAndIdentifier(
            "community-owner",
            "community-1"
          )
        ).resolves.toMatchObject({ id: "community-1" });
        await expect(
          mod.fetchCommunityByPubkeyAndIdentifier(
            "community-owner",
            "missing-community"
          )
        ).resolves.toBeNull();
      });

      expect(client.release).toHaveBeenCalled();
    });

    test("fetchProfilePubkeyByNameSlug handles duplicate exact and disambiguated matches", async () => {
      const client: MockDbClient = {
        query: jest.fn(async () => ({
          rows: [
            {
              pubkey: "abcdef12-first",
              content: JSON.stringify({ name: "Duplicated Shop" }),
            },
            {
              pubkey: "abcdef12-second",
              content: JSON.stringify({ name: "Duplicated Shop" }),
            },
            {
              pubkey: "12345678-unique",
              content: JSON.stringify({ name: "Unique Shop" }),
            },
          ],
          rowCount: 3,
        })),
        release: jest.fn(),
      };

      await withMockedDbService(client, async (mod) => {
        await expect(
          mod.fetchProfilePubkeyByNameSlug("Duplicated-Shop")
        ).resolves.toBeNull();
        await expect(
          mod.fetchProfilePubkeyByNameSlug("Unique-Shop-12345678")
        ).resolves.toBe("12345678-unique");
      });

      expect(client.release).toHaveBeenCalled();
    });

    test("markMessagesAsRead updates matching rows for author and recipient", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@localhost/testdb";
        try {
          const client: MockDbClient = {
            query: jest.fn(async () => ({ rowCount: 1 })),
            release: jest.fn(),
          };

          const pool: MockDbPool = {
            connect: jest.fn(async () => client),
            on: jest.fn(),
          };

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool;
              }
            },
          }));

          const mod = await import("../db-service");
          await mod.markMessagesAsRead(["msg-1", "msg-2"], "recipient-1");

          expect(client.query).toHaveBeenCalledWith(
            expect.stringContaining("UPDATE message_events"),
            [["msg-1", "msg-2"], "recipient-1"]
          );
        } finally {
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("getUnreadMessageCount returns the parsed unread count", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@localhost/testdb";
        try {
          const client: MockDbClient = {
            query: jest.fn(async () => ({ rows: [{ count: "4" }] })),
            release: jest.fn(),
          };

          const pool: MockDbPool = {
            connect: jest.fn(async () => client),
            on: jest.fn(),
          };

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool;
              }
            },
          }));

          const mod = await import("../db-service");
          await expect(mod.getUnreadMessageCount("buyer-1")).resolves.toBe(4);
          expect(client.query).toHaveBeenCalledWith(
            expect.stringContaining("jsonb_array_elements(tags)"),
            ["buyer-1"]
          );
        } finally {
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("getUnreadMessageCount counts unread messages where the user is the recipient", async () => {
      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@localhost/testdb";
        try {
          const client: MockDbClient = {
            query: jest.fn(async (queryText: string) => {
              if (queryText.includes("jsonb_array_elements(tags)")) {
                return { rows: [{ count: "2" }] };
              }

              return { rows: [{ count: "0" }] };
            }),
            release: jest.fn(),
          };

          const pool: MockDbPool = {
            connect: jest.fn(async () => client),
            on: jest.fn(),
          };

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool;
              }
            },
          }));

          const mod = await import("../db-service");
          await expect(mod.getUnreadMessageCount("recipient-1")).resolves.toBe(
            2
          );
          expect(client.query).toHaveBeenCalledWith(
            expect.stringContaining("OR EXISTS"),
            ["recipient-1"]
          );
        } finally {
          process.env.DATABASE_URL = prev;
        }
      });
    });

    test("deleteCachedEvent issues DELETE for known kind and is no-op for unknown kind", async () => {
      const prev = process.env.DATABASE_URL;
      try {
        // First: known kind, ensure DELETE is issued
        await jest.isolateModulesAsync(async () => {
          process.env.DATABASE_URL = "postgres://test@localhost/testdb";

          const client: MockDbClient = {
            query: jest.fn(async () => ({ rowCount: 1 })),
            release: jest.fn(),
          };

          const pool: MockDbPool = {
            connect: jest.fn(async () => client),
            on: jest.fn(),
          };

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool;
              }
            },
          }));

          const mod = await import("../db-service");
          await mod.deleteCachedEvent("evt-123", 30402);
          expect(pool.connect).toHaveBeenCalled();
          expect(client.query).toHaveBeenCalledWith(
            expect.stringContaining("DELETE FROM product_events"),
            ["evt-123"]
          );
        });

        // Second: unknown kind should not call DB (fresh module to avoid init side-effects)
        await jest.isolateModulesAsync(async () => {
          process.env.DATABASE_URL = "postgres://test@localhost/testdb";

          const client2: MockDbClient = {
            query: jest.fn(async () => ({ rowCount: 1 })),
            release: jest.fn(),
          };

          const pool2: MockDbPool = {
            connect: jest.fn(async () => client2),
            on: jest.fn(),
          };

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool2;
              }
            },
          }));

          const mod2 = await import("../db-service");
          await mod2.deleteCachedEvent("evt-999", 999999);
          expect(pool2.connect).not.toHaveBeenCalled();
          expect(client2.query).not.toHaveBeenCalled();
        });
      } finally {
        process.env.DATABASE_URL = prev;
      }
    });
  });

  describe("db-service with Testcontainers (discounts, stats, cached events)", () => {
    maybeItTc(
      "read helpers fetch reviews/messages/profiles/wallet/communities/relay/blossom",
      async () => {
        await withPostgresDbService(async (db) => {
          await waitForTables(db, [
            "review_events",
            "message_events",
            "profile_events",
            "wallet_events",
            "community_events",
            "config_events",
          ]);

          await db.cacheEvents([
            {
              id: "review-old",
              pubkey: "reviewer-1",
              created_at: 100,
              kind: 31555,
              tags: [["d", "listing-a"]],
              content: "old review",
              sig: "sig-review-old",
            },
            {
              id: "review-new",
              pubkey: "reviewer-1",
              created_at: 200,
              kind: 31555,
              tags: [["d", "listing-a"]],
              content: "new review",
              sig: "sig-review-new",
            },
            {
              id: "message-1",
              pubkey: "buyer-1",
              created_at: 110,
              kind: 1059,
              tags: [["p", "recipient-1"]],
              content: "message one",
              sig: "sig-message-1",
            },
            {
              id: "message-2",
              pubkey: "buyer-2",
              created_at: 210,
              kind: 1059,
              tags: [["p", "recipient-2"]],
              content: "message two",
              sig: "sig-message-2",
            },
            {
              id: "profile-1",
              pubkey: "profile-1",
              created_at: 120,
              kind: 0,
              tags: [],
              content: '{"name":"Alice"}',
              sig: "sig-profile-1",
            },
            {
              id: "profile-2",
              pubkey: "profile-2",
              created_at: 220,
              kind: 30019,
              tags: [],
              content: '{"name":"Alice Shop"}',
              sig: "sig-profile-2",
            },
            {
              id: "wallet-1",
              pubkey: "wallet-owner",
              created_at: 130,
              kind: 7375,
              tags: [],
              content: "wallet one",
              sig: "sig-wallet-1",
            },
            {
              id: "wallet-2",
              pubkey: "wallet-owner",
              created_at: 230,
              kind: 7376,
              tags: [],
              content: "wallet two",
              sig: "sig-wallet-2",
            },
            {
              id: "community-1",
              pubkey: "community-owner-1",
              created_at: 140,
              kind: 34550,
              tags: [["d", "community-a"]],
              content: "community one",
              sig: "sig-community-1",
            },
            {
              id: "community-2",
              pubkey: "community-owner-2",
              created_at: 240,
              kind: 34550,
              tags: [["d", "community-b"]],
              content: "community two",
              sig: "sig-community-2",
            },
            {
              id: "relay-1",
              pubkey: "config-owner",
              created_at: 150,
              kind: 10002,
              tags: [],
              content: "relay old",
              sig: "sig-relay-1",
            },
            {
              id: "relay-2",
              pubkey: "config-owner",
              created_at: 250,
              kind: 10002,
              tags: [],
              content: "relay new",
              sig: "sig-relay-2",
            },
            {
              id: "blossom-1",
              pubkey: "config-owner",
              created_at: 160,
              kind: 10063,
              tags: [],
              content: "blossom old",
              sig: "sig-blossom-1",
            },
            {
              id: "blossom-2",
              pubkey: "config-owner",
              created_at: 260,
              kind: 10063,
              tags: [],
              content: "blossom new",
              sig: "sig-blossom-2",
            },
          ]);

          const reviews = await db.fetchAllReviewsFromDb();
          expect(reviews.map((event) => event.id)).toEqual(["review-new"]);

          const messages = await db.fetchAllMessagesFromDb();
          expect(messages.map((event) => event.id)).toEqual([
            "message-2",
            "message-1",
          ]);

          const filteredMessages =
            await db.fetchAllMessagesFromDb("recipient-2");
          expect(filteredMessages.map((event) => event.id)).toEqual([
            "message-2",
          ]);

          const profiles = await db.fetchAllProfilesFromDb();
          expect(profiles.map((event) => event.id)).toEqual([
            "profile-2",
            "profile-1",
          ]);

          const wallet = await db.fetchAllWalletEventsFromDb("wallet-owner");
          expect(wallet.map((event) => event.id)).toEqual([
            "wallet-2",
            "wallet-1",
          ]);

          const communities = await db.fetchAllCommunitiesFromDb();
          expect(communities.map((event) => event.id)).toEqual([
            "community-2",
            "community-1",
          ]);

          const relayConfig = await db.fetchRelayConfigFromDb("config-owner");
          expect(relayConfig.map((event) => event.id)).toEqual(["relay-2"]);

          const blossomConfig =
            await db.fetchBlossomConfigFromDb("config-owner");
          expect(blossomConfig.map((event) => event.id)).toEqual(["blossom-2"]);
        });
      }
    );

    maybeItTc(
      "fetchAllProductsFromDb returns only the latest row per pubkey and d tag",
      async () => {
        await withPostgresDbService(async (db) => {
          await waitForTables(db, ["product_events"]);

          await db.cacheEvents([
            productEvent({
              id: "product-old-a",
              pubkey: "seller-1",
              created_at: 100,
              tags: [
                ["title", "Listing A"],
                ["price", "10"],
                ["d", "listing-a"],
              ],
              content: "old listing a",
              sig: "sig-old-a",
            }),
            productEvent({
              id: "product-new-a",
              pubkey: "seller-1",
              created_at: 200,
              tags: [
                ["price", "15"],
                ["title", "Listing A"],
                ["d", "listing-a"],
              ],
              content: "new listing a",
              sig: "sig-new-a",
            }),
            productEvent({
              id: "product-b",
              pubkey: "seller-1",
              created_at: 150,
              tags: [
                ["title", "Listing B"],
                ["d", "listing-b"],
              ],
              content: "listing b",
              sig: "sig-b",
            }),
            productEvent({
              id: "product-no-d",
              pubkey: "seller-2",
              created_at: 50,
              tags: [
                ["title", "Listing No D"],
                ["price", "30"],
              ],
              content: "no d listing",
              sig: "sig-no-d",
            }),
          ]);

          const products = await db.fetchAllProductsFromDb();

          expect(products.map((event) => event.id)).toEqual([
            "product-new-a",
            "product-b",
            "product-no-d",
          ]);
          expect(products[0]).toMatchObject({
            id: "product-new-a",
            pubkey: "seller-1",
            content: "new listing a",
          });
          expect(products[1]).toMatchObject({
            id: "product-b",
            pubkey: "seller-1",
            content: "listing b",
          });
          expect(products[2]).toMatchObject({
            id: "product-no-d",
            pubkey: "seller-2",
            content: "no d listing",
          });
        });
      }
    );

    maybeItTc(
      "fetchProductByListingSlug returns the latest titled product and ignores rows without a title tag",
      async () => {
        await withPostgresDbService(async (db) => {
          await waitForTables(db, ["product_events"]);

          await db.cacheEvents([
            productEvent({
              id: "product-no-title",
              pubkey: "seller-1",
              created_at: 300,
              tags: [["price", "999"]],
              content: "untitled",
              sig: "sig-untitled",
            }),
            productEvent({
              id: "product-old",
              pubkey: "seller-1",
              created_at: 100,
              tags: [
                ["title", "Listing A"],
                ["d", "listing-a"],
              ],
              content: "old listing",
              sig: "sig-old",
            }),
            productEvent({
              id: "product-new",
              pubkey: "seller-2",
              created_at: 200,
              tags: [
                ["d", "listing-a"],
                ["title", "Listing A"],
              ],
              content: "new listing",
              sig: "sig-new",
            }),
          ]);

          await expect(
            db.fetchProductByListingSlug("Listing-A")
          ).resolves.toMatchObject({
            id: "product-new",
            pubkey: "seller-2",
            content: "new listing",
          });

          await expect(
            db.fetchProductByListingSlug("Listing-A-seller12")
          ).resolves.toBeNull();
        });
      }
    );

    maybeItTc(
      "message flows resolve order participants and latest order statuses",
      async () => {
        await withPostgresDbService(async (db) => {
          await waitForTables(db, ["message_events"]);

          const pool = db.getDbPool();
          const client = await pool.connect();

          try {
            await client.query(
              `INSERT INTO message_events (
                 id,
                 pubkey,
                 created_at,
                 kind,
                 tags,
                 content,
                 sig,
                 order_id,
                 order_status,
                 is_read
               ) VALUES
               ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10),
               ($11, $12, $13, $14, $15::jsonb, $16, $17, $18, $19, $20),
               ($21, $22, $23, $24, $25::jsonb, $26, $27, $28, $29, $30),
               ($31, $32, $33, $34, $35::jsonb, $36, $37, $38, $39, $40),
               ($41, $42, $43, $44, $45::jsonb, $46, $47, $48, $49, $50)`,
              [
                "order-1-old",
                "buyer-old",
                100,
                1059,
                JSON.stringify([
                  ["b", "buyer-old"],
                  ["a", "nostr:seller-new:listing-1"],
                  ["p", "seller-new"],
                ]),
                "old order message",
                "sig-order-1-old",
                "order-1",
                null,
                false,
                "order-1-new",
                "buyer-new",
                200,
                1059,
                JSON.stringify([
                  ["b", "buyer-new"],
                  ["item", "nostr:seller-new:listing-2"],
                  ["p", "seller-new"],
                ]),
                "new order message",
                "sig-order-1-new",
                "order-1",
                null,
                false,
                "order-2-old",
                "buyer-2",
                150,
                1059,
                JSON.stringify([
                  ["p", "seller-2"],
                  ["a", "nostr:seller-2:listing-2"],
                ]),
                "order two old",
                "sig-order-2-old",
                "order-2",
                "pending",
                false,
                "order-2-new",
                "buyer-2",
                250,
                1059,
                JSON.stringify([
                  ["p", "seller-2"],
                  ["a", "nostr:seller-2:listing-2"],
                ]),
                "order two new",
                "sig-order-2-new",
                "order-2",
                "paid",
                false,
                "order-3",
                "buyer-3",
                300,
                1059,
                JSON.stringify([["p", "seller-3"]]),
                "order three",
                "sig-order-3",
                "order-3",
                null,
                false,
              ]
            );
          } finally {
            client.release();
          }

          await expect(db.getOrderParticipants("order-1")).resolves.toEqual({
            buyerPubkey: "buyer-new",
            sellerPubkey: "seller-new",
          });

          await db.updateOrderStatus(
            "order-1",
            "shipped",
            "seller-new",
            "order-1-old"
          );

          const verifyClient = await db.getDbPool().connect();
          try {
            const updatedRows = await verifyClient.query<{
              id: string;
              order_status: string | null;
            }>(
              `SELECT id, order_status
               FROM message_events
               WHERE order_id = 'order-1'
               ORDER BY created_at DESC`
            );

            expect(updatedRows.rows.map((row) => row.id)).toEqual([
              "order-1-new",
              "order-1-old",
            ]);
            expect(updatedRows.rows.map((row) => row.order_status)).toEqual([
              "shipped",
              "shipped",
            ]);
          } finally {
            verifyClient.release();
          }

          await expect(
            db.getOrderStatuses(["order-1", "order-2", "order-3"])
          ).resolves.toEqual({
            "order-1": "shipped",
            "order-2": "paid",
          });

          await expect(
            db.markMessagesAsRead(["order-1-new"], "buyer-new")
          ).resolves.toBeUndefined();
          await expect(db.getUnreadMessageCount("buyer-new")).resolves.toBe(0);
        });
      }
    );

    maybeItTc(
      "cachedEventsBelongToPubkey verifies ownership across all cached tables",
      async () => {
        await withPostgresDbService(async (db) => {
          await waitForTables(db, [
            "product_events",
            "review_events",
            "message_events",
            "profile_events",
            "wallet_events",
            "community_events",
            "config_events",
          ]);

          const ownerPubkey = "owner-pubkey-1";

          await db.cacheEvents([
            productEvent({
              id: "own-product",
              pubkey: ownerPubkey,
              created_at: 100,
              tags: [["title", "Owned Product"]],
              content: "owned product",
              sig: "sig-owned-product",
            }),
            {
              id: "own-review",
              pubkey: ownerPubkey,
              created_at: 110,
              kind: 31555,
              tags: [["d", "listing-1"]],
              content: "owned review",
              sig: "sig-owned-review",
            } as NostrEvent,
            {
              id: "own-message",
              pubkey: ownerPubkey,
              created_at: 120,
              kind: 1059,
              tags: [["p", "recipient-1"]],
              content: "owned message",
              sig: "sig-owned-message",
            } as NostrEvent,
            {
              id: "own-profile",
              pubkey: ownerPubkey,
              created_at: 130,
              kind: 30019,
              tags: [],
              content: '{"name":"Owned Shop"}',
              sig: "sig-owned-profile",
            } as NostrEvent,
            latestOnlyEvent({
              id: "own-wallet",
              pubkey: ownerPubkey,
              created_at: 140,
              content: "owned wallet",
              sig: "sig-owned-wallet",
            }),
            {
              id: "own-community",
              pubkey: ownerPubkey,
              created_at: 150,
              kind: 34550,
              tags: [["d", "community-1"]],
              content: "owned community",
              sig: "sig-owned-community",
            } as NostrEvent,
            {
              id: "own-config",
              pubkey: ownerPubkey,
              created_at: 160,
              kind: 10002,
              tags: [],
              content: "owned config",
              sig: "sig-owned-config",
            } as NostrEvent,
            productEvent({
              id: "foreign-product",
              pubkey: "foreign-pubkey",
              created_at: 200,
              tags: [["title", "Foreign Product"]],
              content: "foreign product",
              sig: "sig-foreign-product",
            }),
          ]);

          await expect(
            db.cachedEventsBelongToPubkey(
              [
                "own-product",
                "own-review",
                "own-message",
                "own-profile",
                "own-wallet",
                "own-community",
                "own-config",
              ],
              ownerPubkey
            )
          ).resolves.toBe(true);

          await expect(
            db.cachedEventsBelongToPubkey(
              [
                "own-product",
                "own-review",
                "own-message",
                "own-profile",
                "own-wallet",
                "own-community",
                "own-config",
                "foreign-product",
              ],
              ownerPubkey
            )
          ).resolves.toBe(false);

          await expect(
            db.cachedEventsBelongToPubkey(
              ["own-product", "missing-id"],
              ownerPubkey
            )
          ).resolves.toBe(false);

          await expect(
            db.cachedEventsBelongToPubkey(
              ["own-product", "own-product"],
              ownerPubkey
            )
          ).resolves.toBe(true);
        });
      }
    );

    maybeItTc("discount code CRUD using Postgres", async () => {
      await withPostgresDbService(async (db) => {
        await waitForTables(db, ["discount_codes"]);

        const expiration = Math.floor(Date.now() / 1000) + 3600;
        await db.addDiscountCode("CODE1", "pk1", 25, expiration);

        const inserted = await db.getDiscountCodesByPubkey("pk1");
        expect(inserted).toHaveLength(1);
        const insertedCode = inserted[0]!;
        expect(insertedCode.code).toBe("CODE1");
        expect(insertedCode.discount_percentage).toBeCloseTo(25);
        expect(insertedCode.expiration).toBe(expiration);

        const valid = await db.validateDiscountCode("CODE1", "pk1");
        expect(valid.valid).toBe(true);
        expect(valid.discount_percentage).toBeCloseTo(25);

        await db.addDiscountCode("CODE1", "pk1", 30, expiration);
        const updated = await db.validateDiscountCode("CODE1", "pk1");
        expect(updated.valid).toBe(true);
        expect(updated.discount_percentage).toBeCloseTo(30);

        await db.deleteDiscountCode("CODE1", "pk1");
        await expect(db.getDiscountCodesByPubkey("pk1")).resolves.toHaveLength(
          0
        );
        await expect(db.validateDiscountCode("CODE1", "pk1")).resolves.toEqual({
          valid: false,
        });
      });
    });

    maybeItTc(
      "fetchMarketplaceStats returns correct listing and seller counts",
      async () => {
        await withPostgresDbService(async (db) => {
          await waitForTables(db, ["product_events"]);

          await db.cacheEvent(productEvent({ id: "p1", pubkey: "seller1" }));
          await db.cacheEvent(productEvent({ id: "p2", pubkey: "seller2" }));
          await db.cacheEvent(productEvent({ id: "p3", pubkey: "seller1" }));

          await expect(db.fetchMarketplaceStats()).resolves.toEqual({
            listingCount: 3,
            sellerCount: 2,
          });
        });
      }
    );

    maybeItTc(
      "fetchProductByIdFromDb and fetchProductByDTagAndPubkey return real product rows",
      async () => {
        await withPostgresDbService(async (db) => {
          await waitForTables(db, ["product_events"]);

          await db.cacheEvents([
            productEvent({
              id: "product-old",
              pubkey: "seller-1",
              created_at: 100,
              tags: [
                ["title", "Listing A"],
                ["d", "listing-a"],
              ],
              content: "old listing",
              sig: "sig-old",
            }),
            productEvent({
              id: "product-new",
              pubkey: "seller-1",
              created_at: 200,
              tags: [
                ["d", "listing-a"],
                ["title", "Listing A"],
              ],
              content: "new listing",
              sig: "sig-new",
            }),
          ]);

          await expect(
            db.fetchProductByIdFromDb("product-new")
          ).resolves.toMatchObject({
            id: "product-new",
            pubkey: "seller-1",
            content: "new listing",
          });

          await expect(
            db.fetchProductByDTagAndPubkey("listing-a", "seller-1")
          ).resolves.toMatchObject({
            id: "product-new",
            pubkey: "seller-1",
            content: "new listing",
          });

          await expect(
            db.fetchProductByDTagAndPubkey("missing", "seller-1")
          ).resolves.toBeNull();
        });
      }
    );

    maybeItTc(
      "fetchShopProfileByPubkeyFromDb and fetchProfilePubkeyByNameSlug resolve profile rows",
      async () => {
        await withPostgresDbService(async (db) => {
          await waitForTables(db, ["profile_events"]);

          await db.cacheEvents([
            {
              id: "profile-unique",
              pubkey: "user-unique-1",
              created_at: 100,
              kind: 0,
              tags: [],
              content: '{"name":"Unique Profile"}',
              sig: "sig-unique",
            } as NostrEvent,
            {
              id: "profile-shop",
              pubkey: "shop-owner-2",
              created_at: 150,
              kind: 30019,
              tags: [],
              content: '{"name":"Alice Shop"}',
              sig: "sig-shop",
            } as NostrEvent,
            {
              id: "profile-shop-old",
              pubkey: "abcd1234deadbeef0001",
              created_at: 200,
              kind: 0,
              tags: [],
              content: '{"name":"Alice Shop"}',
              sig: "sig-shop-old",
            } as NostrEvent,
            {
              id: "profile-shop-new",
              pubkey: "abcd1234cafebabe0002",
              created_at: 300,
              kind: 0,
              tags: [],
              content: '{"name":"Alice Shop"}',
              sig: "sig-shop-new",
            } as NostrEvent,
          ]);

          await expect(
            db.fetchShopProfileByPubkeyFromDb("shop-owner-2")
          ).resolves.toMatchObject({
            id: "profile-shop",
            pubkey: "shop-owner-2",
            content: '{"name":"Alice Shop"}',
          });

          await expect(
            db.fetchProfilePubkeyByNameSlug("Unique-Profile")
          ).resolves.toBe("user-unique-1");

          await expect(
            db.fetchProfilePubkeyByNameSlug("Alice-Shop")
          ).resolves.toBeNull();

          await expect(
            db.fetchProfilePubkeyByNameSlug("Alice-Shop-abcd1234")
          ).resolves.toBe("abcd1234cafebabe0002");
        });
      }
    );

    maybeItTc("fetchShopPubkeyBySlug resolves normalized slugs", async () => {
      await withPostgresDbService(async (db) => {
        await waitForTables(db, ["shop_slugs"]);

        const pool = db.getDbPool();
        const client = await pool.connect();

        try {
          await client.query(
            `INSERT INTO shop_slugs (pubkey, slug)
               VALUES ($1, $2), ($3, $4)`,
            ["shop-owner-1", "my-shop", "shop-owner-2", "another-shop"]
          );
        } finally {
          client.release();
        }

        await expect(db.fetchShopPubkeyBySlug("  My-Shop  ")).resolves.toBe(
          "shop-owner-1"
        );
        await expect(
          db.fetchShopPubkeyBySlug("missing-shop")
        ).resolves.toBeNull();
      });
    });

    maybeItTc(
      "fetchCommunityByPubkeyAndIdentifier returns the latest matching community",
      async () => {
        await withPostgresDbService(async (db) => {
          await waitForTables(db, ["community_events"]);

          await db.cacheEvents([
            {
              id: "community-old",
              pubkey: "community-owner-1",
              created_at: 100,
              kind: 34550,
              tags: [["d", "community-a"]],
              content: "old community",
              sig: "sig-community-old",
            } as NostrEvent,
            {
              id: "community-new",
              pubkey: "community-owner-1",
              created_at: 200,
              kind: 34550,
              tags: [["d", "community-a"]],
              content: "new community",
              sig: "sig-community-new",
            } as NostrEvent,
          ]);

          await expect(
            db.fetchCommunityByPubkeyAndIdentifier(
              "community-owner-1",
              "community-a"
            )
          ).resolves.toMatchObject({
            id: "community-new",
            pubkey: "community-owner-1",
            content: "new community",
          });

          await expect(
            db.fetchCommunityByPubkeyAndIdentifier(
              "community-owner-1",
              "missing-community"
            )
          ).resolves.toBeNull();
        });
      }
    );

    maybeItTc(
      "fetchCachedEvents supports pubkey/limit/offset/since/until filters",
      async () => {
        await withPostgresDbService(async (db) => {
          await waitForTables(db, ["product_events"]);

          await db.cacheEvent(
            productEvent({
              id: "e1",
              pubkey: "alice",
              created_at: 10,
              content: "c1",
              sig: "s1",
            })
          );
          await db.cacheEvent(
            productEvent({
              id: "e2",
              pubkey: "bob",
              created_at: 20,
              content: "c2",
              sig: "s2",
            })
          );
          await db.cacheEvent(
            productEvent({
              id: "e3",
              pubkey: "alice",
              created_at: 30,
              content: "c3",
              sig: "s3",
            })
          );

          const all = await db.fetchCachedEvents(30402);
          expect(all.map((event) => event.id)).toEqual(["e3", "e2", "e1"]);

          const alice = await db.fetchCachedEvents(30402, { pubkey: "alice" });
          expect(alice.map((event) => event.id)).toEqual(["e3", "e1"]);

          const between = await db.fetchCachedEvents(30402, {
            since: 15,
            until: 30,
          });
          expect(between.map((event) => event.id)).toEqual(["e3", "e2"]);

          const limited = await db.fetchCachedEvents(30402, {
            limit: 1,
            offset: 1,
          });
          expect(limited.map((event) => event.id)).toEqual(["e2"]);
        });
      }
    );

    maybeItTc(
      "cacheEvent keeps only the latest-only event per pubkey",
      async () => {
        await withPostgresDbService(async (db) => {
          await waitForTables(db, ["wallet_events"]);

          const first = {
            id: "wallet-1",
            pubkey: "wallet-owner",
            created_at: 100,
            kind: 17375,
            tags: [],
            content: "first",
            sig: "sig-1",
          } as NostrEvent;

          const second = {
            ...first,
            id: "wallet-2",
            created_at: 200,
            content: "second",
            sig: "sig-2",
          } as NostrEvent;

          await db.cacheEvent(first);
          await db.cacheEvent(second);

          const walletEvents =
            await db.fetchAllWalletEventsFromDb("wallet-owner");
          expect(walletEvents).toHaveLength(1);
          expect(walletEvents[0]?.id).toBe("wallet-2");
          expect(walletEvents[0]?.content).toBe("second");
        });
      }
    );

    maybeItTc(
      "cacheEvent keeps only the latest review per pubkey and d tag",
      async () => {
        await withPostgresDbService(async (db) => {
          await waitForTables(db, ["review_events"]);

          const first = {
            id: "review-1",
            pubkey: "reviewer-1",
            created_at: 100,
            kind: 31555,
            tags: [["d", "listing-1"]],
            content: "first review",
            sig: "sig-1",
          } as NostrEvent;

          const second = {
            ...first,
            id: "review-2",
            created_at: 200,
            content: "second review",
            sig: "sig-2",
          } as NostrEvent;

          await db.cacheEvent(first);
          await db.cacheEvent(second);

          const reviews = await db.fetchAllReviewsFromDb();
          expect(reviews).toHaveLength(1);
          expect(reviews[0]?.id).toBe("review-2");
          expect(reviews[0]?.content).toBe("second review");
        });
      }
    );

    maybeItTc(
      "cacheEventsTransaction keeps latest-only and review rows deduped within one batch",
      async () => {
        await withPostgresDbService(async (db) => {
          await waitForTables(db, ["wallet_events", "review_events"]);

          await db.cacheEvents([
            latestOnlyEvent({
              id: "wallet-old",
              pubkey: "wallet-owner",
              created_at: 100,
              content: "old wallet",
              sig: "wallet-sig-1",
            }),
            latestOnlyEvent({
              id: "wallet-new",
              pubkey: "wallet-owner",
              created_at: 200,
              content: "new wallet",
              sig: "wallet-sig-2",
            }),
            latestOnlyEvent({
              id: "wallet-other",
              pubkey: "wallet-other-owner",
              created_at: 150,
              content: "other wallet",
              sig: "wallet-sig-3",
            }),
            reviewEvent({
              id: "review-old",
              pubkey: "reviewer-1",
              created_at: 100,
              tags: [["d", "listing-a"]],
              content: "old review",
              sig: "review-sig-1",
            }),
            reviewEvent({
              id: "review-new",
              pubkey: "reviewer-1",
              created_at: 200,
              tags: [["d", "listing-a"]],
              content: "new review",
              sig: "review-sig-2",
            }),
            reviewEvent({
              id: "review-other",
              pubkey: "reviewer-1",
              created_at: 150,
              tags: [["d", "listing-b"]],
              content: "other review",
              sig: "review-sig-3",
            }),
          ]);

          const walletEvents =
            await db.fetchAllWalletEventsFromDb("wallet-owner");
          expect(walletEvents).toHaveLength(1);
          expect(walletEvents[0]?.id).toBe("wallet-new");

          const otherWalletEvents =
            await db.fetchAllWalletEventsFromDb("wallet-other-owner");
          expect(otherWalletEvents).toHaveLength(1);
          expect(otherWalletEvents[0]?.id).toBe("wallet-other");

          const reviews = await db.fetchAllReviewsFromDb();
          expect(reviews.map((event) => event.id)).toEqual([
            "review-new",
            "review-other",
          ]);
        });
      }
    );

    maybeItTc(
      "deleteCachedEventsByIds removes a product event and older same-d-tag versions only",
      async () => {
        await withPostgresDbService(async (db) => {
          await waitForTables(db, ["product_events"]);

          await db.cacheEvents([
            productEvent({
              id: "product-a1",
              pubkey: "seller-1",
              created_at: 100,
              tags: [["d", "listing-a"]],
              content: "old listing a",
              sig: "sig-a1",
            }),
            productEvent({
              id: "product-a2",
              pubkey: "seller-1",
              created_at: 200,
              tags: [["d", "listing-a"]],
              content: "middle listing a",
              sig: "sig-a2",
            }),
            productEvent({
              id: "product-a3",
              pubkey: "seller-1",
              created_at: 300,
              tags: [["d", "listing-a"]],
              content: "new listing a",
              sig: "sig-a3",
            }),
            productEvent({
              id: "product-b1",
              pubkey: "seller-1",
              created_at: 150,
              tags: [["d", "listing-b"]],
              content: "listing b",
              sig: "sig-b1",
            }),
          ]);

          await db.deleteCachedEventsByIds(["product-a2"]);

          await expect(
            db.fetchProductByIdFromDb("product-a1")
          ).resolves.toBeNull();
          await expect(
            db.fetchProductByIdFromDb("product-a2")
          ).resolves.toBeNull();
          await expect(
            db.fetchProductByIdFromDb("product-a3")
          ).resolves.toMatchObject({
            id: "product-a3",
            content: "new listing a",
          });
          await expect(
            db.fetchProductByIdFromDb("product-b1")
          ).resolves.toMatchObject({
            id: "product-b1",
            content: "listing b",
          });
        });
      }
    );
  });
});
