import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolContext, wrapWithAudit } from "../audit-log";

export function registerTool(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: any,
  cb: (args: any, extra: any) => any,
  context?: ToolContext
) {
  return server.registerTool(
    name,
    {
      description,
      inputSchema: inputSchema as any,
    },
    wrapWithAudit(name, cb, context) as any
  );
}
