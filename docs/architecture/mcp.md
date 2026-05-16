# MCP Server (AI Agent Integration)

Model Context Protocol server lets AI agents participate as buyers and sellers — browse, order, list, profile, upload, DM, review, community, relay/blossom config, discount codes, Cashu wallets — using their Nostr keys.

## Architecture

- **Endpoint**: `pages/api/mcp/index.ts` — Streamable HTTP transport. Server factory: `mcp/server.ts`. Read tools: `mcp/tools/read-tools.ts`. Write tools: `mcp/tools/write-tools.ts`. Resources: `mcp/resources.ts` (catalog via `milkmarket://catalog/products`).
- **Signing**: `utils/mcp/nostr-signing.ts` — `McpNostrSigner`, `McpRelayManager`, encrypted nsec storage, `signAndPublishEvent()`.
- **Auth**: `utils/mcp/auth.ts` — PBKDF2-hashed Bearer keys (prefix `sk_`), three permission levels (`read`, `read_write`, `full_access`). Agents set nsec post-onboarding via `POST /api/mcp/set-nsec`.
- **Routes**: `api-keys.ts`, `create-order.ts`, `verify-payment.ts`, `onboard.ts`, `set-nsec.ts`, `status.ts`. Manifest at `pages/api/.well-known/agent.json.ts`. Settings UI: `pages/settings/api-keys.tsx`.
- **Tables**: `mcp_api_keys`, `mcp_orders`.
- **Server-side signing**: `full_access` keys store nsec encrypted with AES-256-GCM (`MCP_ENCRYPTION_KEY`). Events sign server-side, cache to DB, publish via `McpRelayManager`.

## Tools (categories)

- **Read** (any key): product/company search & details, reviews, discount-code check, payment methods. Responses include subscription info, variant options, herdshare agreements, pickup locations, required customer info, payment method discounts, free shipping.
- **Purchase** (`read_write`+): `create_order` (stripe/lightning/cashu/fiat), `verify_payment`, `get_order_status`, `list_orders`, full subscription CRUD, `list_seller_orders`, `get_notifications`.
- **Write** (`full_access` + stored nsec): profile/shop kinds (0/30019), product CRUD (30402), reviews (31555 + NIP-22 replies via 1111), community posts, NIP-17 DMs, relay/blossom config (10002/10063), media upload (24242), discount codes, Cashu wallet ops (7375/17375), order/shipping/address updates, message read state, email-flow management.

## Payment methods

- **Lightning**: Cashu mint quote → bolt11 invoice → `verify_payment`. Default mint: `https://mint.minibits.cash/Bitcoin`.
- **Cashu**: Agent provides serialized token; server verifies and redeems.
- **Stripe**: Creates PaymentIntent. Agent completes via Stripe SDK.
- **Fiat**: Returns seller handles; agent pays externally with order ID in memo and seller confirms manually.
- Per-method discounts apply automatically.

## Agentic Commerce Endpoints

- `GET /.well-known/agent.json` — capabilities manifest (unauth).
- `POST /api/mcp/onboard` — zero-touch registration. Generates a Nostr keypair when `pubkey` omitted (returns `nsec`); reuses identity when provided. Always returns `npub`. Rate-limited 10/IP/hour.
- `GET /api/mcp/status` — health + metrics (`utils/mcp/metrics.ts`).
- **Pricing in protocol**: Every product response has structured `pricing` block. Order creation returns HTTP 402 with payment instructions when Stripe is required.
- **Response metadata**: All MCP tool responses include `_meta` (`responseTimeMs`, `dataSource`, `dataFreshness`, `resultCount`); HTTP responses include `X-Response-Time`.
