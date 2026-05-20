import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ShopstrMcpConfig } from "./config.js";

export function createMcpServer(config: ShopstrMcpConfig): McpServer {
  const server = new McpServer({
    name: "shopstr-mcp",
    version: config.version,
  });

  registerEmptyCapabilityHandlers(server);

  return server;
}

function registerEmptyCapabilityHandlers(server: McpServer): void {
  const placeholderTool = server.registerTool(
    "setup_placeholder_tool",
    {
      description:
        "Disabled setup placeholder used to initialize MCP tool discovery.",
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: "text",
          text: "Shopstr MCP read tools are not registered in this setup PR.",
        },
      ],
    })
  );
  placeholderTool.disable();

  const placeholderResource = server.registerResource(
    "setup-placeholder-resource",
    "shopstr://setup-placeholder",
    {
      description:
        "Disabled setup placeholder used to initialize MCP resource discovery.",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          text: "Shopstr MCP resources are not registered in this setup PR.",
        },
      ],
    })
  );
  placeholderResource.disable();

  const placeholderPrompt = server.registerPrompt(
    "setup_placeholder_prompt",
    {
      description:
        "Disabled setup placeholder used to initialize MCP prompt discovery.",
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Shopstr MCP prompts are not registered in this setup PR.",
          },
        },
      ],
    })
  );
  placeholderPrompt.disable();
}
