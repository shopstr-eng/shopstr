# MCP Read-Only Scripts

This folder contains small, read-only TypeScript scripts for browsing Shopstr marketplace data through existing relay fetch and parser logic.

## Current Script

`read-products.ts`

What it does:

- fetches marketplace listings from relays
- parses them into `ProductData`
- prints the result as JSON to stdout
- supports optional lookup by seller pubkey or listing event id

## How to Run

From the project root:

```bash
npx tsx mcp/read-products.ts
```

Fetch a single seller's listings:

```bash
npx tsx mcp/read-products.ts --pubkey <seller-pubkey>
```

Fetch a single listing by event id:

```bash
npx tsx mcp/read-products.ts --id <listing-event-id>
```

Use custom relays:

```bash
npx tsx mcp/read-products.ts --relay wss://relay.damus.io --relay wss://nos.lol
```

Optional flags:

- `--limit <number>`
- `--include-zapsnag`
