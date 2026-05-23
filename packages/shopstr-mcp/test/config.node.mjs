import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_RELAYS,
  DEFAULT_TOOL_TIMEOUT_MS,
  loadConfig,
  parseLogLevel,
  parsePositiveInteger,
  parseRelayList,
  validateRelayUrl,
} from "../dist/config.js";

const packageVersion = process.env.npm_package_version;

test("validates relay URLs without credentials", () => {
  assert.equal(validateRelayUrl("wss://relay.example.com"), true);
  assert.equal(validateRelayUrl("ws://localhost:7777"), true);
  assert.equal(validateRelayUrl("https://relay.example.com"), false);
  assert.equal(validateRelayUrl("wss://user:pass@relay.example.com"), false);
  assert.equal(validateRelayUrl("not-a-url"), false);
});

test("parses relay lists with trimming, dedupe, and defaults", () => {
  assert.deepEqual(parseRelayList(), [...DEFAULT_RELAYS]);
  assert.deepEqual(
    parseRelayList(
      " wss://relay.example.com,invalid,wss://relay.example.com,ws://localhost "
    ),
    ["wss://relay.example.com", "ws://localhost"]
  );
  assert.deepEqual(parseRelayList("invalid"), [...DEFAULT_RELAYS]);
});

test("parses log levels and positive integers with safe fallbacks", () => {
  assert.equal(parseLogLevel("debug"), "debug");
  assert.equal(parseLogLevel("trace"), "info");
  assert.equal(parsePositiveInteger("2500", DEFAULT_TOOL_TIMEOUT_MS), 2500);
  assert.equal(parsePositiveInteger("0", DEFAULT_TOOL_TIMEOUT_MS), 10000);
  assert.equal(parsePositiveInteger("abc", DEFAULT_TOOL_TIMEOUT_MS), 10000);
});

test("loads config from environment overrides", () => {
  const config = loadConfig({
    SHOPSTR_MCP_RELAYS: "wss://relay.example.com",
    SHOPSTR_MCP_LOG_LEVEL: "warn",
    SHOPSTR_MCP_TOOL_TIMEOUT_MS: "1500",
    SHOPSTR_MCP_RELAY_CONNECT_TIMEOUT_MS: "2500",
    SHOPSTR_MCP_RESOURCE_CACHE_TTL_MS: "3000",
  });

  assert.deepEqual(config.relays, ["wss://relay.example.com"]);
  assert.equal(config.version, packageVersion);
  assert.equal(config.logLevel, "warn");
  assert.equal(config.defaultToolTimeoutMs, 1500);
  assert.equal(config.relayConnectTimeoutMs, 2500);
  assert.equal(config.resourceCacheTtlMs, 3000);
});
