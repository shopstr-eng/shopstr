/**
 * Live smoke test — calls real Nostr relays.
 * Run:  node packages/shopstr-mcp/test/smoke-live.mjs
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadConfig } from "../dist/config.js";
import { createMcpServer } from "../dist/server.js";

const config = loadConfig({
  SHOPSTR_MCP_RELAYS:
    "wss://nos.lol,wss://relay.damus.io,wss://relay.nostr.band",
  SHOPSTR_MCP_TOOL_TIMEOUT_MS: "15000",
});

const server = createMcpServer(config);
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "smoke-test", version: "0.0.1" });

await server.connect(serverTransport);
await client.connect(clientTransport);

console.log("=== Tools registered ===");
const tools = await client.listTools();
console.log(tools.tools.map((t) => t.name));

// 1. search_products
console.log("\n=== search_products (keyword: shirt) ===");
const searchResult = await client.callTool({
  name: "search_products",
  arguments: { keyword: "shirt", limit: 3 },
});
const searchBody = JSON.parse(searchResult.content[0].text);
console.log(`Found ${searchBody.count} of ${searchBody.totalMatches} matches`);
console.log("Relay meta:", {
  degraded: searchBody._meta?.degraded,
  coverage: searchBody._meta?.coverage,
  succeeded: searchBody._meta?.relaysSucceeded,
  failed: searchBody._meta?.relaysFailed?.map((f) => f.url),
});
if (searchBody.products?.length > 0) {
  const p = searchBody.products[0];
  console.log("First product:", {
    id: p.id?.slice(0, 12) + "...",
    title: p.title,
    price: p.price,
    currency: p.currency,
    priceStatus: p.priceStatus,
  });

  // 2. get_product_details using the first product's ID
  console.log("\n=== get_product_details ===");
  const detailResult = await client.callTool({
    name: "get_product_details",
    arguments: { productId: p.id },
  });
  const detailBody = JSON.parse(detailResult.content[0].text);
  if (detailBody.product) {
    console.log("Product title:", detailBody.product.title);
    console.log("Categories:", detailBody.product.categories);
  } else {
    console.log("Detail response:", detailBody);
  }

  // 3. get_reviews for the seller
  console.log("\n=== get_reviews (by seller) ===");
  const reviewResult = await client.callTool({
    name: "get_reviews",
    arguments: { sellerPubkey: p.pubkey },
  });
  const reviewBody = JSON.parse(reviewResult.content[0].text);
  console.log(`Found ${reviewBody.count ?? 0} reviews`);
  if (reviewBody.reviews?.length > 0) {
    console.log("First review:", {
      ratings: reviewBody.reviews[0].ratings,
      content: reviewBody.reviews[0].content?.slice(0, 80),
    });
  }
} else {
  console.log("No products found — try a broader search.");
}

// 4. Validation error test
console.log("\n=== Validation error (price without currency) ===");
const errResult = await client.callTool({
  name: "search_products",
  arguments: { maxPrice: 50 },
});
const errBody = JSON.parse(errResult.content[0].text);
console.log("Error:", errBody.errorCode, "-", errBody.error);

await server.close();
await client.close();
console.log("\n✅ Smoke test complete");
