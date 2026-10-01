import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { MemoryCache } from "../../dist/cache.js";
import { loadConfig } from "../../dist/config.js";
import { eventMatchesFilter } from "../../dist/relay-fetch.js";
import { createMcpServer } from "../../dist/server.js";
import { fetchSellerReviews } from "../../dist/tools/utils/seller.js";

const sellerPubkey = "b".repeat(64);
const okRelay = "wss://ok.example.com";
const recoveringRelay = "wss://recovering.example.com";

function productEvent(dTag = "coffee", id = "a") {
  return {
    id: id.repeat(64),
    pubkey: sellerPubkey,
    created_at: 100,
    kind: 30402,
    tags: [
      ["d", dTag],
      ["title", dTag],
      ["price", "10", "USD"],
    ],
    content: "",
    sig: "c".repeat(128),
  };
}

function reviewEvent(product, id = "d") {
  const address = `30402:${sellerPubkey}:${product.tags[0][1]}`;
  return {
    id: id.repeat(64),
    pubkey: "e".repeat(64),
    created_at: 110,
    kind: 31555,
    tags: [
      ["d", `a:${address}`],
      ["a", address],
      ["rating", "1", "thumb"],
    ],
    content: "Good product.",
    sig: "f".repeat(128),
  };
}

const product = productEvent();
const review = reviewEvent(product);

function relayClient(outcome) {
  const calls = [];
  return {
    calls,
    async fetchWithStatus(filters, _params, relayUrls) {
      calls.push({ filters, relay: relayUrls[0] });
      const result = outcome(filters, relayUrls[0]);
      return {
        ...result,
        events: result.events.filter((event) =>
          filters.some((filter) => eventMatchesFilter(event, filter))
        ),
      };
    },
    async close() {},
  };
}

async function mcpSession(t, nostr) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = createMcpServer(
    loadConfig({ SHOPSTR_MCP_RELAYS: `${okRelay},${recoveringRelay}` }),
    { nostr, logger: { warn() {} } }
  );
  const client = new Client({ name: "review-recovery-test", version: "0.0.0" });
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return async (name, args) => {
    const response = await client.callTool({ name, arguments: args });
    return { response, body: JSON.parse(response.content[0].text) };
  };
}

function productLookupFailure(mode) {
  if (mode === "timeout") return { events: [], complete: false };
  throw new Error("Product lookup connection failed");
}

for (const mode of ["failure", "timeout"]) {
  test(`MCP get_reviews retries unresolved productId after ${mode}`, async (t) => {
    let recovered = false;
    const nostr = relayClient((filters, relay) => {
      if (relay === okRelay) return { events: [], complete: true };
      if (
        !recovered &&
        filters.some((filter) => filter.kinds.includes(30402))
      ) {
        return productLookupFailure(mode);
      }
      return { events: [product, review], complete: true };
    });
    const call = await mcpSession(t, nostr);
    const first = await call("get_reviews", { productId: product.id });
    assert.equal(first.body.count, 0);
    assert.equal(first.body._meta.notFound, true);
    assert.equal(first.body._meta.retryable, true);
    assert.equal(first.body._meta.retryAfterMs, 2_000);
    assert.equal(first.response._meta.retryable, true);
    assert.equal(first.body._meta.degraded, true);
    assert.ok(first.body._meta._hints[0].includes(recoveringRelay));
    const list = mode === "timeout" ? "relaysIncomplete" : "relaysFailed";
    assert.equal(first.body._meta[list].length, 1);

    recovered = true;
    const retry = await call("get_reviews", { productId: product.id });
    assert.equal(retry.body.count, 1);
    assert.equal(retry.body.reviews[0].id, review.id);
    assert.equal(retry.body._meta.degraded, false);
    assert.equal(retry.body._meta.notFound, undefined);
  });

  for (const [name, count] of [
    ["get_reviews", (body) => body.count],
    ["get_company_details", (body) => body.reviews.count],
    ["get_seller_reputation", (body) => body.reviewCount],
  ]) {
    test(`MCP ${name} refreshes incomplete address coverage after ${mode}`, async (t) => {
      let recovered = false;
      const nostr = relayClient((filters, relay) => {
        if (relay === okRelay) return { events: [], complete: true };
        if (
          !recovered &&
          filters.some((filter) => filter.kinds.includes(30402))
        ) {
          return productLookupFailure(mode);
        }
        return { events: [product, review], complete: true };
      });
      const call = await mcpSession(t, nostr);
      const first = await call(name, { sellerPubkey });
      assert.equal(first.body.retryable ?? first.body._meta.retryable, true);
      assert.equal(first.body._meta.degraded, true);
      const beforeRetry = nostr.calls.length;

      recovered = true;
      const retry = await call(name, { sellerPubkey });
      assert.notEqual(retry.response.isError, true);
      assert.equal(count(retry.body), 1);
      assert.equal(retry.body._meta.degraded, false);
      assert.equal(retry.body._meta.cached.reviews, false);
      assert.equal(
        nostr.calls
          .slice(beforeRetry)
          .filter(({ filters }) =>
            filters.some((filter) => filter.kinds.includes(31555))
          ).length,
        2
      );

      const beforeCachedCall = nostr.calls.length;
      const cached = await call(name, { sellerPubkey });
      assert.equal(count(cached.body), 1);
      assert.equal(cached.body._meta.cached.reviews, true);
      assert.equal(
        nostr.calls
          .slice(beforeCachedCall)
          .some(({ filters }) =>
            filters.some((filter) => filter.kinds.includes(31555))
          ),
        false
      );
    });
  }
}

test("MCP get_reviews keeps healthy unresolved productId misses non-retryable", async (t) => {
  const call = await mcpSession(
    t,
    relayClient(() => ({ events: [], complete: true }))
  );
  const { body } = await call("get_reviews", { productId: product.id });
  assert.equal(body.count, 0);
  assert.equal(body._meta.retryable, false);
  assert.equal(body._meta.degraded, false);
});

test("MCP get_reviews uses complete review coverage once the address is resolved", async (t) => {
  const nostr = relayClient((filters, relay) => {
    if (filters.some((filter) => filter.kinds.includes(30402))) {
      if (relay === recoveringRelay)
        throw new Error("Product lookup connection failed");
      return { events: [product], complete: true };
    }
    return { events: [], complete: true };
  });
  const call = await mcpSession(t, nostr);
  const { body } = await call("get_reviews", { productId: product.id });
  assert.equal(body.count, 0);
  assert.equal(body._meta.retryable, false);
  assert.equal(body._meta.degraded, false);
});

test("seller review cache refreshes nonempty results when the address set expands", async () => {
  const otherProduct = productEvent("tea", "1");
  const otherReview = reviewEvent(otherProduct, "2");
  const nostr = relayClient(() => ({
    events: [review, otherReview],
    complete: true,
  }));
  const context = {
    nostr,
    relays: [okRelay],
    timeoutMs: 100,
    cache: new MemoryCache(60_000),
  };
  const first = await fetchSellerReviews(sellerPubkey, [product], context);
  assert.equal(first.reviews.length, 1);
  const expanded = await fetchSellerReviews(
    sellerPubkey,
    [product, otherProduct],
    context
  );
  assert.equal(expanded.reviews.length, 2);
  assert.equal(expanded.cache.reviews, false);
  const reordered = await fetchSellerReviews(
    sellerPubkey,
    [otherProduct, product],
    context
  );
  assert.equal(reordered.reviews.length, 2);
  assert.equal(reordered.cache.reviews, true);
  assert.equal(nostr.calls.length, 2);
});
