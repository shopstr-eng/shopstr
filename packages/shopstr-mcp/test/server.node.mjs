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
      "get_categories",
      "get_company_details",
      "get_product_details",
      "get_reviews",
      "get_seller_reputation",
      "list_companies",
      "search_products",
    ]);
    for (const tool of tools.tools) {
      assert.match(
        tool.description,
        /unverified user-generated content/,
        `${tool.name} must identify relay text as unverified user-generated content`
      );
    }
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

test("rate limits concurrent relay-backed tool calls", async () => {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "shopstr-mcp-test", version: "0.0.0" });
  let releaseFetch;
  const fetchGate = new Promise((resolve) => {
    releaseFetch = resolve;
  });
  let fetchCount = 0;
  let auditOutput = "";
  const originalStderrWrite = process.stderr.write;
  process.stderr.write = (chunk, ...args) => {
    auditOutput += String(chunk);
    const callback = args.find((arg) => typeof arg === "function");
    callback?.();
    return true;
  };
  const server = createMcpServer(
    loadConfig({
      SHOPSTR_MCP_RELAYS: "wss://relay.example.com",
      SHOPSTR_MCP_MAX_CONCURRENT_REQUESTS: "1",
    }),
    {
      nostr: {
        async fetch() {
          fetchCount += 1;
          await fetchGate;
          return [productEvent()];
        },
        async close() {},
      },
      logger: {
        warn() {},
      },
    }
  );

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const firstCall = client.callTool({
      name: "search_products",
      arguments: {},
    });
    const secondResult = await client.callTool({
      name: "search_products",
      arguments: {},
    });
    releaseFetch();
    const firstResult = await firstCall;
    const secondBody = JSON.parse(secondResult.content[0].text);

    assert.equal(JSON.parse(firstResult.content[0].text).count, 1);
    assert.equal(secondResult.isError, true);
    assert.equal(secondBody.errorCode, "RATE_LIMITED");
    assert.equal(fetchCount, 1);
    const auditEntries = auditOutput
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter(
        (entry) =>
          entry.level === "audit" && entry.toolName === "search_products"
      );
    assert.equal(auditEntries.length, 2);
    assert.equal(
      auditEntries.some(
        (entry) => entry.success === false && entry.errorCode === "RATE_LIMITED"
      ),
      true
    );
  } finally {
    process.stderr.write = originalStderrWrite;
    releaseFetch?.();
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
