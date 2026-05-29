---
name: Storefront SSR head tags (favicon + OG)
description: Why storefront favicon/OG meta must flow through getServerSideProps ogMeta, not client-side shop data.
---

# Storefront favicon + OG must be SSR, not client-only

For custom stalls (`/stall/<slug>`, `/stall/<...stallPath>`) and custom domains (proxy rewrites the apex/subdomain to `/stall/<slug>`), any head tag a seller wants discovered by search engines or social-preview bots must be produced in `getServerSideProps` and passed via `pageProps.ogMeta` → `DynamicHead`.

**Why:** crawlers/social bots only read the initial server HTML; they do not run the client-side Nostr/shop fetches. The favicon used to be derived only from client-side `shopEvents.get(pubkey).content.ui.picture`, so bots never saw the seller's icon — only the default Milk Market one.

**How to apply:** the seller logo (`content.ui.picture || content.ui.banner`) goes into `ogMeta.favicon` at SSR. `DynamicHead` prefers `ssrOgMeta.favicon`, then falls back to the client custom-domain logo (for rewritten routes like `/listing`/`/cart` that have no SSR ogMeta), then the platform default. Same principle for `og:site_name`, `og:type`, `og:locale`, keywords, geo tags — read them from `ssrOgMeta` with platform defaults as fallback.
