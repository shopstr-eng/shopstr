import assert from "node:assert/strict";
import test from "node:test";

import { isPrivateOrLocalIp, verifyNip05Claim } from "../dist/nip05.js";

test("blocks IPv4-mapped IPv6 private NIP-05 addresses", () => {
  assert.equal(isPrivateOrLocalIp("::ffff:127.0.0.1"), true);
  assert.equal(isPrivateOrLocalIp("::ffff:10.0.0.1"), true);
});

test("verifyNip05Claim pins one resolved public address into fetchJson", async () => {
  const calls = [];
  const result = await verifyNip05Claim("alice@example.com", "f".repeat(64), {
    now: () => new Date("2024-01-01T00:00:00.000Z"),
    resolveHostname: async (hostname) => {
      calls.push(["resolve", hostname]);
      return [{ address: "93.184.216.34", family: 4 }];
    },
    fetchJson: async (url, hostname, resolvedAddress) => {
      calls.push(["fetch", url, hostname, resolvedAddress]);
      return { names: { alice: "f".repeat(64) } };
    },
  });

  assert.equal(result.verified, true);
  assert.deepEqual(calls, [
    ["resolve", "example.com"],
    [
      "fetch",
      "https://example.com/.well-known/nostr.json?name=alice",
      "example.com",
      { address: "93.184.216.34", family: 4 },
    ],
  ]);
});
