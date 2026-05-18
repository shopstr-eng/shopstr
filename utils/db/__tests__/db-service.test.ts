import {
  getTableForKind,
  shouldKeepOnlyLatest,
  isReviewEvent,
  buildReviewDTagFilter,
  profileNameToSlug,
  cacheEvents,
  cacheEvent,
  getDbPool,
} from "../db-service";

describe("db-service helpers", () => {
  test("getTableForKind maps known kinds and returns null for unknown", () => {
    expect(getTableForKind(30402)).toBe("product_events");
    expect(getTableForKind(31555)).toBe("review_events");
    expect(getTableForKind(1059)).toBe("message_events");
    expect(getTableForKind(0)).toBe("profile_events");
    expect(getTableForKind(999999)).toBeNull();
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
    const spy = jest.spyOn({ getDbPool }, "getDbPool");
    // call with empty array
    await cacheEvents([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("cacheEvent returns early for unknown kind (no DB calls)", async () => {
    const spy = jest.spyOn({ getDbPool }, "getDbPool");
    await cacheEvent({
      id: "e1",
      pubkey: "p1",
      created_at: Date.now(),
      kind: 999999,
      tags: [],
      content: "x",
      sig: "s",
    } as any);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
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
    });
  });
});
