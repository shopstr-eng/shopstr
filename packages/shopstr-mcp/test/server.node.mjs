import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { loadConfig } from "../dist/config.js";
import { createMcpServer } from "../dist/server.js";

test("exposes valid empty MCP discovery handlers for the setup package", async () => {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "shopstr-mcp-test", version: "0.0.0" });
  const server = createMcpServer(loadConfig({}));

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const capabilities = client.getServerCapabilities();
    assert.ok(capabilities?.tools);
    assert.ok(capabilities?.resources);
    assert.ok(capabilities?.prompts);

    assert.deepEqual(await client.listTools(), { tools: [] });
    assert.deepEqual(await client.listResources(), { resources: [] });
    assert.deepEqual(await client.listPrompts(), { prompts: [] });
  } finally {
    await client.close();
  }
});
