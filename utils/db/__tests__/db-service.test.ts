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
    const tc = await import("testcontainers");
    const { PostgreSqlContainer } = tc as any;

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
        const init = await import("../init-db");
        const { Pool } = await import("pg");
        const prepPool = new Pool({
          connectionString: process.env.DATABASE_URL,
        });
        const client = await prepPool.connect();
        try {
          await init.ensureFailedRelayPublishesTable(client as any);
        } finally {
          client.release();
          await prepPool.end();
        }

        const db = await import("../db-service");

        const event = {
          id: `tc-${Date.now()}`,
          pubkey: "owner-tc",
          created_at: Math.floor(Date.now() / 1000),
          kind: 0,
          tags: [],
          content: "x",
          sig: "s",
        } as any;

        const inserted = await db.trackFailedRelayPublishRecord({
          eventId: event.id,
          ownerPubkey: "owner-tc",
          event,
          relays: ["tc-relay"],
        });
        expect(inserted).toBe(true);

        const rows = await db.getFailedRelayPublishesForOwner("owner-tc");
        expect(rows.length).toBeGreaterThanOrEqual(1);
        expect(rows.some((r: any) => r.eventId === event.id)).toBe(true);

        const pool = db.getDbPool();
        await pool.end();
      } finally {
        process.env.DATABASE_URL = prev;
      }
    } finally {
      await container.stop();
    }
  });

  // Integration test using pg‑mem (skipped if pg-mem not installed)
  let newDb: any;
  try {
    // require dynamically so test file doesn't hard-fail at parse time
    newDb = require("pg-mem").newDb;
  } catch {
    newDb = null;
  }

  const maybeIt = newDb ? test : test.skip;

  maybeIt(
    "ensureFailedRelayPublishesTable + track/get flow (pg-mem)",
    async () => {
      const mem = newDb();
      const { Pool: MemPool } = mem.adapters.createPg();
      const pool = new (MemPool as any)();

      // Provide a lightweight in-memory handler for the failed_relay_publishes
      // table to avoid pg-mem parsing limitations for the production DDL.
      const failedStore = new Map<string, any>();
      const originalConnect = pool.connect.bind(pool);
      pool.connect = async () => {
        const client = await originalConnect();
        return {
          query: (q: any, params?: any[]) => {
            const text = typeof q === "string" ? q : q.text || "";
            const lc = text.toLowerCase();
            // Short-circuit DDL that pg-mem can't parse reliably.
            if (
              lc.startsWith("create table") ||
              lc.includes("alter table") ||
              lc.includes(
                "delete from failed_relay_publishes\n    where owner_pubkey is null"
              )
            ) {
              return { rows: [], rowCount: 0 };
            }

            if (lc.includes("failed_relay_publishes")) {
              if (lc.includes("insert into failed_relay_publishes")) {
                const [eventId, ownerPubkey, eventData, relaysJson, createdAt] =
                  params || [];
                const existing = failedStore.get(eventId);
                if (!existing) {
                  failedStore.set(eventId, {
                    event_id: eventId,
                    owner_pubkey: ownerPubkey,
                    event_data: eventData,
                    relays: relaysJson,
                    created_at: createdAt,
                    retry_count: 0,
                  });
                  return { rows: [{ event_id: eventId }], rowCount: 1 };
                }

                // ON CONFLICT ... WHERE owner_pubkey = EXCLUDED.owner_pubkey
                if (existing.owner_pubkey === ownerPubkey) {
                  existing.event_data = eventData;
                  existing.relays = relaysJson;
                  existing.created_at = createdAt;
                  return { rows: [{ event_id: eventId }], rowCount: 1 };
                }

                return { rows: [], rowCount: 0 };
              }

              if (
                lc.startsWith("select") &&
                lc.includes("where owner_pubkey = $1")
              ) {
                const owner = params && params[0];
                const rows = Array.from(failedStore.values())
                  .filter(
                    (r) =>
                      r.owner_pubkey === owner &&
                      r.retry_count < 5 &&
                      r.event_data != null
                  )
                  .sort((a, b) => a.created_at - b.created_at)
                  .slice(0, 50)
                  .map((r) => ({
                    event_id: r.event_id,
                    event_data: r.event_data,
                    relays: r.relays,
                    retry_count: r.retry_count,
                  }));
                return { rows, rowCount: rows.length };
              }

              if (
                lc.startsWith("delete from failed_relay_publishes") &&
                lc.includes("where event_id = $1 and owner_pubkey = $2")
              ) {
                const [eventId, owner] = params || [];
                const existing = failedStore.get(eventId);
                if (existing && existing.owner_pubkey === owner) {
                  failedStore.delete(eventId);
                  return { rows: [], rowCount: 1 };
                }
                return { rows: [], rowCount: 0 };
              }

              if (
                lc.startsWith("update failed_relay_publishes") &&
                lc.includes("set retry_count = retry_count + 1")
              ) {
                const [eventId, owner] = params || [];
                const existing = failedStore.get(eventId);
                if (existing && existing.owner_pubkey === owner) {
                  existing.retry_count = (existing.retry_count || 0) + 1;
                  return { rows: [], rowCount: 1 };
                }
                return { rows: [], rowCount: 0 };
              }
            }

            return client.query(q, params);
          },
          release: client.release.bind(client),
          on: client.on && client.on.bind(client),
        } as any;
      };

      await jest.isolateModulesAsync(async () => {
        const prev = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://test@localhost/testdb";
        try {
          // Mock the init-db module to no-op the heavy DDL when running under
          // pg-mem; this avoids pg-mem AST limitations for complex CREATE/ALTER
          // statements.
          jest.doMock("../init-db", () => ({
            ensureFailedRelayPublishesTable: async () => {
              /* no-op for tests */
            },
          }));

          jest.doMock("pg", () => ({
            Pool: class {
              constructor() {
                return pool;
              }
            },
          }));

          const db = await import("../db-service");

          // pg-mem has limited DDL support; the client returned by our mocked
          // pool intercepts queries touching `failed_relay_publishes` and
          // implements a lightweight in-memory behavior, so we don't need to
          // override module functions here.

          const event = {
            id: "evt1",
            pubkey: "owner1",
            created_at: Math.floor(Date.now() / 1000),
            kind: 0,
            tags: [],
            content: "x",
            sig: "s",
          } as any;

          const inserted = await db.trackFailedRelayPublishRecord({
            eventId: "evt1",
            ownerPubkey: "owner1",
            event,
            relays: ["relay1"],
          });

          expect(inserted).toBe(true);

          const rows = await db.getFailedRelayPublishesForOwner("owner1");
          expect(rows.length).toBe(1);
          expect(rows[0].eventId).toBe("evt1");
          expect(rows[0].relays).toEqual(["relay1"]);
          expect(rows[0].event).toMatchObject({ id: "evt1" });
        } finally {
          process.env.DATABASE_URL = prev;
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
});
