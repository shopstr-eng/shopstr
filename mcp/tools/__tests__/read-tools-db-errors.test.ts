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

describe("read tools DB error handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns DB_ERROR instead of a successful empty result when product fetch fails", async () => {
    const query = jest.fn().mockRejectedValue(new Error("database offline"));
    const release = jest.fn();
    const connect = jest.fn().mockResolvedValue({ query, release });
    jest.mocked(getDbPool).mockReturnValue({
      connect,
    } as unknown as ReturnType<typeof getDbPool>);

    const callbacks = registerToolsForTest();
    const searchProducts = callbacks.get("search_products");

    expect(searchProducts).toBeDefined();
    const result = await searchProducts!({});
    const payload = JSON.parse(result.content[0]!.text);

    expect(result.isError).toBe(true);
    expect(payload).toMatchObject({
      error: "DB fetch failed",
      code: "DB_ERROR",
      _meta: { dataSource: "cached_db" },
    });
    expect(release).toHaveBeenCalledTimes(1);
  });
});
