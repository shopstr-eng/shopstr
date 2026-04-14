# Shopstr

## Overview

Shopstr is a global, permissionless marketplace built on the Nostr protocol, enabling Bitcoin commerce through decentralized communication and censorship-resistant transactions. It supports multiple payment methods including Lightning Network, Cashu ecash, and NWC (Nostr Wallet Connect). The platform provides a Progressive Web App (PWA) experience with client-side state management and server-side caching. Its core purpose is to offer a censorship-resistant, decentralized e-commerce solution.

## User Preferences

Preferred communication style: Simple, everyday language.

## Tech Stack Versions

- **Next.js**: 16.2.3 (Turbopack)
- **React / React-DOM**: 19.2.5
- **Tailwind CSS**: 4.2.2 via `@tailwindcss/postcss`
- **@heroui/react**: 2.8.10 (HeroUI v2 — the maintained successor to `@nextui-org/react` v2)
- **framer-motion**: 12.38.0

### Tailwind v4 Notes

HeroUI v2.8.10 replaced `@nextui-org/react@2.2.9`. The heroui plugin correctly uses `addBase()` for all non-class selectors (`:root`, `[data-theme]`) — no compatibility shim needed. CSS config uses `@import "tailwindcss"` + `@config "../tailwind.config.ts"` in `styles/globals.css`, and `@tailwindcss/postcss` in `postcss.config.cjs`. The app provider changed from `NextUIProvider` to `HeroUIProvider`. CSS variables renamed from `--nextui-*` to `--heroui-*`.

### Product Listing Page Routing Fix (PR #384)

`findListingBySlug` in `utils/url-slugs.ts` was only matching pubkey-suffixed slugs (e.g. `title-a1b2c3d4`), so uniquely-titled listings with plain slugs returned "not found". Fixed by adding a plain-title fallback match. Also added:

- Defensive "not found" guard: listing page only shows 404 when `productEvents.length > 0`
- `isLoading: true` during DB pre-load in `fetch-service.ts` to prevent premature 404 before relay fetch completes

## Recent Changes

### Dev Server Infinite-Loop Fix

Root cause: Next.js 16 Turbopack's HMR WebSocket was blocked by the Replit cross-origin proxy because `allowedDevOrigins` was not set in `next.config.mjs`. With no WebSocket connection, the HMR client fell back to polling and triggered full page reloads every ~30–60 s. Each reload remounted `Shopstr`, fired `loadSigner` (which always created a fresh signer object reference), and restarted `fetchData`, producing the observed `GET /marketplace → fetch-relays → fetch-profile → GET /marketplace` cycle.

Three fixes applied:

1. **`next.config.mjs`** — added `allowedDevOrigins: [process.env.REPLIT_DEV_DOMAIN]` so HMR WebSocket can connect from the Replit preview domain. HMR now shows `[HMR] connected` and `[Fast Refresh] done` instead of triggering page reloads.
2. **`nostr-context-provider.tsx` (`loadSigner`)** — added `lastSuccessfulSignerKeyRef` to skip `setSigner` (and therefore skip `fetchData`) when the serialized signer credentials haven't changed. Prevents spurious `fetchData` restarts from unrelated storage events (e.g. NWC string saves) that previously created a new signer object reference.
3. **`pages/index.tsx`** — narrowed the redirect effect dependency from the whole `signerContext` object to `signerContext.isLoggedIn`, preventing the effect from firing on every `SignerContextProvider` re-render when the login state itself hasn't changed.

### Onboarding Flow Redesign

- **Step 1 (keys.tsx)**: Simplified to only show a passphrase input. Removed public/private key display and copy handlers. Now redirects to user-type selection after completion.
- **Step 2 (user-type.tsx)**: New page for user role selection (Buyer or Seller). Routes to user-profile with a `?type=` query param.
- **Step 3 (user-profile.tsx)**: Now conditionally renders `BuyerProfileForm` (for buyers) or `UserProfileForm` (for sellers). Buyers finish onboarding here; sellers proceed to shop profile.
- **Step 4 (shop-profile.tsx)**: Updated button text to "Finish (or skip)".
- **New component (buyer-profile-form.tsx)**: Simplified profile form for buyers with only display_name, name, about, banner, and picture fields. Preserves existing profile data on save.

### SignInModal Redesign

- Added `sellerFlow?: boolean` prop to pre-select seller role during sign-up.
- New landing view with distinct Sign Up / Sign In flows.
- Sign-in (existing key) → routes to `/marketplace`.
- Sign-up (existing key) → routes to `/onboarding/user-type` (or with `?preselect=seller` when `sellerFlow` is true).
- "Create New Account" → routes to `/onboarding/keys`.
- Added eye toggle for password/passphrase visibility in nsec flows.

### File Uploader Fix

- Fixed `isIconOnly` prop to include loading state: `isIconOnly={isIconOnly || loading}`.
- `startContent` is now `undefined` when loading (prevents icon/spinner overlap).

## System Architecture

### Frontend

- **Framework**: Next.js 14 with TypeScript (App Router), React 18.
- **UI/UX**: NextUI, Tailwind CSS, Framer Motion for animations, PWA support.
- **State Management**: React Context API for various domains (products, profiles, shops, chats, reviews, follows, relays, media, wallet, communities).
- **Data Persistence**: Local storage for user preferences and authentication, service worker for caching.
- **Routing**: Middleware-based URL rewriting, dynamic routing, protected routes for authenticated operations. Friendly URL slugs for listings (title-based) and profiles (name-based) with collision handling via pubkey disambiguation. naddr/npub inputs still resolve but redirect to friendly slugs. URL slug utilities in `utils/url-slugs.ts`.

### Backend

- **Nostr Protocol Integration**: Multi-signer architecture (NIP-07, NIP-46, NIP-49), utilizing standard and custom Nostr event kinds for products (NIP-99), user metadata, shop profiles, direct messages (NIP-17), reviews (NIP-85), and communities (NIP-72).
- **Data Fetching & Caching**: Service layer with dedicated fetch functions, subscription-based real-time updates from Nostr relays, multi-relay querying with fallback, cache-first strategy with background refresh.
- **Authentication & Authorization**: Stateless authentication via cryptographic signing, passphrase-based encryption (NIP-49), challenge-response pattern for secure operations.

### Payment Processing

- **Multi-Payment Support**: Lightning Network (invoice generation, LNURL), Cashu Ecash (token minting/redemption), NWC (Nostr Wallet Connect), and Zapsnags. Fiat-to-Bitcoin price conversion is supported for display purposes.
- **Payment Flow**: Invoice generation, ecash token redemption, quantity-based pricing.
- **Order Management**: Encrypted buyer-seller communication (gift-wrapped messages), payment confirmation proof, post-fulfillment review system.

### Media Handling

- **Blossom Protocol Integration (NIP-B7)**: Decentralized media storage, authenticated uploads, multi-file upload progress, image optimization (responsive srcset generation), maximum 100MB file size, automatic image compression for larger files.
- **Image Serving**: Automatic responsive image generation for nostr.build domains, fallback to original URLs, lazy loading.

### Community Features

- **Moderated Communities (NIP-72)**: Creation and management, post approval workflows, rich content feed rendering.
- **Social Graph & Trust**: Web of Trust (WoT) filtering based on follow relationships, configurable trust thresholds.

### Core Features

- **Order Summary Page**: Dedicated post-purchase page (`/order-summary`) displaying order confirmation with order ID, product details (single product or cart items with images, sizes, volumes, bulk options, quantities), payment method with human-readable names, subtotal/shipping/total cost breakdown, and delivery information (shipping address or per-item pickup locations). Data is passed via sessionStorage from the checkout flow. Includes "Continue Shopping" (primary), "Check Order Status", and "Contact Merchant" buttons (latter two shown when logged in). Also displays a "More From the Marketplace" section with randomized product recommendations excluding the seller's own products.
- **Bulk/Bundle Pricing**: Support for tiered pricing based on quantity.
- **Size and Volume Options**: Customizable product options for orders.
- **Pickup Location Selection**: Option for customers to select pickup locations for orders.
- **Order Status Persistence**: Database storage and API for tracking and updating order statuses.
- **Unread/Read Indicator System**: Visual indicators for unread messages and new orders, with persistence.
- **SSR OpenGraph Meta Tags**: Product (`/listing/`), shop (`/shop/`, `/shop/.../`), marketplace seller (`/marketplace/`), and community (`/communities/`) pages use `getServerSideProps` to fetch entity data from the PostgreSQL cache and render `og:title`, `og:description`, `og:image`, and Twitter Card meta tags server-side. This ensures social media crawlers (which don't execute JS) see personalized link previews. Single-entity DB query functions in `utils/db/db-service.ts` (`fetchProductByIdFromDb`, `fetchProductByDTagAndPubkey`, `fetchProductByTitleSlug`, `fetchShopProfileByPubkeyFromDb`, `fetchProfilePubkeyByNameSlug`, `fetchShopPubkeyBySlug`, `fetchCommunityByPubkeyAndIdentifier`). SSR OG data flows from `getServerSideProps` → `pageProps.ogMeta` → `DynamicHead` component (via `_app.tsx`). Shared OG type/defaults in `components/og-head.tsx`.
- **Free Shipping Threshold**: Merchants can set a minimum order amount (with currency) in their shop profile settings. When a buyer's cart subtotal from a seller meets or exceeds the threshold, shipping costs for that seller's items are waived. Features include: shop profile form fields (`freeShippingThreshold`, `freeShippingCurrency` in `ShopProfile` type), a slide-in notification on add-to-cart (`components/free-shipping-notification.tsx` using Framer Motion), per-seller progress bars on the cart page, automatic shipping cost waiver in `cart-invoice-card.tsx` for all order types (shipping/combined/pickup selection), and strikethrough original shipping cost with "Free" badge on the order summary page.

### MCP Server (AI Agent Integration)

The platform exposes a Model Context Protocol (MCP) server enabling AI agents to programmatically participate in the marketplace as both buyers and sellers. Agents can browse products, place orders, create listings, manage shop profiles, upload media, send encrypted DMs, publish reviews, manage communities, configure relays/blossom servers, handle discount codes, and manage Cashu wallets — all using their Nostr keys for event signing.

#### Architecture

- **MCP Endpoint**: `pages/api/mcp/index.ts` — Streamable HTTP transport endpoint handling MCP protocol messages
- **Server Factory**: `mcp/server.ts` — Creates the MCP server with registered tools and resources
- **Read Tools**: `mcp/tools/read-tools.ts` — Tools for browsing products, companies, reviews, and discount codes
- **Write Tools**: `mcp/tools/write-tools.ts` — Tools for full marketplace participation (profiles, listings, reviews, DMs, media, relay/blossom config, discount codes, Cashu wallet)
- **Purchase Tools**: Inline in `pages/api/mcp/index.ts` — Order creation, status, payment verification
- **Resources**: `mcp/resources.ts` — MCP resources (product catalog via `shopstr://catalog/products`)
- **Nostr Signing**: `utils/mcp/nostr-signing.ts` — Server-side Nostr event signing (`McpNostrSigner`), relay management (`McpRelayManager`), encrypted nsec storage, and `signAndPublishEvent()` utility
- **Auth Middleware**: `utils/mcp/auth.ts` — API key generation, validation, request authentication, nsec storage/retrieval, and `getAgentSigner()` for server-side signing
- **Metrics**: `utils/mcp/metrics.ts` — Request tracking, latency percentiles, rate limiting
- **API Key Management**: `pages/api/mcp/api-keys.ts` — CRUD endpoints for API keys
- **Order API**: `pages/api/mcp/create-order.ts` — Order creation, status, and listing endpoint
- **Payment Verification**: `pages/api/mcp/verify-payment.ts` — Lightning payment verification
- **Onboarding**: `pages/api/mcp/onboard.ts` — Zero-touch agent registration with optional nsec storage
- **Set Nsec**: `pages/api/mcp/set-nsec.ts` — Endpoint for agents to securely set their nsec after onboarding
- **Status**: `pages/api/mcp/status.ts` — Service health and metrics
- **Agent Manifest**: `pages/api/.well-known/agent.json.ts` — Machine-readable service description (v2.0.0)
- **Settings UI**: `pages/settings/api-keys.tsx` — UI page for managing API keys

#### Available MCP Tools

**Read Tools (any valid key):**

- `search_products` — Search/filter products by keyword, category, location, price range
- `get_product_details` — Get full details for a product by ID
- `list_companies` — List all seller/shop profiles
- `get_company_details` — Get a company's profile, products, and reviews
- `get_reviews` — Get reviews for a product or seller
- `check_discount_code` — Validate a discount code
- `get_payment_methods` — Get available Bitcoin payment methods for a seller
- `get_storefront` — Look up a seller's storefront by slug or pubkey; returns storefront config, products, and custom domain info

**Purchase Tools (requires read_write or full_access):**

- `create_order` — Place an order with payment method selection (`lightning`/`cashu`), product spec selection (`selectedSize`/`selectedVolume`/`selectedBulkUnits`), and optional `shippingAddress`
- `verify_payment` — Verify Lightning invoice payment status
- `get_order_status` — Check order status
- `list_orders` — List orders as buyer
- `list_seller_orders` — List incoming orders as seller, with optional status filter
- `get_notifications` — Check for new activity: unread message count, recent orders as buyer/seller, and `actionRequired` summary (pending payments, orders to fulfill, unread messages)

**Write Tools (requires full_access + stored nsec):**

- `set_user_profile` — Create/update Nostr user profile (kind 0) including `fiat_options` and `payment_preference`
- `set_shop_profile` — Create/update shop profile (kind 30019) with full storefront config (colors, layout, fonts, sections, pages, footer, nav, slug)
- `register_shop_slug` — Register, update, or delete the seller's shop URL slug in the DB
- `create_product_listing` — Publish product listing (kind 30402) with full tag support including sizes, volumes, bulk/bundle pricing, pickup locations, and expiration
- `update_product_listing` — Update existing listing by d-tag, supports all fields including sizes, volumes, bulk pricing, pickup locations, and expiration
- `delete_listing` — Delete events (kind 5)
- `publish_review` — Publish review (kind 31555) with ratings
- `create_community_post` — Post to communities (kind 1111), supports replies
- `send_direct_message` — Send encrypted NIP-17 gift-wrapped DMs (kind 1059/13/14), supports order messages and listing inquiries
- `set_relay_list` — Publish relay list (kind 10002, NIP-65)
- `set_blossom_servers` — Publish blossom server list (kind 10063)
- `upload_media` — Upload to Blossom servers with signed auth (kind 24242)
- `create_discount_code` — Create shop discount codes
- `delete_discount_code` — Delete discount codes
- `list_discount_codes` — List shop discount codes
- `get_cashu_balance` — Check Cashu wallet balance from proof events (kind 7375)
- `receive_cashu_tokens` — Receive and store Cashu tokens (kind 7375)
- `set_cashu_mints` — Configure wallet mints (kind 17375)
- `send_cashu_payment` — Melt tokens to pay Lightning invoices
- `update_order_address` — Change shipping address post-purchase, sends encrypted address change DM to seller and updates order record
- `send_shipping_update` — Send shipping info (tracking number, carrier, ETA) to buyer via encrypted DM and update order status to shipped
- `update_order_status` — Update order status (confirmed/shipped/delivered/completed/cancelled) with optional notification DM to buyer
- `list_messages` — Fetch and decrypt incoming NIP-17 DMs with filters for unread, subject type, and sender. Returns decrypted content, subject, order IDs, and read status
- `mark_messages_read` — Mark specific messages as read by event ID

#### Payment Methods

- **Lightning**: Generates a Cashu mint quote (bolt11 invoice) via `@cashu/cashu-ts`. Agent pays the invoice, then calls `verify_payment` to confirm. Default mint: `https://mint.minibits.cash/Bitcoin`.
- **Cashu**: Agent provides a serialized Cashu token string. Server verifies and redeems the tokens.

#### Permission Levels

- `read` — Browse-only access (search products, view profiles/reviews)
- `read_write` — Browse + purchase (place orders, verify payments)
- `full_access` — Full marketplace participation (all read/write tools + server-side Nostr event signing). Requires nsec stored during onboarding or via `/api/mcp/set-nsec`.

#### Server-Side Nostr Signing

Agents with `full_access` permission have their Nostr private key (nsec) stored encrypted in the database using AES-256-GCM. The encryption key is configured via the `MCP_ENCRYPTION_KEY` environment variable. The `McpNostrSigner` class provides `sign()`, `encrypt()`, `decrypt()`, and `getPubKey()` methods without browser dependencies. Events are signed server-side, cached to the database, and published to relays via `McpRelayManager` (using `nostr-tools` SimplePool).

#### Database Tables

- `mcp_api_keys` — API keys with hashed secrets, permissions (read/read_write/full_access), usage tracking, and optional encrypted_nsec for server-side signing
- `mcp_orders` — Orders placed through the MCP/API with payment and status tracking

#### Authentication

API keys are created via the `/settings/api-keys` UI page, the `/api/mcp/api-keys` endpoint, or the zero-touch `/api/mcp/onboard` endpoint. Keys use PBKDF2 hashing and Bearer token authentication. Three permission levels: `read` (browse only), `read_write` (browse + purchase), and `full_access` (full marketplace participation with Nostr signing). Key prefix: `sk_`. Agents can set their nsec post-onboarding via `POST /api/mcp/set-nsec`.

### Order Address Change

Buyers can change the shipping address for their orders from the Orders Dashboard. The address column shows a "Change Address" link for purchases (non-sale orders) that have an address. Clicking it opens the `AddressChangeModal` (`components/utility-components/address-change-modal.tsx`), which sends a gift-wrapped Nostr DM to the seller with the new address and updates the local order state.

### Subdomain Shop / Storefront System

Sellers can configure branded storefronts accessible at `/shop/[slug]` URLs. The system allows full customization of the buyer's shopping experience.

#### Architecture

- **Storefront Routes**: `pages/shop/[slug].tsx` (shop home), `pages/shop/[...shopPath].tsx` (sub-pages: orders, wallet, community, custom pages)
- **Storefront Layout**: `components/storefront/storefront-layout.tsx` — Full-featured storefront with navbar, hero, product grid, sections, and footer. Applies CSS variables for theming and adds `sf-active` class to body to hide the global Shopstr nav.
- **Theme Wrapper**: `components/storefront/storefront-theme-wrapper.tsx` — Wraps existing pages (like `/listing`) when visited from a storefront context. Uses `sessionStorage` key `sf_seller_pubkey` to detect the active storefront.
- **Proxy/Middleware**: `proxy.ts` — Extended with subdomain routing: `*.shopstr.market` subdomains rewrite to `/shop/[subdomain]`.

#### Storefront Config (stored in ShopProfile.content.storefront)

- `colorScheme` — Custom colors (primary, secondary, accent, background, text)
- `productLayout` — `grid` | `list` | `featured`
- `landingPageStyle` — `hero` | `classic` | `minimal`
- `shopSlug` — URL slug (registered via `/api/storefront/register-slug`)
- `customDomain` — Custom domain (configured via `/api/storefront/custom-domain`)
- `fontHeading` / `fontBody` — Google Fonts selection
- `sections` — Ordered list of landing page sections
- `pages` — Custom pages with own sections
- `footer` — Footer config (text, social links, nav links, Powered by Shopstr)
- `navLinks` — Custom navigation links
- `showCommunityPage` / `showWalletPage` — Toggle pages

#### Section Types

12 section types in `components/storefront/sections/`: `hero`, `about`, `story`, `products`, `testimonials`, `faq`, `ingredients`, `comparison`, `text`, `image`, `contact`, `reviews`. Rendered by `components/storefront/section-renderer.tsx`.

#### Helper Components

- `storefront-hero.tsx` — Full-width hero with banner, picture, and CTA
- `storefront-footer.tsx` — Customizable footer with social links, "Powered by Shopstr"
- `storefront-product-grid.tsx` — Paginated product grid/list/featured layout
- `storefront-community.tsx` — Community feed for the shop's NIP-72 community
- `storefront-wallet.tsx` — Embedded Cashu wallet page
- `storefront-orders.tsx` — Embedded orders page (dynamic import)
- `storefront-my-listings.tsx` — Seller's own listings (visible to shop owner)
- `storefront-order-confirmation.tsx` — Post-purchase confirmation with upsells
- `section-renderer.tsx` — Dispatches to correct section component by type

#### API Routes

- `GET /api/storefront/lookup?slug=` — Look up pubkey by shop slug
- `POST /api/storefront/register-slug` — Register/update a shop slug
- `POST /api/storefront/custom-domain` — Register custom domain + return DNS instructions
- `GET/DELETE /api/storefront/custom-domain?pubkey=` — Get or remove custom domain

#### Database Tables

- `shop_slugs` — Maps pubkey → slug (one per seller, unique constraint on slug)
- `custom_domains` — Maps pubkey → custom domain (verified flag)

#### Settings UI

Shop profile settings (`/settings/shop-profile`) now uses `ShopProfileForm` component from `components/settings/shop-profile-form.tsx` with two tabs:

1. **Basic Info** — Name, about, banner, picture, free shipping threshold
2. **Storefront** — Shop URL slug, landing page style, product layout, color scheme (with 7 presets), typography, navigation links, homepage sections builder, custom pages, community/wallet toggles, footer editor, custom domain, preview modal, remove storefront

Storefront editor sub-components (in `components/settings/storefront/`):

- `section-editor.tsx` — Accordion-style editor for all 12 section types with type-specific fields
- `footer-editor.tsx` — Footer text, social links, nav links, "Powered by Shopstr" toggle
- `page-editor.tsx` — Custom page management with slug auto-generation
- `storefront-preview-modal.tsx` — Approximate live preview modal with all color/font/layout settings

#### Cart Page Storefront Integration

`pages/cart/index.tsx` wrapped in `StorefrontThemeWrapper` — reads `sf_seller_pubkey` from sessionStorage, filters cart items to only show the active storefront seller's items, shows a banner if other sellers' items were excluded, and wraps the full page with the storefront nav/footer.

#### Custom Domain Page

`pages/shop/_custom-domain.tsx` — Shopstr-branded landing page for custom domains; looks up shop by domain via `/api/storefront/lookup?domain=`, shows `ShopstrSpinner` while loading, falls back to "Visit Shopstr" link if domain not found.

#### Profile Dropdown

`components/utility-components/profile/profile-dropdown.tsx` updated to add `storefront` key (GlobeAltIcon) that links to the seller's storefront if configured, with neo-brutalist styling.

## External Dependencies

- **Nostr Protocol Libraries**: `nostr-tools`, `@getalby/lightning-tools`.
- **Payment & Wallet Integration**: `@cashu/cashu-ts`, Lightning Address support (via Alby tools).
- **MCP**: `@modelcontextprotocol/sdk` for AI agent integration.
- **Database**: `pg` (PostgreSQL) for server-side caching and MCP data.
- **UI & Styling**: `@heroui/react` (HeroUI v2), `@heroicons/react`, Tailwind CSS v4, Framer Motion v12.
- **Media & Content**: `qrcode`, `react-responsive-carousel`, `@braintree/sanitize-url`.
- **Cryptography**: `crypto-js`.
- **Relay Infrastructure**: Default and user-configurable Nostr relays, multi-relay broadcast, subscription management.
- **Blossom Media Servers**: User-configurable Blossom server list for decentralized media.
