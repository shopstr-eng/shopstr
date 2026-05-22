import assert from "node:assert/strict";
import test from "node:test";

import { fetchFromRelays } from "../dist/relay-fetch.js";

const hex = (char) => char.repeat(64);

function event(idChar) {
  return {
    id: hex(idChar),
    pubkey: hex("b"),
    created_at: 1,
    kind: 30402,
    tags: [["d", `product-${idChar}`]],
    content: "",
    sig: "c".repeat(128),
  };
}

test("fetches each relay in parallel and returns degradation metadata", async () => {
  const client = {
    async fetch(_filters, _params, relayUrls) {
      const relay = relayUrls[0];
      if (relay === "wss://bad.example.com") {
        throw new Error("relay down");
      }
      return [event("a")];
    },
  };

  const result = await fetchFromRelays(
    client,
    ["wss://good.example.com", "wss://bad.example.com"],
    [{ kinds: [30402] }],
    { timeoutMs: 100 }
  );

  assert.equal(result.events.length, 1);
  assert.deepEqual(result.meta.relaysSucceeded, ["wss://good.example.com"]);
  assert.equal(result.meta.relaysFailed.length, 1);
  assert.equal(result.meta.degraded, true);
  assert.equal(result.meta.coverage, 0.5);
});
