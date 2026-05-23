import assert from "node:assert/strict";
import test from "node:test";

import {
  MCP_ERROR_CODES,
  createErrorPayload,
  createErrorResponse,
  createSuccessResponse,
} from "../dist/errors.js";

test("creates structured error payloads and MCP text responses", () => {
  const payload = createErrorPayload(
    "Relay timed out",
    MCP_ERROR_CODES.RELAY_TIMEOUT,
    true,
    2000
  );
  assert.deepEqual(payload, {
    error: "Relay timed out",
    errorCode: "RELAY_TIMEOUT",
    retryable: true,
    retryAfterMs: 2000,
  });

  const response = createErrorResponse(
    "Not found",
    MCP_ERROR_CODES.NOT_FOUND,
    false
  );
  assert.equal(response.isError, true);
  assert.equal(response._meta.errorCode, "NOT_FOUND");
  assert.equal(JSON.parse(response.content[0].text).errorCode, "NOT_FOUND");
});

test("creates success responses with metadata", () => {
  const response = createSuccessResponse(
    { count: 1 },
    { relaysQueried: ["wss://relay.example.com"] },
    1
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.resultCount, 1);
  assert.deepEqual(response._meta.relaysQueried, ["wss://relay.example.com"]);
  assert.equal(body.count, 1);
  assert.deepEqual(body._meta.relaysQueried, ["wss://relay.example.com"]);
});
