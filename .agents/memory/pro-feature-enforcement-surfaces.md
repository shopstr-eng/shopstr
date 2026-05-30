---
name: Pro feature enforcement surfaces
description: Where Pro-tier entitlement can vs. cannot be enforced server-side in this Nostr marketplace, and why.
---

Not every Pro-only seller feature has a server write path to gate. Split them by where the data actually lives:

- **Server-backed Pro features → hard-gate server-side at the write endpoint.** Custom domains (Postgres + proxy), MCP API keys + MCP usage, and email flows all flow through Next.js API routes. Gate every write/use with `requireProEntitlement(pubkey, res)` (utils/pro/require-pro.ts) after the ownership/auth check. These are also the abuse-prone / cost-bearing features, so they MUST fail closed.
- **Nostr-published Pro features → cannot be blocked at write time; enforce at the SERVE layer.** Storefront design (colors/fonts/sections/footer) and product-page templates live inside the kind-30019 shop event, published client-side straight to relays via `createNostrShopEvent`. There is no server in that path, so UI gating is best-effort only. The real enforcement is _serving suppression_: hide the custom design for hidden/non-entitled sellers when rendering, and default the SSR OG meta.

**Why:** The product is intentionally a permissionless Nostr marketplace. Trying to "block" a Nostr publish would mean building a relay-side or publish-proxy validation layer that does not exist.

**How to apply:** When asked to "enforce a Pro feature on the server," first check whether the feature has a server write endpoint. If yes, gate the endpoint. If it's Nostr-published, gate the serve/render path instead (theme wrapper, product renderer, stall gSSP OG) and treat the UI gate as UX only. Hidden-seller design suppression today is a client `usePublicMembershipStatus` fetch that fails _open_ (unknown = visible) to avoid nuking all paying sellers' designs during a `/api/pro/status` outage — a deliberate availability-over-strictness tradeoff for a low-stakes cosmetic surface.
