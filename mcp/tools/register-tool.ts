import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolCb, ToolContext, wrapWithAudit } from "../audit-log";

export function registerTool(
  server: McpServer,
  name: string,
  description: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: Record<string, any>,
  cb: ToolCb,
  context?: ToolContext
) {
  return server.registerTool(
    name,
    {
      description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: inputSchema as any,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wrapWithAudit(name, cb, context) as any
  );
}
