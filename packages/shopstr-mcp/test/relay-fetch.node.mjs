import assert from "node:assert/strict";
import test from "node:test";

import { NostrManager } from "../dist/nostr-manager.js";
import { fetchFromRelays } from "../dist/relay-fetch.js";
import { allRelaysFailed } from "../dist/tools/utils/common.js";

const hex = (char) => char.repeat(64);

function event(idChar, overrides = {}) {
  return {
    id: hex(idChar),
    pubkey: hex("b"),
    created_at: 1,
    kind: 30402,
    tags: [["d", `product-${idChar}`]],
    content: "",
    sig: "c".repeat(128),
    ...overrides,
  };
}

test("fetches each relay in parallel and returns degradation metadata", async () => {
  const client = {
    async fetchWithStatus(_filters, _params, relayUrls) {
      const relay = relayUrls[0];
      if (relay === "wss://bad.example.com") {
        throw new Error("relay down");
      }
      return { events: [event("a")], complete: true };
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
  assert.deepEqual(result.eventCountsByRelay, {
    "wss://good.example.com": 1,
    "wss://bad.example.com": 0,
  });
  assert.deepEqual(result.eventCountsByRelayAndFilter, {
    "wss://good.example.com": [1],
    "wss://bad.example.com": [0],
  });
  assert.deepEqual(result.oldestEventTimestampsByRelayAndFilter, {
    "wss://good.example.com": [1],
    "wss://bad.example.com": [null],
  });
});

test("counts returned events per relay and per NIP-01 filter without treating limit as a predicate", async () => {
  const events = [
    event("a", {
      created_at: 10,
      tags: [["t", "Tools"]],
    }),
    event("d", {
      created_at: 20,
      tags: [["t", "Tools"]],
    }),
    event("e", {
      created_at: 15,
      kind: 31555,
      tags: [["p", hex("f")]],
    }),
    event("f", {
      created_at: 21,
      tags: [["t", "Tools"]],
    }),
  ];
  const filters = [
    {
      ids: [hex("a").slice(0, 8), hex("d").slice(0, 8)],
      authors: [hex("b").slice(0, 8)],
      kinds: [30402],
      since: 10,
      until: 20,
      "#t": ["Tools"],
      limit: 1,
    },
    {
      kinds: [31555],
      "#p": [hex("f")],
    },
  ];
  const relay = "wss://relay.example.com";

  const result = await fetchFromRelays(
    {
      async fetchWithStatus() {
        return { events, complete: true };
      },
    },
    [relay],
    filters,
    { timeoutMs: 100 }
  );

  assert.deepEqual(result.eventCountsByRelayAndFilter, {
    [relay]: [2, 1],
  });
  assert.deepEqual(result.oldestEventTimestampsByRelayAndFilter, {
    [relay]: [20, 15],
  });
});

test("marks relay subscription close failures as degraded", async () => {
  const manager = new NostrManager([], { gcInterval: 60_000 });

  manager.pool = {
    async ensureRelay() {
      throw new Error("relay down");
    },
    subscribeMap(_requests, params) {
      queueMicrotask(() => {
        params.oneose?.();
        params.onclose?.(["relay down"]);
      });
      return { close() {} };
    },
  };

  try {
    const result = await fetchFromRelays(
      manager,
      ["wss://bad-relay.example.com"],
      [{ kinds: [30402] }],
      { timeoutMs: 100 }
    );

    assert.equal(result.events.length, 0);
    assert.deepEqual(result.meta.relaysSucceeded, []);
    assert.equal(result.meta.relaysFailed.length, 1);
    assert.equal(
      result.meta.relaysFailed[0].url,
      "wss://bad-relay.example.com"
    );
    assert.match(result.meta.relaysFailed[0].error, /relay down/);
    assert.equal(result.meta.degraded, true);
    assert.equal(result.meta.coverage, 0);
  } finally {
    await manager.close();
  }
});

test("preserves partial events while marking timed-out relays incomplete", async () => {
  const completeRelay = "wss://complete.example.com";
  const timedOutRelay = "wss://timed-out.example.com";
  const completeEvent = event("a");
  const partialEvent = event("d");
  const client = {
    async fetchWithStatus(_filters, _params, relayUrls) {
      return relayUrls[0] === completeRelay
        ? { events: [completeEvent], complete: true }
        : { events: [partialEvent], complete: false };
    },
  };

  const result = await fetchFromRelays(
    client,
    [completeRelay, timedOutRelay],
    [{ kinds: [30402] }],
    { timeoutMs: 100 }
  );

  assert.deepEqual(result.events, [completeEvent, partialEvent]);
  assert.deepEqual(result.meta.relaysSucceeded, [completeRelay]);
  assert.deepEqual(result.meta.relaysIncomplete, [timedOutRelay]);
  assert.deepEqual(result.meta.relaysFailed, []);
  assert.equal(result.meta.degraded, true);
  assert.equal(result.meta.coverage, 0.5);
  assert.equal(allRelaysFailed(result.meta), false);
});

test("treats a single empty relay timeout as unavailable", async () => {
  const relay = "wss://timed-out.example.com";
  const client = {
    async fetchWithStatus() {
      return { events: [], complete: false };
    },
  };

  const result = await fetchFromRelays(client, [relay], [{ kinds: [30402] }], {
    timeoutMs: 100,
  });

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.meta.relaysSucceeded, []);
  assert.deepEqual(result.meta.relaysIncomplete, [relay]);
  assert.deepEqual(result.meta.relaysFailed, []);
  assert.equal(result.meta.degraded, true);
  assert.equal(result.meta.coverage, 0);
  assert.equal(allRelaysFailed(result.meta), true);
});

test("treats an all-relay empty timeout as unavailable", async () => {
  const relays = [
    "wss://timed-out-one.example.com",
    "wss://timed-out-two.example.com",
  ];
  const client = {
    async fetchWithStatus() {
      return { events: [], complete: false };
    },
  };

  const result = await fetchFromRelays(client, relays, [{ kinds: [30402] }], {
    timeoutMs: 100,
  });

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.meta.relaysSucceeded, []);
  assert.deepEqual(result.meta.relaysIncomplete, relays);
  assert.deepEqual(result.meta.relaysFailed, []);
  assert.equal(result.meta.degraded, true);
  assert.equal(result.meta.coverage, 0);
  assert.equal(allRelaysFailed(result.meta), true);
});
