import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ToolCb,
  ToolContext,
  ToolInputSchema,
  wrapWithAudit,
} from "../audit-log";

export function registerTool<TSchema extends ToolInputSchema>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: TSchema,
  cb: ToolCb<TSchema>,
  context?: ToolContext
) {
  return server.registerTool(
    name,
    {
      description,
      inputSchema,
    },
    wrapWithAudit(name, cb, context) as ToolCallback<TSchema>
  );
}
