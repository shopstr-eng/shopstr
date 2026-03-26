import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerTool(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: any,
  cb: (args: any, extra: any) => any
) {
  return server.registerTool(
    name,
    {
      description,
      inputSchema: inputSchema as any,
    },
    cb as any
  );
}
