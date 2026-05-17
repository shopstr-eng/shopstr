import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadTools } from "./tools/read-tools";
import { registerResources } from "./resources";
import { ToolContext } from "./audit-log";

export function createMcpServer(context?: ToolContext): McpServer {
  const server = new McpServer(
    {
      name: "shopstr",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  registerReadTools(server, context);
  registerResources(server);

  return server;
}
