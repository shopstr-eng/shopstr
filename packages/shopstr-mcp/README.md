# Shopstr MCP Server

Standalone read-only MCP server package for Shopstr marketplace data.

This package currently contains the standalone MCP shell plus shared read-only
infrastructure for relay access, validation, JSON-safe parsing, deduplication,
structured errors, timeouts, and audit logging. Listing, seller, review, and
community tools will be added in follow-up PRs.

## Current Scope

- Provides the `@shopstr/mcp` package metadata and `shopstr-mcp` binary entry.
- Reads relay, timeout, cache, and log-level settings from environment
  variables.
- Starts an MCP server over stdio for local MCP-compatible clients.
- Registers disabled placeholders so `tools/list`, `resources/list`, and
  `prompts/list` return valid empty lists until real read tools are added.
- Provides reusable infrastructure modules for upcoming tools:
  `nostr-manager`, `relay-fetch`, `parse-tags`, `dedup`, `validation`,
  `errors`, `timeout`, and `audit-log`.

## Usage

```sh
npm install
npm --prefix packages/shopstr-mcp run build
npm --prefix packages/shopstr-mcp start
```

For local configuration, copy `.env.example` and set the values your MCP client
or process manager should provide.

## Environment

- `SHOPSTR_MCP_RELAYS`: comma-separated `ws://` or `wss://` relay URLs.
- `SHOPSTR_MCP_LOG_LEVEL`: `error`, `warn`, `info`, or `debug`.
- `SHOPSTR_MCP_TOOL_TIMEOUT_MS`: default future per-tool timeout in
  milliseconds.
- `SHOPSTR_MCP_RELAY_CONNECT_TIMEOUT_MS`: future relay connection timeout in
  milliseconds.
- `SHOPSTR_MCP_RESOURCE_CACHE_TTL_MS`: future resource cache TTL in
  milliseconds.

Invalid or missing values fall back to safe defaults.

## Read-Only Model

This package is intended to expose public Shopstr/Nostr read paths only. It
must not accept private keys, sign events, create orders, access wallets, or
perform checkout actions. Future tools should use allowlisted relay URLs,
validated schemas, bounded timeouts, per-relay graceful degradation metadata,
and audit logging.

## Development

```sh
npm --prefix packages/shopstr-mcp run build
npm --prefix packages/shopstr-mcp test
```
