import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { loadConfig } from "../dist/config.js";
import { createMcpServer } from "../dist/server.js";

const hex = (char) => char.repeat(64);

function productEvent() {
  return {
    id: hex("a"),
    pubkey: hex("b"),
    created_at: 100,
    kind: 30402,
    tags: [
      ["d", "shirt"],
      ["title", "Linen Shirt"],
      ["summary", "A nice shirt"],
      ["price", "10", "USD"],
    ],
    content: "",
    sig: "c".repeat(128),
  };
}

test("registers and calls PR4 read tools", async () => {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "shopstr-mcp-test", version: "0.0.0" });
  let closeCount = 0;
  const server = createMcpServer(
    loadConfig({ SHOPSTR_MCP_RELAYS: "wss://relay.example.com" }),
    {
      nostr: {
        async fetch() {
          return [productEvent()];
        },
        async close() {
          closeCount += 1;
        },
      },
      logger: {
        warn() {},
      },
    }
  );

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const capabilities = client.getServerCapabilities();
    assert.ok(capabilities?.tools);
    assert.ok(capabilities?.resources);
    assert.ok(capabilities?.prompts);

    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      "get_company_details",
      "get_product_details",
      "get_reviews",
      "get_seller_reputation",
      "get_storefront",
      "list_companies",
      "search_products",
    ]);
    assert.deepEqual(await client.listResources(), { resources: [] });
    assert.deepEqual(await client.listPrompts(), { prompts: [] });

    const result = await client.callTool({
      name: "search_products",
      arguments: { keyword: "shirt" },
    });
    const body = JSON.parse(result.content[0].text);

    assert.equal(body.count, 1);
    assert.equal(body.products[0].title, "Linen Shirt");

    await server.close();
    assert.equal(closeCount, 1);
  } finally {
    await client.close();
    await server.close();
    if (typeof clientTransport.close === "function") {
      await clientTransport.close();
    } else if (typeof clientTransport.dispose === "function") {
      await clientTransport.dispose();
    }
    if (typeof serverTransport.close === "function") {
      await serverTransport.close();
    } else if (typeof serverTransport.dispose === "function") {
      await serverTransport.dispose();
    }
  }
});
