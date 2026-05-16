# Seller Storefronts

Sellers run customizable shops at `/shop/[slug]`.

- **Customization**: color scheme + per-color usage hints, independent navbar colors (background/text/accent), independent footer colors, landing page style, product layout, Google Fonts or custom uploaded fonts (`.woff2`/`.woff`/`.ttf`/`.otf` via Blossom), section-based page builder, multi-page nav, custom footer with social links, store policies, optional neo-brutalist card shadows (`neoShadows` toggle in Kind 30019).
- **Custom font scope**: When a seller sets a heading or body font, it cascades across the entire storefront via root-level CSS in `storefront-layout.tsx`, `storefront-theme-wrapper.tsx`, `storefront-preview-panel.tsx`, `storefront-preview-frame.tsx`. Body font defaults all text; heading font applies to all `h1`–`h6` and `.font-heading`.
- **Markdown formatting**: `components/storefront/formatted-text.tsx` renders inline `*italic*`, `**bold**`, `***bold italic***` for shop name, footer tagline, and consumer-facing storefront text.
- **SEO & OG meta**: Per-storefront fields (meta title/description, OG image, keywords, locale, geo region/city). "Auto-generate" mode fills empty fields from shop name/about/slug at save. SSR meta in `getServerSideProps` for `[slug].tsx` and `[...shopPath].tsx`. Type: `StorefrontSeoMeta` in `packages/domain/src/storefront.ts`.
- **Built-in Shop Page**: Every storefront gets `/shop/[slug]/shop` with search, category filters, location filter, sort options, paginated grid styled with storefront colors. "Shop" link auto-injected into navbar if missing. Component: `components/storefront/storefront-shop-page.tsx`.
- **Independent Nav/Footer Colors**: `StorefrontNavColors` / `StorefrontFooterColors` types each carry `background`, `text`, `accent`.

## Self-Serve Custom Domains

Sellers connect their own domain (apex or subdomain) to their storefront from Settings → Stall.

- **Schema** (`db/schema.sql` + bootstrap in `utils/db/db-service.ts`): `custom_domains` columns include `domain_type`, `verification_token`, `tls_status`, `attached_at`, `admin_notified_at`. One domain per storefront. Helpers in `utils/db/custom-domains.ts` (CRUD + `classifyDomain` + `isValidDomain`).
- **Seller flow** (`components/settings/custom-domain-section.tsx`, mounted inside `shop-profile-form.tsx`): submit domain → receive TXT (`_milkmarket.<domain>`) + CNAME (subdomain) or A-record (apex, real IPs of `milk.market` resolved live + cached 5 min, overridable via `CUSTOM_DOMAIN_APEX_IPS`) instructions → "Check DNS" → status badge.
- **APIs**: `pages/api/storefront/custom-domain.ts` (POST/GET/DELETE; signed Nostr event with `custom-domain-write` action), `pages/api/storefront/verify-domain.ts` (TXT + CNAME/A check, normalizes trailing dots, strict suffix-boundary match, requires every observed A IP to be in platform IP set).
- **Admin** (`pages/admin/domains.tsx`, `pages/api/admin/custom-domains/{index,status}.ts`): admin checks via `pages/api/admin/check.ts` (returns `{ isAdmin: bool }`). Admin auth via signed Nostr event with action `admin-domain-list` / `admin-domain-status` (or `ADMIN_API_SECRET` header for server-to-server). Helpers in `utils/admin/auth.ts` (`isAdminPubkey`, `requireAdmin`). Admin email notifications via `customDomainAdminNotificationEmail` template + `sendCustomDomainAdminNotification`.
- **Proxy** (`proxy.ts`): host classification uses explicit suffix/exact lists (no substring matching). For custom-domain hosts, async `lookupSlugByHost` (`utils/storefront/host-cache.ts`, in-process LRU) finds the seller slug; all non-API/non-static paths rewrite to `/stall/<slug>/<path>`. Static + allow-listed shared APIs pass through unchanged.
- **Env**: `ADMIN_PUBKEYS` (comma-separated lowercase hex), `DOMAINS_ADMIN_EMAIL` (default `domains@milk.market`), `REPLIT_DEPLOYMENT_HOST` (default `milk-market.replit.app`), `CUSTOM_DOMAIN_APEX_IPS` (optional pinned IPs), `ADMIN_API_SECRET` (optional bearer for server-to-server admin reads).
