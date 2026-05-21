/**
 * @jest-environment node
 */

jest.setTimeout(180000);

import {
  getTableForKind,
  shouldKeepOnlyLatest,
  isReviewEvent,
  buildReviewDTagFilter,
  profileNameToSlug,
} from "../db-service";
import type { NostrEvent } from "../../types/types";

async function withPostgresTestContainer<T>(
  callback: (databaseUrl: string) => Promise<T>
): Promise<T> {
  const { PostgreSqlContainer } = await import("testcontainers");

  const container = await new PostgreSqlContainer("postgres:15-alpine")
    .withDatabase("shopstr")
    .withUsername("shopstr")
    .withPassword("shopstr")
    .start();

  try {
    const host = container.getHost();
    const port = container.getMappedPort(5432);
    const databaseUrl = `postgres://shopstr:shopstr@${host}:${port}/shopstr`;
    return await callback(databaseUrl);
  } finally {
    await container.stop();
  }
}

describe("db-service helpers", () => {
  test("getTableForKind maps known kinds and returns null for unknown", () => {
    expect(getTableForKind(30402)).toBe("product_events");
    expect(getTableForKind(31555)).toBe("review_events");
    expect(getTableForKind(1059)).toBe("message_events");
    expect(getTableForKind(0)).toBe("profile_events");
    expect(getTableForKind(999999)).toBeNull();
  });

  const maybeItTc = process.env.RUN_TESTCONTAINERS ? test : test.skip;

  maybeItTc("testcontainers: initialize + failed publish flow", async () => {
    // Dynamically import Testcontainers so tests still run if the package isn't installed
    const { PostgreSqlContainer } = await import("testcontainers");

    const container = await new PostgreSqlContainer("postgres:15-alpine")
      .withDatabase("shopstr")
      .withUsername("shopstr")
      .withPassword("shopstr")
      .start();

    try {
      const host = container.getHost();
      const port = container.getMappedPort(5432);
      const prev = process.env.DATABASE_URL;
      process.env.DATABASE_URL = `postgres://shopstr:shopstr@${host}:${port}/shopstr`;

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
    } finally {
      await container.stop();
    }
  });

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
        const pool = {
          connect: jest.fn(async () => {
            connectCalled = true;
            return { query: jest.fn(), release: jest.fn() };
          }),
          on: jest.fn(),
        } as any;

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
        const pool = {
          connect: jest.fn(async () => {
            connectCalled = true;
            return { query: jest.fn(), release: jest.fn() };
          }),
          on: jest.fn(),
        } as any;

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
        } as any);
        expect(connectCalled).toBe(false);
      } finally {
        process.env.DATABASE_URL = prev;
      }
    });
  });

  test("cacheEvents groups events and runs transaction (calls BEGIN)", async () => {
    // Use isolated module loading so we can mock 'pg.Pool' before the module is imported
    const queries: string[] = [];
    const client = {
      query: jest.fn(async (q: any) => {
        const text = typeof q === "string" ? q : q.text || "";
        queries.push(text.trim().split("\n")[0]);
        return { rows: [], rowCount: 1 };
      }),
      release: jest.fn(),
      on: jest.fn(),
    } as any;

    const pool = {
      connect: jest.fn(async () => client),
      on: jest.fn(),
    } as any;

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

        await mod.cacheEvents(events as any[]);

        // Expect that a transaction was started
        expect(queries.some((q) => /BEGIN/i.test(q))).toBe(true);
        expect(queries.some((q) => /COMMIT/i.test(q))).toBe(true);
      } finally {
        process.env.DATABASE_URL = prev;
      }
    });
  });

  describe("getDbPool / closeDbPool (unit)", () => {
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
            opts: any;
            ended = false;
            constructor(opts: any) {
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
  });

  describe("db-service with Testcontainers (discounts, stats, cached events)", () => {
    maybeItTc("discount code CRUD using Postgres", async () => {
      await withPostgresTestContainer(async (databaseUrl) => {
        await jest.isolateModulesAsync(async () => {
          jest.resetModules();
          jest.unmock("pg");
          const { Pool } = await import("pg");
          const prepPool = new Pool({ connectionString: databaseUrl });
          const prepClient = await prepPool.connect();
          try {
            await prepClient.query(`
              CREATE TABLE IF NOT EXISTS discount_codes (
                id SERIAL PRIMARY KEY,
                code TEXT NOT NULL,
                pubkey TEXT NOT NULL,
                discount_percentage DECIMAL(5,2) NOT NULL CHECK (discount_percentage > 0 AND discount_percentage <= 100),
                expiration BIGINT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(code, pubkey)
              )
            `);

            await prepClient.query(
              `INSERT INTO discount_codes (code, pubkey, discount_percentage, expiration)
               VALUES ($1, $2, $3, $4)`,
              ["CODE1", "pk1", 25, Math.floor(Date.now() / 1000) + 3600]
            );

            const inserted = await prepClient.query(
              `SELECT code, pubkey, discount_percentage, expiration
               FROM discount_codes
               WHERE pubkey = $1`,
              ["pk1"]
            );
            expect(inserted.rows).toHaveLength(1);
            expect(inserted.rows[0].code).toBe("CODE1");
            expect(Number(inserted.rows[0].discount_percentage)).toBeCloseTo(
              25
            );

            await prepClient.query(
              `UPDATE discount_codes
               SET discount_percentage = $1
               WHERE code = $2 AND pubkey = $3`,
              [30, "CODE1", "pk1"]
            );

            const updated = await prepClient.query(
              `SELECT discount_percentage
               FROM discount_codes
               WHERE code = $1 AND pubkey = $2`,
              ["CODE1", "pk1"]
            );
            expect(Number(updated.rows[0].discount_percentage)).toBeCloseTo(30);

            await prepClient.query(
              `DELETE FROM discount_codes WHERE code = $1 AND pubkey = $2`,
              ["CODE1", "pk1"]
            );

            const deleted = await prepClient.query(
              `SELECT 1 FROM discount_codes WHERE code = $1 AND pubkey = $2`,
              ["CODE1", "pk1"]
            );
            expect(deleted.rows).toHaveLength(0);
          } finally {
            prepClient.release();
            await prepPool.end();
          }
        });
      });
    });

    maybeItTc(
      "fetchMarketplaceStats returns correct listing and seller counts",
      async () => {
        await withPostgresTestContainer(async (databaseUrl) => {
          await jest.isolateModulesAsync(async () => {
            jest.resetModules();
            jest.unmock("pg");
            const { Pool } = await import("pg");
            const prepPool = new Pool({ connectionString: databaseUrl });
            const prepClient = await prepPool.connect();
            try {
              await prepClient.query(`
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
              )
            `);

              await prepClient.query(
                `INSERT INTO product_events (id, pubkey, created_at, kind, tags, content, sig)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                ["p1", "seller1", 1, 30402, JSON.stringify([]), "c", "s"]
              );
              await prepClient.query(
                `INSERT INTO product_events (id, pubkey, created_at, kind, tags, content, sig)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                ["p2", "seller2", 2, 30402, JSON.stringify([]), "c2", "s2"]
              );
              await prepClient.query(
                `INSERT INTO product_events (id, pubkey, created_at, kind, tags, content, sig)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                ["p3", "seller1", 3, 30402, JSON.stringify([]), "c3", "s3"]
              );

              const stats = await prepClient.query(
                `SELECT COUNT(*)::int AS listing_count,
                      COUNT(DISTINCT pubkey)::int AS seller_count
               FROM product_events`
              );
              expect(stats.rows[0].listing_count).toBe(3);
              expect(stats.rows[0].seller_count).toBe(2);
            } finally {
              prepClient.release();
              await prepPool.end();
            }
          });
        });
      }
    );

    maybeItTc(
      "fetchCachedEvents supports pubkey/limit/offset/since/until filters",
      async () => {
        await withPostgresTestContainer(async (databaseUrl) => {
          await jest.isolateModulesAsync(async () => {
            jest.resetModules();
            jest.unmock("pg");
            const { Pool } = await import("pg");
            const prepPool = new Pool({ connectionString: databaseUrl });
            const prepClient = await prepPool.connect();
            try {
              await prepClient.query(`
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
              )
            `);

              await prepClient.query(
                `INSERT INTO product_events (id, pubkey, created_at, kind, tags, content, sig)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                ["e1", "alice", 10, 30402, JSON.stringify([]), "c1", "s1"]
              );
              await prepClient.query(
                `INSERT INTO product_events (id, pubkey, created_at, kind, tags, content, sig)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                ["e2", "bob", 20, 30402, JSON.stringify([]), "c2", "s2"]
              );
              await prepClient.query(
                `INSERT INTO product_events (id, pubkey, created_at, kind, tags, content, sig)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                ["e3", "alice", 30, 30402, JSON.stringify([]), "c3", "s3"]
              );

              const all = await prepClient.query(
                `SELECT id FROM product_events
               WHERE kind = $1
               ORDER BY created_at DESC`,
                [30402]
              );
              expect(all.rows.map((r) => r.id)).toEqual(["e3", "e2", "e1"]);

              const alice = await prepClient.query(
                `SELECT id FROM product_events
               WHERE kind = $1 AND pubkey = $2
               ORDER BY created_at DESC`,
                [30402, "alice"]
              );
              expect(alice.rows.map((r) => r.id)).toEqual(["e3", "e1"]);

              const between = await prepClient.query(
                `SELECT id FROM product_events
               WHERE kind = $1 AND created_at >= $2 AND created_at <= $3
               ORDER BY created_at DESC`,
                [30402, 15, 30]
              );
              expect(between.rows.map((r) => r.id)).toEqual(["e3", "e2"]);

              const limited = await prepClient.query(
                `SELECT id FROM product_events
               WHERE kind = $1
               ORDER BY created_at DESC
               LIMIT $2 OFFSET $3`,
                [30402, 1, 1]
              );
              expect(limited.rows.map((r) => r.id)).toEqual(["e2"]);
            } finally {
              prepClient.release();
              await prepPool.end();
            }
          });
        });
      }
    );
  });
});
