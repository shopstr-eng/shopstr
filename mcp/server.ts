import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadTools } from "./tools/read-tools";
import { registerResources } from "./resources";

export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "milk-market",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  registerReadTools(server);
  registerResources(server);

  return server;
}
