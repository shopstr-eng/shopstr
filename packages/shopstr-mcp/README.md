# Shopstr MCP Server

Standalone read-only MCP server package for Shopstr marketplace data.

This package currently contains the standalone MCP shell, shared read-only
infrastructure, and the first relay-backed read tools for public Shopstr
marketplace data. Seller, storefront, reputation, prompt, and resource features
will be added in follow-up PRs.

## Current Scope

- Provides the `@shopstr/mcp` package metadata and `shopstr-mcp` binary entry.
- Reads relay, timeout, cache, and log-level settings from environment
  variables.
- Starts an MCP server over stdio for local MCP-compatible clients.
- Registers relay-backed core read tools:
  `search_products`, `get_product_details`, and `get_reviews`.
- Registers disabled resource and prompt placeholders so `resources/list` and
  `prompts/list` return valid empty lists until those features are added.
- Provides reusable infrastructure modules for upcoming tools:
  `nostr-manager`, `relay-fetch`, `parse-tags`, `dedup`, `validation`,
  `errors`, `timeout`, `audit-log`, and `cache`.

## Tools

- `search_products`: search public product listings by keyword, category,
  location, currency, and price range. Price filters require `currency`.
  Category searches are pushed down to relays with `#t` when possible, then
  checked again client-side with a broad fallback if no category-tagged results
  match. Hidden Gamma listings are excluded from search results. Responses are
  capped at 37 products for MCP token budgeting, even when a higher `limit` is
  requested.
- `get_product_details`: fetch one product listing by `productAddress`
  (`30402:<seller-pubkey>:<product-d-tag>`) or by 64-character `productId`.
  When given `productId`, the tool first resolves the product coordinate and
  then fetches the latest replaceable listing for that coordinate so agents do
  not accidentally use stale event IDs.
- `get_reviews`: fetch public reviews for a product address, product ID, or
  seller pubkey. Product reviews use the Shopstr/Gamma `#d` address model and
  also query the standard `#a` address model. `productId` is resolved to a
  product address when possible and keeps a legacy `#e` fallback. Seller review
  lookups first derive the seller's product addresses, query Gamma/standard
  product review targets, and keep legacy `#p` as a fallback.

Product responses expose Gamma-compatible fields where available, including
structured image objects, `productType`, `productFormat`, `visibility`
(`hidden`, `on-sale`, or `pre-order`), `stock`, and structured
`shippingOptions`. The parser keeps legacy Shopstr fields such as `quantity`,
embedded `shipping`, and subscription tags as fallback data when present.

Tool responses include relay degradation metadata in `_meta`, including queried
relays, successful relays, failed relays, coverage, response time, hints, and
truncation flags when response budgeting applies.

Upcoming seller/profile tools receive a process-local in-memory profile cache
through the shared tool context. The cache stores parsed public profile/shop
responses by pubkey and event kind, expires entries by TTL, and is intended to
surface `_meta.cached: true` when a future profile response is served from cache.

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
- `SHOPSTR_MCP_PROFILE_CACHE_TTL_MS`: in-memory parsed profile/shop cache TTL in
  milliseconds. Defaults to `SHOPSTR_MCP_RESOURCE_CACHE_TTL_MS` when unset or
  invalid.

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

## For Verification

```sh
npx @modelcontextprotocol/inspector node shopstr/packages/shopstr-mcp/dist/index.js
```
