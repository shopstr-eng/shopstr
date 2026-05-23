# Shopstr

## Overview

Shopstr is a global, permissionless marketplace built on the Nostr protocol, enabling Bitcoin commerce through decentralized communication and censorship-resistant transactions. It supports multiple payment methods including Lightning Network, Cashu ecash, and NWC (Nostr Wallet Connect). The platform is a Progressive Web App with client-side state management and server-side caching.

## User Preferences

Preferred communication style: Simple, everyday language.

## Tech Stack

- **Node**: 22.22.0 / **npm**: 10.9.4 (engines `>=22.4.0`)
- **Next.js**: 16.2.x (Turbopack) — `allowedDevOrigins: [process.env.REPLIT_DEV_DOMAIN]` in `next.config.mjs` is required for HMR through the Replit proxy
- **React / React-DOM**: 19.2.x
- **Tailwind CSS**: 4.x via `@tailwindcss/postcss`. CSS uses `@import "tailwindcss"` + `@config "../tailwind.config.ts"` in `styles/globals.css`
- **@heroui/react**: 2.8.10 (HeroUI v2 — successor to `@nextui-org/react` v2). Provider is `HeroUIProvider`; CSS vars are `--heroui-*`. **Do not upgrade to v3** without a planned migration — v3 is a breaking React Aria Components rewrite (no `ModalContent`, no `useDisclosure`, restructured Button/Input props)
- **framer-motion**: 12.x
- **@cashu/cashu-ts**: 4.x (uses `Bolt11`-suffixed quote/proof methods, `wallet.keyChain.getKeysets()`, `Amount` boundary type — convert with `.toNumber()` at the boundary, runtime `await wallet.loadMint()` required after `new CashuWallet(...)`, `getDecodedToken(token, [])`). Migration playbook at `.agents/skills/cashu-ts-migration/SKILL.md`
- **@noble/hashes**: 2.x — requires explicit `.js` subpath imports (e.g. `@noble/hashes/utils.js`)
- **postcss**: pinned to `8.5.13` via `overrides` in `package.json` to satisfy security scans (Next.js bundles 8.4.31 transitively)

## System Architecture

### Frontend

- **Framework**: Next.js 16 (Pages Router) with TypeScript, React 19
- **UI/UX**: HeroUI v2, Tailwind CSS v4, Framer Motion, PWA support
- **State Management**: React Context API (products, profiles, shops, chats, reviews, follows, relays, media, wallet, communities)
- **Data Persistence**: Local storage for user preferences and authentication, service worker for caching
- **Routing**: Middleware-based URL rewriting, dynamic routing, protected routes for authenticated operations. Friendly URL slugs for listings (title-based) and profiles (name-based) with collision handling via pubkey disambiguation. naddr/npub inputs still resolve but redirect to friendly slugs. Slug utilities in `utils/url-slugs.ts`

### Backend

- **Nostr Integration**: Multi-signer architecture (NIP-07, NIP-46, NIP-49); standard and custom kinds for products (NIP-99), user metadata, shop profiles, DMs (NIP-17), reviews (NIP-85), communities (NIP-72)
- **Data Fetching & Caching**: Service layer with dedicated fetch functions, subscription-based real-time updates from Nostr relays, multi-relay querying with fallback, cache-first strategy with background refresh
- **Authentication**: Stateless authentication via cryptographic signing, passphrase-based encryption (NIP-49), challenge-response pattern for secure operations

### Payment Processing

- **Multi-Payment Support**: Lightning Network, Cashu Ecash, NWC, and Zapsnags. Fiat-to-Bitcoin price conversion for display
- **Order Management**: Encrypted buyer-seller communication (gift-wrapped messages), payment confirmation proof, post-fulfillment review system

### Cashu Mint Operation Durability

The user-paid → claim-proofs path is hardened against network blips, mint outages, rate limiting, and tab closes:

- `utils/cashu/mint-retry-service.ts` — `withMintRetry()` wraps cashu-ts calls with bounded per-attempt timeouts, exponential backoff with full jitter, total-time budget, and `RateLimitError.retryAfterMs` honoring. Retries 5xx `HttpResponseError`, `RateLimitError`, our `Timeout` sentinel, and common network errors; 4xx-other-than-429 is terminal. Failures wrap in `MintOperationError`
- `utils/cashu/pending-mint-operations.ts` — durable localStorage record (`shopstr.pendingMintQuotes`) with status lifecycle `awaiting_payment → paid_unclaimed → claimed | failed_terminal`. `recoverPendingMintQuotes()` re-checks state with the mint and finishes the claim; quotes older than 7 days are abandoned
- `components/utility-components/mint-recovery-boot.tsx` — single-shot boot component mounted in `pages/_app.tsx`. On first signer availability it walks the pending store, finishes any unclaimed mints, and publishes the recovered proofs as a kind-7375 event

### API Rate Limiting

`utils/rate-limit.ts` exposes `applyRateLimit(req, res, bucket, opts, key?)` and is applied per-IP across every public API route. Authenticated write/MCP routes layer a tighter per-pubkey or per-key bucket after auth. Limits are sized per endpoint cost (10/hr for `set-nsec`, 30/min for credential mgmt and DNS-touching routes, 60–120/min for write/MCP, 120–600/min for read).

**Deployment caveat**: the bucket store is a per-process in-memory `Map`. Under horizontal scaling the effective ceiling is `N × limit`. Intentionally a coarse safety net to keep one bad client from monopolising the DB pool. For a strict global limit, swap the store for Redis (interface is already `bucketName + key → { count, resetAt }`).

### Media Handling

- **Blossom (NIP-B7)**: Decentralized media storage, authenticated uploads, multi-file upload progress, image optimization (responsive srcset for nostr.build), 100MB max file size, automatic compression for larger files

### Community Features

- **Moderated Communities (NIP-72)**: Creation, moderation, post approval workflows
- **Web of Trust**: Configurable follow-graph filtering

### Core Features

- **Order Summary Page** (`/order-summary`): Confirmation with order ID, product details (single or cart, including sizes/volumes/bulk options), payment method, cost breakdown, delivery info. Data passed via sessionStorage. Includes "Continue Shopping", "Check Order Status", "Contact Merchant", and a "More From the Marketplace" recommendations section
- **Bulk/Bundle Pricing**, **Size and Volume Options**, **Pickup Location Selection**
- **Order Status Persistence**: Database storage and API for tracking and updating
- **Unread/Read Indicators**: For messages and new orders, with persistence
- **SSR OpenGraph Meta Tags**: Product, shop, marketplace seller, and community pages use `getServerSideProps` to fetch entity data from the PostgreSQL cache and render `og:*` and Twitter Card meta server-side. Single-entity DB query functions in `utils/db/db-service.ts`. SSR OG flows from `getServerSideProps` → `pageProps.ogMeta` → `DynamicHead` (via `_app.tsx`). Shared types in `components/og-head.tsx`
- **Free Shipping Threshold**: Merchants set a minimum order amount + currency in shop profile (`freeShippingThreshold`, `freeShippingCurrency` on `ShopProfile`). When met per seller: shipping waived in `cart-invoice-card.tsx`, slide-in notification on add-to-cart (`components/free-shipping-notification.tsx`), per-seller progress bars on cart, and "Free" badge on order summary
- **Order Address Change**: Buyers can change shipping address from the Orders Dashboard via `AddressChangeModal` (`components/utility-components/address-change-modal.tsx`), which sends a gift-wrapped DM to the seller and updates local state

## MCP Server (AI Agent Integration)

Model Context Protocol server enabling AI agents to participate in the marketplace as buyers and sellers using their Nostr keys for event signing.

### Architecture

- **Endpoint**: `pages/api/mcp/index.ts` — Streamable HTTP transport
- **Server Factory**: `mcp/server.ts`
- **Tools**: `mcp/tools/read-tools.ts`, `mcp/tools/write-tools.ts`; purchase tools inline in `pages/api/mcp/index.ts`
- **Resources**: `mcp/resources.ts` (catalog via `shopstr://catalog/products`)
- **Nostr Signing**: `utils/mcp/nostr-signing.ts` — `McpNostrSigner`, `McpRelayManager`, encrypted nsec storage, `signAndPublishEvent()`
- **Auth**: `utils/mcp/auth.ts` — API key generation/validation, nsec storage/retrieval, `getAgentSigner()`
- **Metrics**: `utils/mcp/metrics.ts`
- **Endpoints**: `api-keys.ts`, `create-order.ts`, `verify-payment.ts`, `onboard.ts`, `set-nsec.ts`, `status.ts`
- **Manifest**: `pages/api/.well-known/agent.json.ts` (v2.0.0)
- **Settings UI**: `pages/settings/api-keys.tsx`

### Tools

- **Read** (any key): `search_products`, `get_product_details`, `list_companies`, `get_company_details`, `get_reviews`, `check_discount_code`, `get_payment_methods`, `get_storefront`
- **Purchase** (`read_write`+): `create_order`, `verify_payment`, `get_order_status`, `list_orders`, `list_seller_orders`, `get_notifications`
- **Write** (`full_access` + stored nsec): `set_user_profile`, `set_shop_profile`, `register_shop_slug`, `create_product_listing`, `update_product_listing`, `delete_listing`, `publish_review`, `create_community_post`, `send_direct_message`, `set_relay_list`, `set_blossom_servers`, `upload_media`, `create_discount_code`, `delete_discount_code`, `list_discount_codes`, `get_cashu_balance`, `receive_cashu_tokens`, `set_cashu_mints`, `send_cashu_payment`, `update_order_address`, `send_shipping_update`, `update_order_status`, `list_messages`, `mark_messages_read`

### Payment Methods

- **Lightning**: Cashu mint quote (bolt11) via `@cashu/cashu-ts`. Default mint: `https://mint.minibits.cash/Bitcoin`. Agent pays then calls `verify_payment`
- **Cashu**: Agent provides serialized token; server verifies and redeems

### Permissions & Auth

- `read` — browse only; `read_write` — browse + purchase; `full_access` — full participation with server-side Nostr signing (requires nsec stored at onboarding or via `POST /api/mcp/set-nsec`)
- Keys created via `/settings/api-keys`, `/api/mcp/api-keys`, or zero-touch `/api/mcp/onboard`. PBKDF2-hashed, Bearer token auth, prefix `sk_`
- Server-side nsec storage: AES-256-GCM, key in `MCP_ENCRYPTION_KEY`. `McpNostrSigner` provides `sign()/encrypt()/decrypt()/getPubKey()` without browser dependencies. Events cached to DB and published via `nostr-tools` SimplePool

### Database Tables

- `mcp_api_keys` — hashed secrets, permissions, usage tracking, optional `encrypted_nsec`
- `mcp_orders` — orders placed through MCP/API with payment and status tracking

## Storefront System

Sellers configure branded storefronts at `/shop/[slug]`. Subdomain routing (`*.shopstr.market`) handled in `proxy.ts`.

### Architecture

- **Routes**: `pages/shop/[slug].tsx` (home), `pages/shop/[...shopPath].tsx` (sub-pages)
- **Layout**: `components/storefront/storefront-layout.tsx` — applies CSS variables for theming, adds `sf-active` class to body to hide global Shopstr nav
- **Theme Wrapper**: `components/storefront/storefront-theme-wrapper.tsx` — wraps existing pages (e.g. `/listing`) when visited from a storefront context. Detects active storefront via sessionStorage `sf_seller_pubkey`
- **Custom Domain Landing**: `pages/shop/_custom-domain.tsx` — Shopstr-branded fallback when domain not found

### Config (in `ShopProfile.content.storefront`)

`colorScheme`, `productLayout` (`grid|list|featured`), `landingPageStyle` (`hero|classic|minimal`), `shopSlug`, `customDomain`, `fontHeading`, `fontBody`, `sections`, `pages`, `footer`, `navLinks`, `showCommunityPage`, `showWalletPage`.

### Sections

12 types in `components/storefront/sections/`: `hero`, `about`, `story`, `products`, `testimonials`, `faq`, `ingredients`, `comparison`, `text`, `image`, `contact`, `reviews`. Dispatched by `section-renderer.tsx`.

### Helper Components

`storefront-hero.tsx`, `storefront-footer.tsx`, `storefront-product-grid.tsx`, `storefront-community.tsx`, `storefront-wallet.tsx`, `storefront-orders.tsx`, `storefront-my-listings.tsx`, `storefront-order-confirmation.tsx`.

### API Routes

- `GET /api/storefront/lookup?slug=` — pubkey by shop slug
- `POST /api/storefront/register-slug` — register/update slug
- `POST /api/storefront/custom-domain` — register custom domain + DNS instructions
- `GET/DELETE /api/storefront/custom-domain?pubkey=` — get/remove custom domain

### Database Tables

- `shop_slugs` — pubkey → slug (unique slug)
- `custom_domains` — pubkey → custom domain (verified flag)

### Settings UI

Shop profile settings (`/settings/shop-profile`) uses `ShopProfileForm` (`components/settings/shop-profile-form.tsx`) with two tabs: **Basic Info** (name, about, banner, picture, free shipping threshold) and **Storefront** (slug, layout, colors with 7 presets, typography, nav, sections builder, custom pages, community/wallet toggles, footer editor, custom domain, preview, remove). Sub-editors in `components/settings/storefront/`: `section-editor.tsx`, `footer-editor.tsx`, `page-editor.tsx`, `storefront-preview-modal.tsx`.

### Cart Integration

`pages/cart/index.tsx` is wrapped in `StorefrontThemeWrapper` — reads `sf_seller_pubkey` from sessionStorage, filters cart items to the active storefront seller, shows a banner if other sellers' items were excluded, and wraps the page with the storefront nav/footer.

## External Dependencies

- **Nostr**: `nostr-tools`, `@getalby/lightning-tools`
- **Payments**: `@cashu/cashu-ts`, Lightning Address (Alby tools)
- **MCP**: `@modelcontextprotocol/sdk`
- **Database**: `pg` (PostgreSQL)
- **UI**: `@heroui/react` v2, `@heroicons/react`, Tailwind v4, Framer Motion v12
- **Media**: `qrcode`, `react-responsive-carousel`, `@braintree/sanitize-url`
- **Crypto**: `crypto-js`, `@noble/hashes` v2
