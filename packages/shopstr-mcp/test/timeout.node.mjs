import assert from "node:assert/strict";
import test from "node:test";

import { TimeoutError, withTimeout } from "../dist/timeout.js";

test("resolves when the operation completes before timeout", async () => {
  await assert.doesNotReject(withTimeout(Promise.resolve("ok"), 50, "fast"));
});

test("rejects with TimeoutError when the operation exceeds timeout", async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 5, "slow"),
    (error) => error instanceof TimeoutError && error.timeoutMs === 5
  );
});
