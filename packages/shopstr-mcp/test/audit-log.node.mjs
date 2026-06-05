import assert from "node:assert/strict";
import test from "node:test";

import {
  logAuditEntry,
  sanitizeParams,
  wrapWithAudit,
} from "../dist/audit-log.js";
import {
  MCP_ERROR_CODES,
  createErrorResponse,
  createSuccessResponse,
} from "../dist/errors.js";

test("redacts all sensitive key patterns", () => {
  const sensitiveKeys = [
    "nsec",
    "nsec1abc",
    "NSEC",
    "password",
    "Password",
    "secret",
    "clientSecret",
    "token",
    "accessToken",
    "apiKey",
    "api_key",
    "api-key",
    "authorization",
    "Authorization",
    "privateKey",
    "private",
    "seed",
    "walletSeed",
    "mnemonic",
    "content",
    "Content",
    "address",
    "shippingAddress",
    "invoice",
    "lightningInvoice",
    "bolt11",
    "file",
    "filePath",
    "base64",
    "imageBase64",
    "tracking",
    "trackingNumber",
  ];

  const input = Object.fromEntries(sensitiveKeys.map((k) => [k, "value"]));
  const sanitized = sanitizeParams(input);

  for (const key of sensitiveKeys) {
    assert.equal(
      sanitized[key],
      "[REDACTED]",
      `Expected "${key}" to be redacted`
    );
  }
});

test("passes through non-sensitive keys unchanged", () => {
  const sanitized = sanitizeParams({
    pubkey: "abc",
    limit: 50,
    enabled: true,
    nothing: null,
  });

  assert.equal(sanitized.pubkey, "abc");
  assert.equal(sanitized.limit, 50);
  assert.equal(sanitized.enabled, true);
  assert.equal(sanitized.nothing, null);
});

test("truncates strings at exactly 200 characters", () => {
  const exactly200 = "a".repeat(200);
  const over200 = "b".repeat(201);

  const sanitized = sanitizeParams({ short: exactly200, long: over200 });

  assert.equal(sanitized.short, exactly200);
  assert.equal(sanitized.long, "b".repeat(200) + "...[truncated]");
});

test("enforces depth limit at 4 levels of nesting", () => {
  const deep = { a: { b: { c: { d: { e: "too deep" } } } } };
  const sanitized = sanitizeParams(deep);

  assert.deepEqual(sanitized.a.b.c.d, { _depth_limit: true });
});

test("sanitizes objects inside arrays", () => {
  const sanitized = sanitizeParams({
    items: [{ token: "secret", name: "ok" }, { password: "hidden" }],
  });

  assert.deepEqual(sanitized.items, [
    { token: "[REDACTED]", name: "ok" },
    { password: "[REDACTED]" },
  ]);
});

test("truncates strings inside arrays", () => {
  const longStr = "x".repeat(250);
  const sanitized = sanitizeParams({ tags: [longStr, "short"] });

  assert.match(sanitized.tags[0], /\[truncated\]$/);
  assert.equal(sanitized.tags[1], "short");
});

test("sanitizes nested arrays recursively", () => {
  const sanitized = sanitizeParams({
    nested: [[{ authorization: "secret", visible: "ok" }], ["y".repeat(250)]],
  });

  assert.deepEqual(sanitized.nested[0][0], {
    authorization: "[REDACTED]",
    visible: "ok",
  });
  assert.match(sanitized.nested[1][0], /\[truncated\]$/);
});

test("writes audit log entries as JSON-lines", () => {
  const lines = [];
  logAuditEntry(
    {
      timestamp: "2026-01-01T00:00:00.000Z",
      toolName: "search_products",
      inputSummary: {},
      durationMs: 10,
      success: true,
      resultCount: 2,
    },
    (line) => lines.push(line)
  );

  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.level, "audit");
  assert.equal(parsed.toolName, "search_products");
});

test("wraps handlers and emits audit metadata", async () => {
  const lines = [];
  const handler = wrapWithAudit(
    "search_products",
    async () =>
      createSuccessResponse(
        { products: [] },
        { relaysQueried: ["wss://relay"] },
        3
      ),
    (line) => lines.push(line)
  );

  const result = await handler({ token: "secret" }, {});
  const audit = JSON.parse(lines[0]);

  assert.equal(result.resultCount, 3);
  assert.equal(audit.success, true);
  assert.equal(audit.inputSummary.token, "[REDACTED]");
  assert.deepEqual(audit.relaysQueried, ["wss://relay"]);
});

test("captures error metadata from MCP response meta", async () => {
  const lines = [];
  const handler = wrapWithAudit(
    "get_product_details",
    async () =>
      createErrorResponse(
        "Relay timed out",
        MCP_ERROR_CODES.RELAY_TIMEOUT,
        true,
        2000,
        { relaysQueried: ["wss://relay"] }
      ),
    (line) => lines.push(line)
  );

  await handler({}, {});
  const audit = JSON.parse(lines[0]);

  assert.equal(audit.success, false);
  assert.equal(audit.errorCode, "RELAY_TIMEOUT");
  assert.deepEqual(audit.relaysQueried, ["wss://relay"]);
});
