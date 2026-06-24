import assert from "node:assert/strict";
import test from "node:test";

import { createLogger } from "../dist/logger.js";

test("writes JSON log lines to the provided writer", () => {
  const lines = [];
  const logger = createLogger("info", (line) => lines.push(line));

  logger.info("Server started", { relays: 3 });

  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.level, "info");
  assert.equal(parsed.msg, "Server started");
  assert.equal(parsed.relays, 3);
  assert.match(parsed.ts, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(lines[0].endsWith("\n"), true);
});

test("filters messages below the configured log level", () => {
  const lines = [];
  const logger = createLogger("warn", (line) => lines.push(line));

  logger.info("Ignored");
  logger.warn("Included");

  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).msg, "Included");
});
