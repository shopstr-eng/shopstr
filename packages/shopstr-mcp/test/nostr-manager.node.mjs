import assert from "node:assert/strict";
import test from "node:test";

import { NostrManager } from "../dist/nostr-manager.js";

test("gc timer does not keep the Node.js process alive", async () => {
  const manager = new NostrManager([], { gcInterval: 60_000 });

  try {
    assert.equal(manager.gcTimeout.hasRef(), false);
  } finally {
    await manager.close();
  }
});

test("relay reconnect refreshes the underlying relay handle", async () => {
  const manager = new NostrManager([], { gcInterval: 60_000 });
  const handles = [];

  manager.pool = {
    async ensureRelay() {
      const handle = {
        closed: false,
        close() {
          this.closed = true;
        },
      };
      handles.push(handle);
      return handle;
    },
  };

  manager.addRelay("wss://relay.example.com");
  const relay = manager.relays[0];

  assert.equal(handles.length, 1);

  await relay.disconnect();
  assert.equal(handles[0].closed, true);

  await relay.connect();
  assert.equal(handles.length, 2);
  assert.equal(handles[1].closed, false);

  await manager.close();
});

test("addRelay handles rejected ensureRelay promises", async () => {
  const manager = new NostrManager([], { gcInterval: 60_000 });
  const unhandledReasons = [];
  const relayError = new Error("relay down");
  const onUnhandledRejection = (reason) => {
    unhandledReasons.push(reason);
  };

  manager.pool = {
    async ensureRelay() {
      throw relayError;
    },
  };

  process.on("unhandledRejection", onUnhandledRejection);
  try {
    manager.addRelay("wss://bad-relay.example.com");
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(unhandledReasons, []);
    await assert.rejects(manager.relays[0].connect(), /relay down/);
    await assert.doesNotReject(manager.relays[0].disconnect());
  } finally {
    process.removeListener("unhandledRejection", onUnhandledRejection);
    await manager.close();
  }
});

test("keepAlive logs relay connection failures", async () => {
  const warnings = [];
  const manager = new NostrManager([], {
    gcInterval: 60_000,
    logger: {
      warn(message, data) {
        warnings.push({ message, data });
      },
    },
  });
  clearTimeout(manager.gcTimeout);

  const relay = {
    url: "wss://bad-relay.example.com",
    async connect() {
      throw new Error("connect failed");
    },
    async disconnect() {},
    activeSubs: [],
    sleeping: true,
    lastActive: 0,
  };

  try {
    await manager.keepAlive([relay]);

    assert.equal(relay.sleeping, true);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "Relay keep-alive failed");
    assert.deepEqual(warnings[0].data, {
      relay: "wss://bad-relay.example.com",
      error: "connect failed",
    });
  } finally {
    await manager.close();
  }
});

test("gc continues after a relay disconnect failure", async () => {
  const warnings = [];
  const manager = new NostrManager([], {
    gcInterval: 60_000,
    keepAliveTime: 0,
    logger: {
      warn(message, data) {
        warnings.push({ message, data });
      },
    },
  });
  clearTimeout(manager.gcTimeout);
  let secondRelayDisconnected = false;

  manager.relays.push(
    {
      url: "wss://bad-relay.example.com",
      async connect() {},
      async disconnect() {
        throw new Error("already closed");
      },
      activeSubs: [],
      sleeping: false,
      lastActive: 0,
    },
    {
      url: "wss://good-relay.example.com",
      async connect() {},
      async disconnect() {
        secondRelayDisconnected = true;
      },
      activeSubs: [],
      sleeping: false,
      lastActive: 0,
    }
  );

  try {
    await manager.gc();

    assert.equal(secondRelayDisconnected, true);
    assert.equal(manager.relays[0].sleeping, true);
    assert.equal(manager.relays[1].sleeping, true);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "Relay GC disconnect failed");
    assert.deepEqual(warnings[0].data, {
      relay: "wss://bad-relay.example.com",
      error: "already closed",
    });
  } finally {
    await manager.close();
  }
});
