import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CATEGORY_CACHE_TTL_MS,
  DEFAULT_MAX_CONCURRENT_REQUESTS,
  DEFAULT_NIP05_CACHE_TTL_MS,
  DEFAULT_NIP50_SEARCH_RELAYS,
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
  const expectedDefaultRelays = [
    "wss://nos.lol",
    "wss://relay.damus.io",
    "wss://purplepag.es",
  ];

  assert.deepEqual(DEFAULT_RELAYS, expectedDefaultRelays);
  assert.deepEqual(DEFAULT_NIP50_SEARCH_RELAYS, []);
  assert.deepEqual(parseRelayList(), expectedDefaultRelays);
  assert.deepEqual(
    parseRelayList(
      " wss://relay.example.com,invalid,wss://relay.example.com,ws://localhost "
    ),
    ["wss://relay.example.com", "ws://localhost"]
  );
  assert.deepEqual(parseRelayList("invalid"), expectedDefaultRelays);
  assert.deepEqual(parseRelayList("invalid", DEFAULT_NIP50_SEARCH_RELAYS), [
    ...DEFAULT_NIP50_SEARCH_RELAYS,
  ]);
  assert.deepEqual(loadConfig({}).nip50SearchRelays, []);
  assert.deepEqual(
    loadConfig({ SHOPSTR_MCP_NIP50_SEARCH_RELAYS: "" }).nip50SearchRelays,
    []
  );
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
    SHOPSTR_MCP_NIP50_SEARCH_RELAYS: "wss://search.example.com",
    SHOPSTR_MCP_LOG_LEVEL: "warn",
    SHOPSTR_MCP_TOOL_TIMEOUT_MS: "1500",
    SHOPSTR_MCP_RELAY_CONNECT_TIMEOUT_MS: "2500",
    SHOPSTR_MCP_RESOURCE_CACHE_TTL_MS: "3000",
  });

  assert.deepEqual(config.relays, ["wss://relay.example.com"]);
  assert.deepEqual(config.nip50SearchRelays, ["wss://search.example.com"]);
  assert.equal(config.version, packageVersion);
  assert.equal(config.logLevel, "warn");
  assert.equal(config.defaultToolTimeoutMs, 1500);
  assert.equal(config.relayConnectTimeoutMs, 2500);
  assert.equal(config.resourceCacheTtlMs, 3000);
  assert.equal(config.profileCacheTtlMs, 3000);
  assert.equal(config.categoryCacheTtlMs, DEFAULT_CATEGORY_CACHE_TTL_MS);
  assert.equal(config.nip05CacheTtlMs, DEFAULT_NIP05_CACHE_TTL_MS);
  assert.equal(config.cacheMaxEntries, 5000);
  assert.equal(config.maxConcurrentRequests, DEFAULT_MAX_CONCURRENT_REQUESTS);
});

test("loads dedicated cache TTL when provided", () => {
  const config = loadConfig({
    SHOPSTR_MCP_RESOURCE_CACHE_TTL_MS: "3000",
    SHOPSTR_MCP_PROFILE_CACHE_TTL_MS: "4500",
    SHOPSTR_MCP_CATEGORY_CACHE_TTL_MS: "86400000",
    SHOPSTR_MCP_NIP05_CACHE_TTL_MS: "172800000",
    SHOPSTR_MCP_CACHE_MAX_ENTRIES: "42",
    SHOPSTR_MCP_MAX_CONCURRENT_REQUESTS: "3",
  });

  assert.equal(config.resourceCacheTtlMs, 3000);
  assert.equal(config.profileCacheTtlMs, 4500);
  assert.equal(config.categoryCacheTtlMs, 86_400_000);
  assert.equal(config.nip05CacheTtlMs, 172_800_000);
  assert.equal(config.cacheMaxEntries, 42);
  assert.equal(config.maxConcurrentRequests, 3);
});
