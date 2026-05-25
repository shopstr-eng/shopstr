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

type DbServiceModule = typeof import("../db-service");

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

describe("db-service helpers", () => {
  test("getTableForKind maps known kinds and returns null for unknown", () => {
    expect(getTableForKind(30402)).toBe("product_events");
    expect(getTableForKind(31555)).toBe("review_events");
    expect(getTableForKind(1059)).toBe("message_events");
    expect(getTableForKind(0)).toBe("profile_events");
    expect(getTableForKind(999999)).toBeNull();
  });

  const maybeItTc = process.env.RUN_TESTCONTAINERS === "1" ? test : test.skip;

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

  test("cacheEvent upserts regular events with ON CONFLICT", async () => {
    await jest.isolateModulesAsync(async () => {
      const prev = process.env.DATABASE_URL;
      process.env.DATABASE_URL = "postgres://test@localhost/testdb";

      let mod: typeof import("../db-service") | undefined;

      try {
        const queries: Array<string | { text?: string }> = [];
        const client = {
          query: jest.fn(async (q: any) => {
            queries.push(q);
            return { rows: [], rowCount: 1 };
          }),
          release: jest.fn(),
        } as any;

        const pool = {
          connect: jest.fn(async () => client),
          on: jest.fn(),
          end: jest.fn(async () => undefined),
        } as any;

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

  test("cacheEvents retries once after a synthetic deadlock and then succeeds", async () => {
    await jest.isolateModulesAsync(async () => {
      const prev = process.env.DATABASE_URL;
      process.env.DATABASE_URL = "postgres://test@localhost/testdb";

      let mod: typeof import("../db-service") | undefined;
      let insertAttempts = 0;

      try {
        const client = {
          query: jest.fn(async (q: any) => {
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
        } as any;

        const pool = {
          connect: jest.fn(async () => client),
          on: jest.fn(),
          end: jest.fn(async () => undefined),
        } as any;

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

    test("deleteCachedEvent issues DELETE for known kind and is no-op for unknown kind", async () => {
      const prev = process.env.DATABASE_URL;
      try {
        // First: known kind, ensure DELETE is issued
        await jest.isolateModulesAsync(async () => {
          process.env.DATABASE_URL = "postgres://test@localhost/testdb";

          const client = {
            query: jest.fn(async () => ({ rowCount: 1 })),
            release: jest.fn(),
          } as any;

          const pool = {
            connect: jest.fn(async () => client),
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

          const client2 = {
            query: jest.fn(async () => ({ rowCount: 1 })),
            release: jest.fn(),
          } as any;

          const pool2 = {
            connect: jest.fn(async () => client2),
            on: jest.fn(),
          } as any;

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
