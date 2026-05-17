const createContactListEvent = (overrides: Partial<any> = {}) => ({
  id: "b".repeat(64),
  pubkey: "a".repeat(64),
  created_at: 100,
  kind: 3,
  tags: [["p", "c".repeat(64)]],
  content: "",
  sig: "sig",
  ...overrides,
});

const getQueryText = (query: unknown): string =>
  typeof query === "string" ? query : ((query as { text?: string }).text ?? "");

async function loadDbServiceWithRows(rows: any[]) {
  jest.resetModules();
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/shopstr_test";

  const queryMock = jest.fn(async (query: unknown, _params?: unknown[]) => {
    const text = getQueryText(query);

    if (
      text.includes("FROM contact_list_events") &&
      text.includes("FOR UPDATE")
    ) {
      return {
        rows,
        rowCount: rows.length,
      };
    }

    return {
      rows: [],
      rowCount: 0,
    };
  });

  const releaseMock = jest.fn();
  const connectMock = jest.fn().mockResolvedValue({
    query: queryMock,
    release: releaseMock,
  });
  const PoolMock = jest.fn(() => ({
    connect: connectMock,
    on: jest.fn(),
  }));

  jest.doMock("pg", () => ({
    __esModule: true,
    Pool: PoolMock,
  }));

  const dbService = await import("../db/db-service");
  return { dbService, queryMock };
}

describe("db-service replaceable event caching", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("keeps the newer cached contact list when an older event arrives later", async () => {
    const storedEvent = createContactListEvent({
      id: "1".repeat(64),
      created_at: 200,
    });
    const incomingEvent = createContactListEvent({
      id: "2".repeat(64),
      created_at: 100,
    });

    const { dbService, queryMock } = await loadDbServiceWithRows([storedEvent]);

    await dbService.cacheEvent(incomingEvent);

    const deleteCall = queryMock.mock.calls.find(([query]) =>
      getQueryText(query).includes(
        "DELETE FROM contact_list_events WHERE pubkey = $1 AND kind = $2 AND id != $3"
      )
    );
    const insertCalls = queryMock.mock.calls.filter(([query]) =>
      getQueryText(query).includes("INSERT INTO contact_list_events")
    );

    expect(deleteCall?.[1]).toEqual([
      incomingEvent.pubkey,
      incomingEvent.kind,
      storedEvent.id,
    ]);
    expect(insertCalls).toHaveLength(0);
  });

  it("replaces a tied contact list only when the incoming event id is lower", async () => {
    const storedEvent = createContactListEvent({
      id: "f".repeat(64),
      created_at: 200,
    });
    const incomingEvent = createContactListEvent({
      id: "0".repeat(64),
      created_at: 200,
    });

    const { dbService, queryMock } = await loadDbServiceWithRows([storedEvent]);

    await dbService.cacheEvent(incomingEvent);

    const deleteCall = queryMock.mock.calls.find(([query]) =>
      getQueryText(query).includes(
        "DELETE FROM contact_list_events WHERE pubkey = $1 AND kind = $2 AND id != $3"
      )
    );
    const insertCall = queryMock.mock.calls.find(([query]) =>
      getQueryText(query).includes("INSERT INTO contact_list_events")
    );

    expect(deleteCall?.[1]).toEqual([
      incomingEvent.pubkey,
      incomingEvent.kind,
      incomingEvent.id,
    ]);
    expect((insertCall?.[0] as { values?: unknown[] })?.values).toEqual([
      incomingEvent.id,
      incomingEvent.pubkey,
      incomingEvent.created_at,
      incomingEvent.kind,
      JSON.stringify(incomingEvent.tags),
      incomingEvent.content,
      incomingEvent.sig,
    ]);
  });

  it("orders cached contact lists by created_at desc and id asc", async () => {
    const { dbService, queryMock } = await loadDbServiceWithRows([]);

    await dbService.fetchCachedEvents(3, {
      pubkey: "a".repeat(64),
      limit: 1,
    });

    const fetchCall = queryMock.mock.calls.find(([query]) =>
      getQueryText(query).includes(
        "SELECT id, pubkey, created_at, kind, tags, content, sig FROM contact_list_events WHERE kind = $1"
      )
    );

    expect(getQueryText(fetchCall?.[0])).toContain(
      "ORDER BY created_at DESC, id ASC"
    );
  });
});
