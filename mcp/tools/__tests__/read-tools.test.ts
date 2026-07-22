import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDbPool } from "@/utils/db/db-service";
import { registerReadTools } from "@/mcp/tools/read-tools";

jest.mock("@/utils/db/db-service", () => ({
  getDbPool: jest.fn(),
}));

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

type ToolCallback = (
  args: Record<string, unknown>,
  extra?: unknown
) => Promise<ToolResult>;

type DbEventRow = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][] | string;
  content: string;
  sig: string;
};

const TEST_PUBKEY = "a".repeat(64);

function registerToolsForTest() {
  const callbacks = new Map<string, ToolCallback>();
  const server = {
    registerTool: jest.fn(
      (name: string, _options: unknown, callback: ToolCallback) => {
        callbacks.set(name, callback);
      }
    ),
  };
  registerReadTools(server as unknown as McpServer);
  return callbacks;
}

function getTool(callbacks: Map<string, ToolCallback>, name: string) {
  const tool = callbacks.get(name);
  if (!tool) throw new Error(`Tool "${name}" was not registered`);
  return tool;
}

function textPayload(result: ToolResult) {
  return JSON.parse(result.content[0]!.text);
}

function mockDbPool(
  queryImpl: (
    sql: string,
    params?: unknown[]
  ) => { rows: unknown[] } | Promise<{ rows: unknown[] }>
) {
  const query = jest.fn().mockImplementation(queryImpl);
  const release = jest.fn();
  const connect = jest.fn().mockResolvedValue({ query, release });
  jest.mocked(getDbPool).mockReturnValue({ connect } as any);
  return { query, release, connect };
}

function makeProductRow(overrides: Partial<DbEventRow> = {}): DbEventRow {
  return {
    id: "product-1",
    pubkey: TEST_PUBKEY,
    created_at: 1_700_000_000,
    kind: 30402,
    tags: [],
    content: "",
    sig: "sig",
    ...overrides,
  };
}

let auditLogSpy: jest.SpyInstance;

beforeAll(() => {
  // wrapWithAudit logs a structured audit entry via console.error on every
  // call — real production behavior we want exercised, but noisy here.
  auditLogSpy = jest
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
});

afterAll(() => {
  auditLogSpy.mockRestore();
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("registerReadTools — harness sanity", () => {
  function getCallback() {
    return getTool(registerToolsForTest(), "search_products");
  }

  it("returns an empty result set when there are no product rows", async () => {
    mockDbPool(() => ({ rows: [] }));
    const tool = getCallback();

    const result = await tool({});

    const payload = textPayload(result);
    expect(result.isError).toBeUndefined();
    expect(payload).toMatchObject({ count: 0, products: [] });
    expect(payload._meta).toMatchObject({
      dataSource: "cached_db",
      dataFreshness: null,
      resultCount: 0,
    });
  });

  it("returns DB_ERROR (not a silent empty result) when the product query rejects", async () => {
    const { release } = mockDbPool(() => {
      throw new Error("database offline");
    });
    const tool = getCallback();

    const result = await tool({});

    const payload = textPayload(result);
    expect(result.isError).toBe(true);
    expect(payload).toMatchObject({
      error: "DB fetch failed",
      code: "DB_ERROR",
      _meta: { dataSource: "cached_db" },
    });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("releases the client even when the query rejects", async () => {
    const { release } = mockDbPool(() => {
      throw new Error("database offline");
    });
    const tool = getCallback();

    await tool({});

    expect(release).toHaveBeenCalledTimes(1);
  });

  it("parses a single product row into the expected response shape", async () => {
    mockDbPool(() => ({
      rows: [
        makeProductRow({
          tags: [
            ["title", "Raw Milk"],
            ["summary", "Fresh from the farm"],
            ["price", "10", "USD"],
          ],
        }),
      ],
    }));
    const tool = getCallback();

    const result = await tool({});

    const payload = textPayload(result);
    expect(payload.count).toBe(1);
    expect(payload.products[0]).toMatchObject({
      id: "product-1",
      title: "Raw Milk",
      summary: "Fresh from the farm",
      price: 10,
      currency: "USD",
    });
    expect(payload._meta.dataFreshness).toBe(
      new Date(1_700_000_000 * 1000).toISOString()
    );
  });

  it("normalizeTags parses a JSON-string tags column the same as a real array (as pg returns for jsonb)", async () => {
    mockDbPool(() => ({
      rows: [makeProductRow({ tags: JSON.stringify([["title", "Raw Milk"]]) })],
    }));
    const tool = getCallback();

    const result = await tool({});

    expect(textPayload(result).products[0].title).toBe("Raw Milk");
  });

  it("normalizeTags falls back to an empty tags array on malformed JSON, rather than throwing", async () => {
    mockDbPool(() => ({
      rows: [makeProductRow({ tags: "{not valid json" })],
    }));
    const tool = getCallback();

    const result = await tool({});

    expect(textPayload(result).products[0].title).toBe("");
  });
});
