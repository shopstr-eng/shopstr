# Changelog

All notable changes to `@shopstr/mcp` are documented in this file.

## Unreleased

### Changed

- Internal API: `NostrManager.fetch()` no longer rejects with `TimeoutError`
  when a relay fetch times out. It now resolves with the events received
  before the timeout. The internal `fetchWithStatus()` method distinguishes a
  complete response (EOSE) from a partial one, resolving
  `{ events, complete: false }` on timeout. (Neither method is part of the
  published package exports; the server exposes MCP tools only.)
- Relay metadata gained `relaysIncomplete`: timed-out relays no longer count
  toward `coverage`, and `degraded` is set when any relay is incomplete.
- Relay connection attempts are now bounded. Bare `NostrManager` instances
  default to a 4s connection timeout; the MCP server defaults to 5s,
  configurable via `SHOPSTR_MCP_RELAY_CONNECT_TIMEOUT_MS`.
- `subscribe()` now starts relay keep-alive in the background and returns the
  subscription handle without awaiting it, so a slow or unreachable relay does
  not delay completion of `subscribe()`.
