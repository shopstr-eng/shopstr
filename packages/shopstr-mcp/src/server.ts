import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ShopstrMcpConfig } from "./config.js";

export function createMcpServer(config: ShopstrMcpConfig): McpServer {
  const server = new McpServer(
    {
      name: "shopstr-mcp",
      version: config.version,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );
  return server;
}
