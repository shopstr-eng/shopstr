# Overview

Milk Market is a permissionless Nostr-based marketplace for raw milk and related products. Payments: Bitcoin (Lightning, Cashu), Stripe, manual fiat. Implements 15+ NIPs, with PostgreSQL caching for SSR + analytics. Sellers run customizable storefronts; buyers can check out as guests or with Nostr keys; AI agents participate via the MCP API.

# User Preferences

Preferred communication style: Simple, everyday language.

# Stack

- **Frontend**: Next.js 16 (App Router) + TypeScript v4, React 19, HeroUI, Tailwind, Framer Motion, PWA. State via React Context per domain; localStorage for prefs/auth; service worker caching.
- **Backend**: Next.js API routes, PostgreSQL, Formidable uploads.
- **Runtime**: Node `>=22.4.0` (`.nvmrc` = `22`); `@cashu/cashu-ts` pinned to `4.1.0`.
- **Routing**: Friendly slugs for listings + profiles with pubkey disambiguation; naddr/npub URLs redirect to slugs (`utils/url-slugs.ts`).
- **SSR OpenGraph**: `/listing/`, `/shop/`, `/marketplace/`, `/communities/` fetch from PostgreSQL in `getServerSideProps` and inject meta via `pageProps.ogMeta` → `DynamicHead` (`_app.tsx`).

# External Dependencies

- **Nostr**: Relays for events, Blossom for media, NIP-05 DNS verification.
- **Payments**: Lightning, Cashu Mints, Getalby Lightning Tools (LN address utils), Stripe Connect, SendGrid (transactional email).
- **Libraries**: `crypto-js`, `nostr-tools`, `@cashu/cashu-ts`, `@heroui/react`, `@heroicons/react`, `framer-motion`, `stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`, `pdf-lib`, `qrcode`, `@modelcontextprotocol/sdk`.

# Architecture Docs

Deep-dive notes live under `docs/architecture/`. Read the relevant file only when the task touches that area:

- **`auth.md`** — NIP-07/46/49 signers, account recovery flow, PBKDF2/email-verification security.
- **`nostr.md`** — NIPs in use, hybrid event caching (IndexedDB + Postgres + relays), order-message tags (payment method, currency, shipping, grouping, subject routing).
- **`payments.md`** — Lightning + Cashu (`@cashu/cashu-ts` v4 gotchas, hardening utils), Stripe Connect (Express, webhooks, retries, pending-payments, cron cleanup), donation/platform fee, multi-currency cart math, manual fiat, API rate limiting.
- **`inventory.md`** — Centralized Postgres `inventory` + `inventory_log`, variant keys, deduction flows, MCP availability.
- **`features.md`** — Trust/reviews, order summary, email + guest checkout, custom email flows, return/refund requests, bulk/bundle pricing, variants & pickup, Subscribe & Save, cart multi-payment, free shipping threshold, payment method discounts, herdshare, Shopify migration.
- **`storefronts.md`** — Customizable `/shop/[slug]` storefronts (colors, fonts, page builder, SEO/OG meta, built-in shop page), self-serve custom domains (DNS, proxy rewrite, admin).
- **`mcp.md`** — Model Context Protocol server: endpoint, signing, auth (`sk_` keys, 3 perm levels), read/purchase/write tool categories, payment methods, agentic commerce endpoints.
- **`affiliates.md`** — Seller-managed affiliate links + codes (data model, APIs, Stripe + Cashu integration, anti-abuse, cron payouts, email/unsubscribe, operator runbook).
- **`seo.md`** — On-page SEO, GEO citations, dev-mode optimizations (Turbopack, PWA + flow scheduler off in dev).

Other long-form docs:

- **`docs/affiliate-payout-cron.md`** — Scheduled deployment cron details for affiliate payouts.
