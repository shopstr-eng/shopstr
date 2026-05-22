import assert from "node:assert/strict";
import test from "node:test";

import { NostrManager } from "../dist/nostr-manager.js";

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
