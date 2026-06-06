---
name: Pro feature enforcement surfaces
description: Where Pro-tier entitlement can vs. cannot be enforced server-side in this Nostr marketplace, and why.
---

Not every Pro-only seller feature has a server write path to gate. Split them by where the data actually lives:

- **Server-backed Pro features → hard-gate server-side at the write endpoint.** Custom domains (Postgres + proxy), MCP API keys + MCP usage, and email flows all flow through Next.js API routes. Gate every write/use with `requireProEntitlement(pubkey, res)` (utils/pro/require-pro.ts) after the ownership/auth check. These are also the abuse-prone / cost-bearing features, so they MUST fail closed.
- **Nostr-published Pro features → cannot be blocked at write time; enforce at the SERVE layer.** Storefront design (colors/fonts/sections/footer) and product-page templates live inside the kind-30019 shop event, published client-side straight to relays via `createNostrShopEvent`. There is no server in that path, so UI gating is best-effort only. The real enforcement is _serving suppression_: hide the custom design for hidden/non-entitled sellers when rendering, and default the SSR OG meta.

**Why:** The product is intentionally a permissionless Nostr marketplace. Trying to "block" a Nostr publish would mean building a relay-side or publish-proxy validation layer that does not exist.

**How to apply:** When asked to "enforce a Pro feature on the server," first check whether the feature has a server write endpoint. If yes, gate the endpoint. If it's Nostr-published, gate the serve/render path instead and treat the UI gate as UX only.

**Storefront-design enforcement now fails CLOSED and spans MULTIPLE surfaces — gate every one or you leak premium design to non-Pro sellers:**

- Render layer (client): `StorefrontLayout` (main stall page) AND `StorefrontThemeWrapper` (used by `/stall/[slug]/orders` via `ThemedStallOrders`, and custom-domain chrome from `_app.tsx`). Both must gate on `isPro`, not just `!isHidden` — readonly/non-Pro sellers also lose premium design.
- Serve layer (SSR OG): BOTH `pages/stall/[slug].tsx` and `pages/stall/[...stallPath].tsx` gSSP must gate branded OG on `getMembershipView(pubkey).isPro` (subpages are a separate file, easy to miss).
- Entitlement source: viewed-seller `isPro` via `/api/pro/status` (`usePublicMembershipStatus` hook, or a direct fetch). Fail closed: treat unresolved/error/outage as non-Pro.

**Two gotchas that caused real leaks:**

1. **React effects run BEFORE the component's `if (!hasCustomStorefront) return <>{children}</>` early-return.** Gating only the render is not enough — a non-Pro seller's `colorScheme` still gets hydrated into state and painted via the body CSS-var effect. Gate the _hydration effect itself_ on `isPro` (null out storefront/colors when not Pro).
2. **Stale entitlement across client-side shop switches.** Scope the resolved status to the pubkey it was fetched for (`{pubkey, isPro}`, derive entitled only when `pubkey === currentSeller`), or a previous Pro seller's `true` briefly applies to the next (non-Pro) seller. The shared `usePublicMembershipStatus` cache has a 60s TTL — a deliberate bound (per-render revalidation would hammer `/api/pro/status`); a lapsed seller can keep premium design for up to 60s, accepted as availability/perf over strict real-time.

**Why fail-closed here (reversed from the earlier fail-open note):** the user asked to close ALL Pro-tier functional gaps; serving premium design to lapsed/free sellers is the gap, so strictness wins over the old "don't nuke designs during an outage" stance.
