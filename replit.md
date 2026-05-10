# Overview

Milk Market is a permissionless Nostr-based marketplace specializing in raw milk and related products, with Bitcoin (Lightning, Cashu), Stripe, and fiat payment support. It implements 15+ NIPs for decentralized profiles, listings, messaging, reviews, and social graph, with PostgreSQL caching for SSR and analytics. Sellers can run customizable storefronts; buyers can check out as guests or with Nostr keys; AI agents can participate via the MCP API.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend

- **Stack**: Next.js 16 (App Router) + TypeScript v4, React 19, HeroUI, Tailwind CSS, Framer Motion, PWA.
- **State**: React Context per domain (products, profiles, shops, chats, reviews, follows, relays, media, wallet, communities). Local storage for prefs/auth, service worker for caching.
- **Routing**: Friendly slugs for listings (title-based) and profiles (name-based) with pubkey disambiguation; naddr/npub URLs redirect to slugs. Utilities in `utils/url-slugs.ts`.
- **SSR OpenGraph**: `/listing/`, `/shop/`, `/marketplace/`, `/communities/` pages fetch from PostgreSQL in `getServerSideProps` and inject `og:*` / Twitter Card meta via `pageProps.ogMeta` → `DynamicHead` (`_app.tsx`). Helpers in `utils/db/db-service.ts`, shared types in `components/og-head.tsx`.

## Backend

- Next.js API routes, PostgreSQL, Formidable for uploads, custom middleware for routing.

## Authentication & Signing

- **Signers**: NIP-07, NIP-46, direct nsec (with ncryptsec auto-detection on sign-in). NIP-49 encrypted storage with auto-migration.
- **Account Recovery**: For email and nsec-with-email users. 24-char segmented recovery key (e.g. `XXXX-XXXX-...`) generated at email signup or via profile settings, downloadable as `.txt`. Flow: email-verification token → recovery key + new password/passphrase → re-encrypted nsec.
  - Tables: `account_recovery`, `account_recovery_tokens`, `recovery_email_verifications`.
  - API: `setup-recovery`, `check-recovery`, `request-recovery`, `verify-recovery-token`, `reset-password`, `send-recovery-verification`.
  - UI: `RecoveryKeyModal`, `/auth/recover`, "Forgot password?" in `SignInModal`, recovery section in profile settings. Helpers in `utils/auth/recovery.ts`.
  - Security: `crypto.randomBytes` RNG; PBKDF2 with 600,000 iterations (back-compat with 1,000); per-route rate limiting (`utils/auth/rate-limit.ts`); email verification required; `check-recovery` returns masked email; `reset-password` is no-cache. Recovery page labels fields "password" vs "passphrase" depending on auth type.

## Nostr Protocol

- Implements 15+ NIPs: profiles (NIP-01, NIP-05), marketplace (NIP-99), DMs (NIP-17), media (Blossom), reviews (NIP-85), social graph (NIP-02, NIP-51), relay lists (NIP-65).
- Event caching is hybrid (IndexedDB + Postgres + live relays). Kind 1111 events disambiguated by tags: NIP-22 review replies (`K` tags) → `comment_events`; community posts (`a:34550:...`) → `community_events`. Community posts (1111) and approvals (4550) are cached on fetch and loaded DB-first via `fetchCommunityPostsFromDb` / `pages/api/db/fetch-community-posts.ts`.
- File storage: Blossom servers. Encryption: NIP-44 for DMs and documents.

## Order Messages & Payment Tags

- **Payment method names**: `resolveExplicitPaymentMethod()` in `utils/messages/order-message-utils.ts` is the canonical mapper (`stripe`→`Card`, `nwc`→`NWC`, `paypal`→`PayPal`, etc.). Used by orders dashboard, both order email APIs, and order-summary pages. Unknown types are title-cased on word boundaries. Order-summary pages add descriptive labels (e.g. `Lightning`→`Lightning Network`, `Card`→`Credit Card (Stripe)`).
- **Currency**: Orders dashboard reads the `["currency", ...]` tag from the order message first, falling back to the listing's currency, so the right currency shows even after the listing is deleted or the order paid in a different currency.
- **Shipping tags**: Strict 4-tuple `["shipping", type, cost, currency]` validated against `SHIPPING_OPTIONS` in `utils/parsers/product-tag-helpers.ts`. `getEffectiveShippingCost()` returns 0 for `Free`/`Free/Pickup`/`Pickup`/`N/A` and for `Added Cost/Pickup` when pickup is selected.
- **Order grouping & dedupe**: `buildOrderGroupingKey()` keys on product ref + amount + fulfillment target. `getOrderConsolidationKey()` + `registerTaggedOrderGroupingKey()` dedupe across explicit order tags and computed keys.
- **Subject routing**: `messages.tsx` routes order subjects (`order-payment`, `order-info`, `payment-change`, `order-receipt`, `shipping-info`, `order-completed`, `zapsnag-order`, `address-change`) to the Orders chat tab. `chat-panel.tsx` emits `order-completed` on delivery; `ZapsnagButton.tsx` includes full order metadata so zapsnag orders display correctly. MCP `create-order.ts` `sendOrderEmail()` passes full order metadata (shipping, variants, productId, quantity) for complete buyer/seller emails.

## Payment Systems

### Lightning & Cashu

- **Lightning**: Direct invoice generation and verification.
- **Cashu**: Uses `@cashu/cashu-ts` v4.1.0 (`Mint`/`Wallet`/`Keyset`, bolt11-suffixed quote helpers, `Amount` boundary type with `.toNumber()`, `KeyChain.getKeysets()`, explicit `await wallet.loadMint()`, `getDecodedToken(token, keysetIds)` requires the second arg).
- **Proof amount JSON gotcha**: Proofs persisted to `localStorage["tokens"]` lose the `Amount` wrapper on JSON round-trip and come back as plain `number`. Code reading from `getLocalStorageData().tokens` must use `proofAmountToNumber` / `sumProofAmounts` from `utils/cashu/proof-amount.ts` instead of `.amount.toNumber()` (used by `pages/wallet/index.tsx`, `components/storefront/storefront-wallet.tsx`, and the `filteredProofs` reduce in `components/wallet/pay-button.tsx`).
- **Hardening utilities** (`utils/cashu/`): `mint-retry-service` (`withMintRetry`, rate-limit-aware backoff), `swap-retry-service` (`safeSwap` → `{status, proofs}`), `melt-retry-service` (`safeMeltProofs` → `{status, changeProofs, errorMessage}`), `pending-mint-operations` (DB-backed `pending_mint_quotes` for orphan recovery), `wallet-recovery` (boot-time reconciler mounted via `components/utility-components/mint-recovery-boot.tsx`). All cashu call sites in `components/wallet/*`, `cart-invoice-card.tsx`, `product-invoice-card.tsx`, `claim-button.tsx`, `mcp/tools/write-tools.ts`, and `pages/api/mcp/{create-order,verify-payment}.ts` use these wrappers and check melt/swap status before treating the operation as successful.

### Stripe Connect

- **Express Connect** with embedded Stripe Elements (PaymentIntent API) for on-site checkout. Card form: `components/utility-components/stripe-card-form.tsx`. PaymentIntent API: `pages/api/stripe/create-payment-intent.ts`.
- **Currency utils** (`utils/stripe/currency.ts`): `satsToUSD`, `isCrypto`, `toSmallestUnit`, `convertToSmallestUnit`, `ZERO_DECIMAL_CURRENCIES`. Live BTC→fiat via `@getalby/lightning-tools` (no hardcoded fallback). Stripe payments use the native fiat currency directly (EUR/INR/GBP/etc.); only sats/BTC are converted to USD.
- **Webhooks**: `webhook.ts` and `subscription-webhook.ts` require `STRIPE_WEBHOOK_SECRET` / `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` and reject unverified payloads. Both dedupe via `claimStripeEvent` (table `stripe_processed_events`, fail-open). Both honor `application_fee.created`/`application_fee.refunded` for donation reconciliation (`STRIPE_DONATION_COLLECTED`/`STRIPE_DONATION_REFUNDED` log lines).
- **Retries & idempotency**: `withStripeRetry` (`utils/stripe/retry-service.ts`) wraps API calls. All PaymentIntent / Subscription / Invoice / Transfer create calls include a deterministic `stableIdempotencyKey()` so client-side retries dedupe at Stripe within its 24h window.
- **Pending payments & failures**: Tracked in `stripe_pending_payments` (`utils/stripe/pending-payments.ts`); webhook updates status. Failed payments email both parties (`sendPaymentFailedToBuyer`/`Seller`); transfer failures alert platform admin (`sendTransferFailureAlert`).
- **Cron cleanup** (`pages/api/stripe/cron-cleanup.ts`, gated by `FLOW_PROCESSOR_SECRET`): prunes `stripe_processed_events` >45d (Stripe's replay window is ~30) and terminal-status `stripe_pending_payments` (`succeeded`/`failed_terminal`/`abandoned`) >30d. Active rows (`creating`/`created`) are preserved. Per-call overrides: `processed_events_max_age_days` / `pending_payments_max_age_days` (min 7 each).

### Donations (Milk Market platform fee)

- **Field**: Sellers' donation percent lives in the Nostr profile JSON under `mm_donation` (was `shopstr_donation` upstream). Defaults to 2.1% when absent — no fallback to the legacy key. Profile form writes only `mm_donation` and strips stale `shopstr_donation` on save.
- **Cashu/Lightning**: Donation eCash sent to `process.env.NEXT_PUBLIC_MILK_MARKET_PK`; skipped with a warn if unset.
- **Stripe parity**: `utils/stripe/donation.ts` reads the seller's `mm_donation` from cached `profile_events` (kind=0), defaults to 2.1%, caches per-seller for 5 min, skips when seller equals `NEXT_PUBLIC_MILK_MARKET_PK`, and falls back to no fee when the cut would be ≥ gross. Wiring:
  - `create-payment-intent.ts` adds `application_fee_amount` for single-merchant direct charges and embeds per-seller `donationPercent`/`donationCutSmallest` into multi-merchant `sellerSplits` metadata.
  - `process-transfers.ts` withholds the cut from each `Transfer.amount` (preferring embedded values, falling back to a fresh profile lookup).
  - `create-subscription.ts` and `create-cart-subscription.ts` set `application_fee_percent` on direct-charge subscriptions; `create-invoice.ts` sets `application_fee_amount` on direct-billed invoices; multi-merchant cart-subscription helper enriches `sellerSplits` for downstream invoice-paid transfers.
  - **Dashboard parity**: Stripe success handlers in `cart-invoice-card.tsx` and `product-invoice-card.tsx` compute the donation from the cached profile and pass `donationAmountValue`/`donationPercentageValue` into every `sendPaymentAndContactMessage`. The shared helper in `utils/nostr/nostr-helper-functions.ts` emits a `donation_amount` tag, so the orders dashboard renders the donation row for Stripe orders the same as Cashu/Lightning.
- Platform-account selling-to-itself is a no-op everywhere.

### Multi-currency & cart math

- Cart display currency = most common currency among items (tiebreak: USD > sats > alphabetical). Mixed carts convert via `@getalby/lightning-tools`. Zero-decimal currencies (JPY/KRW/etc.) handled correctly. Bitcoin/Lightning always sats; Lightning buttons show fiat amount + sats estimate for fiat-priced products. Sats-only carts show USD estimate on Stripe/fiat buttons.
- `nativeTotalCost` and `nativeCostsPerProduct` are async (`useEffect`+state) to support cross-currency conversion.
- `process-transfers.ts` reads currency from the PaymentIntent for multi-merchant transfers; subscription-renewal transfers read it from the invoice. Order messages include `["currency", ...]` and `["amount", ...]` tags. Subscriptions are `pending` until the first successful payment activates them via the subscription webhook.
- **Round-up policy**: All conversions and on-the-wire charge math use `Math.ceil` (never `round`/`floor`) so users are never quoted less than charged. Applied across `pages/cart/index.tsx`, `pages/api/mcp/create-order.ts`, and `cart-invoice-card.tsx` seller-payout splitting. Stripe charges below the gateway floor surface a transparent "$0.50 minimum" banner.

### Fiat & multi-merchant fiat

- Manual methods: Venmo, Zelle, Cash App, PayPal, Apple Pay, Google Pay, Cash. Multi-merchant fiat checkout: each seller gets their own dropdown, per-merchant instructions/amounts, individual confirmation checkboxes. Order is only confirmed when all checkboxes are checked. Single-merchant carts retain the original single-dropdown flow.

### API rate limiting

- All public `pages/api/**` endpoints use the in-memory token bucket in `utils/rate-limit.ts` (`checkRateLimit`, `applyRateLimit`, `getRequestIp`) keyed by client IP, with standard `X-RateLimit-*` headers and `Retry-After` on 429. Per-process buckets, so under horizontal scaling the effective ceiling is `N × limit` (intentional coarse DB-pool guard, not a strict ceiling). Coverage extends to `pages/api/stripe/**` and the secret-gated cron endpoints (`email/flows/process`, `email/flows/cron-abandoned-cart`, `email/flows/cron-winback`, `stripe/cron-cleanup`); webhooks rely on signature + Stripe-event idempotency instead.

### Runtime & domain

- Node `>=22.4.0` (`.nvmrc` = `22`); `@cashu/cashu-ts` pinned to `4.1.0`.
- Storefront custom-domain verification (`pages/api/storefront/verify-domain.ts`) targets `milk.market` (CNAME + A-record fallback). OG crawler (`pages/api/og-preview.ts`) UA: `MilkMarket/1.0 (+https://milk.market)`.

## Inventory Management

- **Centralized**: Postgres `inventory` (product_id, seller_pubkey, variant_key, quantity, source) + `inventory_log` (audit trail). Variant keys: `_default` for global, `size:Name` for per-size.
- **Auto deduction**: All order flows (MCP Stripe/Lightning/Cashu/Fiat, frontend checkout, cart) deduct on success. Bulk/bundle orders multiply bundle size × quantity (e.g. 2 orders of a 5-pack = 10 units).
- **Seller override**: Publishing a kind 30402 with quantity tags syncs inventory with `source: 'seller_override'`.
- **API**: `/api/inventory` actions: `check`, `deduct`, `set`, `restore`, `sync`. Service: `utils/db/inventory-service.ts` (`getStock`, `getAllStock`, `setStock`, `deductStock`, `restoreStock`, `syncFromNostrEvent`, `checkAvailability`).
- **Integration points**: `mcp/create-order.ts` (stock check + deduction), `mcp/verify-payment.ts` (deduction on Lightning confirm), `email/send-order-email.ts` (frontend orders), `db-service.ts` `cacheEvent()` (auto-sync on product cache), `ZapsnagButton.tsx` (sold count from central inventory), `cart-invoice-card.tsx` (per-product deduction on cart payment confirm).
- MCP availability checks consult the inventory table first, falling back to Nostr event quantities for untracked products.

## Trust & Reviews

- **Social graph**: Follow-based trust with WoT filtering.
- **Reviews**: Weighted scoring with sentiment quality labels (Trustworthy/Solid/Questionable/Don't trust) and color coding. Sellers reply via NIP-22 (kind 1111) using `publishReviewReply`. Replies render across checkout card, marketplace, and storefront via `components/utility-components/seller-review-reply.tsx`. Stored in `ReviewsContext` (`reviewEventIds`, `reviewReplies`); reply events cached in `comment_events`.

## Key Features

- **Order Summary Page** (`pages/order-summary/index.tsx`): Post-purchase page with product, cost, payment, and shipping details. Free-shipping displays use the order's actual currency.
- **Email Notifications & Guest Checkout**: SendGrid for order/seller/shipping emails; guest purchases via email.
- **Custom Email Flows**: Sellers manage automated sequences (welcome series, abandoned cart, post-purchase, winback).
  - Each flow has timed steps with subject + HTML body. Merge tags: `{{buyer_name}}`, `{{shop_name}}`, `{{product_title}}`, `{{order_id}}`, `{{product_image}}`, `{{shop_url}}`. Default templates included for all 4 flow types.
  - Triggers: post-purchase + welcome auto-trigger on order. Abandoned-cart cron (`pages/api/email/flows/cron-abandoned-cart.ts`) scans `cart_reports` for stale unenrolled carts (default 60min). Winback cron (`pages/api/email/flows/cron-winback.ts`) finds inactive customers (default 30d). Both gated by `FLOW_PROCESSOR_SECRET`. Cart activity is reported per-merchant from `cart-invoice-card.tsx` when buyer's email is known.
  - Tables: `email_flows`, `email_flow_steps`, `email_flow_enrollments`, `email_flow_executions`, `cart_reports`. DB helpers: `getUnenrolledAbandonedCarts()`, `markCartEnrolled()`, `getWinbackCandidates()`. Routes under `pages/api/email/flows/`. Templates + merge rendering in `utils/email/flow-email-templates.ts`.
  - Visual builder: `components/settings/flow-step-editor.tsx` (heading/paragraph/bold/italic, Blossom image upload, link, CTA button, divider, raw HTML toggle, live preview, clickable merge tags). Per-flow sender settings (`from_name`, `reply_to` columns on `email_flows`) customize SendGrid `from` and `replyTo`. Flow deletion cascades transactionally; step update/delete verifies step belongs to the flow (cross-flow auth bypass guard).
  - MCP tools: `create_email_flow`, `list_email_flows`, `update_email_flow`, `delete_email_flow`, `toggle_email_flow`, `get_email_flow_stats`. Internal scheduler (`utils/email/flow-scheduler.ts`) auto-starts via `instrumentation.ts`: processor every 2 min, abandoned-cart every 30 min, winback once daily. Disabled gracefully if `FLOW_PROCESSOR_SECRET` is unset.
- **Inquiry Email Notifications**: Direct inquiry DMs trigger emails to recipients with email on file. Reply-to set to sender's email if available; otherwise email tells recipient to reply via Inquiries chat. If neither party has email, no email is sent. Template `inquiryNotificationEmail`, service `sendInquiryNotification`, route `/api/email/send-inquiry-email`. Triggered from `messages.tsx` after gift-wrapped DM send.
- **Return/Refund/Exchange Requests**: Buyers request from orders dashboard via modal (request type + editable default message). Sends gift-wrapped DM with subject `return-request` + email via `/api/email/send-return-request-email`. Buyer sees "Return Requested" status; sellers see an alert badge. Request type stored in the `status` tag. Template `returnRequestEmail`, service `sendReturnRequestToSeller`.
- **Stripe Connect Onboarding**: Stripe Connect endpoints (`create-account`, `create-account-link`, `account-status`) use the mandatory `McpRequestProof` signed-event auth (same as MCP API key endpoints) — proof builders in `utils/mcp/request-proof.ts`, server-side verification via `verifyAndConsumeSignedRequestProof` in `utils/mcp/request-proof-server.ts`.
- **Bulk/Bundle Pricing**: Global and per-variant tiered pricing. Tag format: `["bulk", units, price]` global, `["bulk", units, price, variantName]` variant-specific. The bundle selector only appears when the selected variant has bulk tiers. Parsed into `bulkPrices` (global) and `variantBulkPrices` (`Map<string, Map<number, number>>`). Switching variant resets bulk selection.
- **Variants & Pickup**: Size, volume, weight (with per-weight pricing), and pickup-location selection are integrated into order messages and the dashboard. Order status is persisted with a priority system to prevent downgrades.
- **Unread/Read Indicators**: Track read status for messages and orders, with visual indicators and auto-mark.
- **Image Compression**: Auto-compress large images (WebP + scaling) before Blossom uploads.
- **Subscribe & Save (Recurring Subscriptions)**: Configurable subscription pricing (weekly / 2-week / monthly / 2-month / quarterly) with discount %. Product pages show two pricing cards (Subscribe & Save + One-Time). Checkout creates Stripe Subscriptions on connected accounts (guest buyers must provide email). Renewal reminders via email + Nostr DMs one week before billing; address changes notify sellers via gift-wrapped DMs. Buyers manage subscriptions via Orders tab (or via email lookup for guests). Cart supports mixed subscription + one-time items via `pages/api/stripe/create-cart-subscription.ts` (single Stripe invoice). Multi-merchant subscriptions use platform charging + transfers when all sellers have Stripe.
- **Cart Multi-Payment Support**: Card payment when all merchants have Stripe — single-merchant uses direct charges; multi-merchant uses Separate Charges and Transfers (`pages/api/stripe/process-transfers.ts`). Fiat options only for single-merchant carts. Bitcoin (Lightning, Cashu, NWC) always available. When any product has an active subscription selection, only card is available. Subscription-renewal multi-merchant payouts handled by the Stripe webhook.
- **Free Shipping Threshold**: Per-merchant minimum (`freeShippingThreshold` + `freeShippingCurrency` in Kind 30019 JSON). When met, all shipping from that seller drops to zero. Shipping consolidates per seller (highest cost, not sum). Progress bars in cart/checkout, popup notification when adding eligible items, strikethrough on order summary with green "Free" badge.
- **Payment Method Discounts**: Flat percent discounts per method (`paymentMethodDiscounts` in Kind 30019 JSON, mapping `bitcoin`/`stripe`/`cash`/`venmo`/etc. → percent). Discounted prices appear on payment buttons with "(X% off)" labels; actual invoice amount reflects the method-specific discount.
- **Herdshare Agreement Management**: Column in orders dashboard for signing/viewing herdshare agreements via PDFAnnotator.
- **Landing Page**: Redesigned per YC best practices (clear CTA, outcome-first headline, social proof, simplified sections).

## Shopify → Milk Market Migration

Sellers can import a Shopify product CSV export and republish as NIP-99 listings (kind 30402).

- **Entry points**: (1) Settings → Market Stall → Products & Discounts has an "Import from Shopify" button + dismissible tooltip; (2) the landing footer "Migrate from Shopify" link routes through onboarding (`migrate=shopify` param propagated through new-account → market-profile → shop-profile → stripe-connect → `/settings/stall?tab=products&migrate=shopify`) which auto-opens the modal. Already signed-in users hitting `/onboarding/new-account` are redirected to the stall page so existing keys aren't regenerated.
- **Modal**: 4-step flow (Upload → Configure → Review → Publish) in `components/stall/shopify-migration-modal.tsx`.
- **Parsing & mapping**: `utils/migrations/shopify-csv-parser.ts` groups variants by `Handle`. `utils/migrations/shopify-to-nip99.ts` maps to NIP-99, surfaces a price-variance warning when variants have different prices, omits `quantity` entirely when total inventory is 0 (so untracked items don't publish as out-of-stock), and supports per-variant `size` tags.
- **Image rehosting**: `utils/migrations/rehost-images.ts` re-uploads remote image URLs to the seller's Blossom servers during publish so listings keep working after Shopify is decommissioned; failures fall back to the original URL with a per-listing warning. The Done step shows a "Retry N failed" button that re-runs only the failed items.

## Seller Storefronts

Sellers run customizable standalone shops at `/shop/[slug]`. Custom domains available on request.

- **Customization**: color scheme (with per-color usage hints), independent navbar colors (background/text/accent), independent footer colors (background/text/accent), landing page style, product layout, Google Fonts or custom uploaded fonts (`.woff2`/`.woff`/`.ttf`/`.otf` via Blossom), section-based page builder, multi-page navigation, custom footer with social links, store policies, optional neo-brutalist card shadows (`neoShadows` toggle in Kind 30019 — adds offset shadows on bordered cards/images using the storefront's secondary color, applied across the live storefront, product-page overlay, and editor previews).
- **Custom font scope**: When a seller sets a heading or body font, it cascades across the entire storefront (navbar, buttons, inputs, product cards, footer, community, wallet, orders) via root-level CSS in `storefront-layout.tsx`, `storefront-theme-wrapper.tsx`, `storefront-preview-panel.tsx`, and `storefront-preview-frame.tsx`. The body font is the default for all text; the heading font applies to all `h1`–`h6` and elements with `.font-heading`.
- **Markdown formatting**: `components/storefront/formatted-text.tsx` renders inline `*italic*`, `**bold**`, and `***bold italic***` for shop name (nav + footer + overlay nav), footer tagline, and the rest of the consumer-facing storefront text.
- **SEO & OG meta**: Per-storefront fields (meta title, meta description, OG image, keywords, locale, geo region, geo city). An "auto-generate" mode fills empty fields from shop name/about/slug at save time. SSR renders SEO meta in `getServerSideProps` for `[slug].tsx` and `[...shopPath].tsx`. `storefront-layout.tsx` also injects meta client-side via `<Head>`. Type: `StorefrontSeoMeta` in `packages/domain/src/storefront.ts`. Settings UI: "SEO & Open Graph" section in `shop-profile-form.tsx`.
- **Built-in Shop Page**: Every storefront gets `/shop/[slug]/shop` with search, category filters (pill toggles based on actual product categories), location filter, sort options (newest/oldest/price/name), and paginated product grid styled with storefront colors. The "Shop" link is auto-injected into the navbar if not already present. Component: `components/storefront/storefront-shop-page.tsx`. Uses `productSatisfiesAllFilters` from `utils/parsers/product-filter-helpers.ts`. Preview panel mocks search/categories/grid for the shop page.
- **Independent Nav/Footer Colors**: `StorefrontNavColors` / `StorefrontFooterColors` types each carry `background`, `text`, `accent`.

# External Dependencies

## Nostr Infrastructure

- **Relays** for event publishing/subscription, **Blossom** for media, **NIP-05** DNS verification.

## Payment Services

- **Lightning** (invoice gen/verify), **Cashu Mints** (eCash), **Getalby Lightning Tools** (LN address utils), **Stripe** (Connect for cards), **SendGrid** (transactional email).

## Third-Party Libraries

- **Crypto**: `crypto-js`, `nostr-tools`, `@cashu/cashu-ts`.
- **UI**: `@heroui/react`, `@heroicons/react`, `framer-motion`.
- **Payments**: `stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`.
- **Files**: `pdf-lib`, `qrcode`.
- **MCP**: `@modelcontextprotocol/sdk`.

# MCP Server (AI Agent Integration)

The platform exposes a Model Context Protocol server enabling AI agents to participate as buyers and sellers — browse products, place orders, create listings, manage profiles, upload media, send DMs, publish reviews, manage communities, configure relays/blossom, handle discount codes, and manage Cashu wallets — all using their Nostr keys for signing.

## Architecture

- **Endpoint**: `pages/api/mcp/index.ts` — Streamable HTTP transport.
- **Server factory**: `mcp/server.ts`. Read tools: `mcp/tools/read-tools.ts`. Write tools: `mcp/tools/write-tools.ts`. Resources: `mcp/resources.ts` (catalog via `milkmarket://catalog/products`). Purchase tools inline in `pages/api/mcp/index.ts`.
- **Signing**: `utils/mcp/nostr-signing.ts` — `McpNostrSigner`, `McpRelayManager`, encrypted nsec storage, `signAndPublishEvent()`.
- **Auth**: `utils/mcp/auth.ts` — API key generation, validation, request authentication, nsec storage, `getAgentSigner()`. Keys use PBKDF2 hashing + Bearer auth, prefix `sk_`. Three permission levels: `read` (browse only), `read_write` (browse + purchase), `full_access` (full participation with server-side Nostr signing). Agents can set their nsec post-onboarding via `POST /api/mcp/set-nsec`.
- **Routes**: `api-keys.ts` (CRUD), `create-order.ts` (orders), `verify-payment.ts` (Lightning verify), `onboard.ts` (zero-touch registration), `set-nsec.ts`, `status.ts` (health/metrics).
- **Manifest**: `pages/api/.well-known/agent.json.ts` — machine-readable description (v2.0.0), surfaced via middleware rewrite. Settings UI: `pages/settings/api-keys.tsx`.
- **Tables**: `mcp_api_keys` (hashed secrets, permissions, usage, optional `encrypted_nsec`), `mcp_orders` (orders with payment + status).
- **Server-side signing**: `full_access` keys store nsec encrypted with AES-256-GCM (`MCP_ENCRYPTION_KEY`). `McpNostrSigner` provides `sign()`, `encrypt()`, `decrypt()`, `getPubKey()` without browser deps. Events sign server-side, cache to DB, publish via `McpRelayManager` (nostr-tools `SimplePool`).

## Tools

**Read** (any key): `search_products`, `get_product_details`, `list_companies`, `get_company_details`, `get_reviews`, `check_discount_code`, `get_payment_methods`. Responses include subscription info, variant options (sizes/volumes/weights/bulk), herdshare agreements, pickup locations, required customer info, payment method discounts, free shipping settings.

**Purchase** (`read_write`+): `create_order` (`stripe`/`lightning`/`cashu`/`fiat` payment, variant + bulk + shipping address selection), `verify_payment`, `get_order_status`, `list_orders`, `create_subscription` / `list_subscriptions` / `cancel_subscription` / `update_subscription`, `list_seller_orders`, `get_notifications` (unread + recent buyer/seller orders + `actionRequired` summary).

**Write** (`full_access` + stored nsec): `set_user_profile` (kind 0), `set_shop_profile` (kind 30019, with `paymentMethodDiscounts`/free shipping), `set_notification_email` / `get_notification_email`, `create_product_listing` / `update_product_listing` (kind 30402, full tag support inc. variants/bulk/pickup/expiration/herdshare/required-customer-info/subscriptions), `delete_listing` (kind 5), `publish_review` (kind 31555), `reply_to_review` (kind 1111, NIP-22, one reply per review), `create_community_post`, `send_direct_message` (NIP-17 1059/13/14), `set_relay_list` (10002), `set_blossom_servers` (10063), `upload_media` (24242), `create_discount_code` / `delete_discount_code` / `list_discount_codes`, `get_cashu_balance` (7375), `receive_cashu_tokens`, `set_cashu_mints` (17375), `send_cashu_payment` (melt to Lightning), `list_seller_subscriptions`, `update_order_address` (encrypted address-change DM), `send_shipping_update` (tracking + carrier + ETA, status → shipped), `update_order_status` (with optional notification DM), `list_messages` / `mark_messages_read`, plus the email-flow tools listed above.

## Payment methods

- **Lightning**: Generates a Cashu mint quote (bolt11 invoice). Agent pays then calls `verify_payment`. Default mint: `https://mint.minibits.cash/Bitcoin`.
- **Cashu**: Agent provides a serialized token; server verifies and redeems.
- **Stripe**: Creates a PaymentIntent. Agent completes via Stripe SDK.
- **Fiat**: Returns seller's handles (Venmo, Cash App, etc.); agent pays externally with order ID in memo and seller confirms manually.
- Per-method discounts apply automatically.

## Agentic Commerce Endpoints

- `GET /.well-known/agent.json` — Capabilities manifest (unauth).
- `POST /api/mcp/onboard` — Zero-touch registration (unauth). Accepts `{ name, permissions?, contact?, pubkey? }`. Generates a Nostr keypair when `pubkey` is omitted (returns `nsec`); reuses existing identity when provided (no nsec returned, `existingIdentity: true`). Always returns `npub`. Rate-limited to 10/IP/hour.
- `GET /api/mcp/status` — Health + metrics (uptime, latency p50/p95/p99, throughput, reliability, freshness counts). Backed by `utils/mcp/metrics.ts`.
- **Pricing in protocol**: Every product response has a structured `pricing` block (amount, currency, unit, shippingCost, shippingType, totalEstimate, paymentMethods). Order creation returns HTTP 402 with payment instructions when Stripe is required.
- **Response metadata**: All MCP tool responses include `_meta` (`responseTimeMs`, `dataSource` ∈ {`cached_db`, `live`}, `dataFreshness`, `resultCount`). HTTP responses include `X-Response-Time`.

# SEO & GEO

- **On-page**: Descriptive alt text + explicit `width`/`height` on landing (`pages/index.tsx`), producers (`pages/producer-guide/index.tsx`), and image carousel (`components/utility-components/image-carousel.tsx`). Global JSON-LD (`Organization`, `WebSite`, `LocalBusiness`, `FAQPage`) via `components/structured-data.tsx` (loaded in `_app.tsx`). Contact page has its own `ContactPage` schema. `public/robots.txt` allows all crawlers but disallows admin/API; references the sitemap. Dynamic sitemap at `pages/api/sitemap.xml.ts`, served at `/sitemap.xml` via `next.config.mjs` rewrite (covers all 9 public pages).
- **Trust signals**: About (`pages/about/index.tsx`) — mission, team, USDA citations, expert quote, stats. Contact (`pages/contact/index.tsx`) — email, Nostr, social, GitHub, mailto form with subject categories.
- **GEO**: Inline USDA ERS / USDA AMS citations with specific numbers (e.g. "$44B+ farm revenue", "12% YoY growth in direct sales"); attributed dairy expert quote on landing + about; E-E-A-T signals (author/founder schema, team credentials, social proof).

# Dev Mode Optimizations

- **Turbopack** (Next.js default) for dev server (~36s vs ~87s initial, sub-second subsequent).
- **PWA disabled in dev** via `next.config.mjs`. **Flow scheduler skipped in dev** to reduce memory pressure.

# Affiliate / Referral System

Seller-managed affiliate links and codes that work for both Stripe and Bitcoin/Cashu payments.

## Data model (`db/schema.sql`, `utils/db/affiliates.ts`)

- `affiliates` — seller-owned record (name, email, optional pubkey, lightning address, Stripe Connect id, balance, invite token, `payouts_enabled`, `payout_failure_count`, `last_payout_failure_at`, `last_payout_failure_reason`, `email_notifications_enabled`).
- `affiliate_codes` — per-affiliate codes with rebate (% or fixed) + buyer discount (% or fixed), expiry, `max_uses`, `times_used`, `payout_schedule` ∈ {weekly, biweekly, monthly} (default monthly). Functional unique index on `(seller_pubkey, UPPER(code))` prevents case-variant collisions.
- `affiliate_referrals` — one row per (order, code), tracks gross/net/rebate/buyer-discount in smallest units, payment rail, status (`pending` → `payable` → `paid`, plus `cancelled`/`refunded`), `refunded_smallest`, `refund_event_ref`. Unique on `(order_id, code_id)` so reposts are idempotent.
- `affiliate_payouts` — settled batches (Stripe transfer id, lightning preimage, or manual mark-paid).
- `affiliate_clicks` — `(code_id, seller_pubkey, occurred_at, optional landing_path, optional referer_host)`. **PII-free by design**: no IPs, no UAs, no cookies, no fingerprints. Future contributors must not add identifying columns without a privacy review and an updated public privacy notice.

## API endpoints (`pages/api/affiliates/`)

- `manage` (CRUD; PUT actions: `regenerate-token`, `set-payouts-enabled`, 409-guarded `force-delete`), `codes` (CRUD codes), `validate` (public buyer validation, requires `currency` for fixed-amount codes, returns uniform `{ valid: false }` on all failures), `claim` (affiliate self-service via invite token; signed-pubkey proof required for any update after first claim; GET masks email/lightning/Stripe id once claimed), `payouts` (seller view), `mark-paid` (manual settlement), `record-referral` (server-first attribution; atomic max_uses + idempotent), `process-payouts` (cron, `Authorization: Bearer $AFFILIATE_PAYOUT_CRON_SECRET`, advisory-locked per schedule + per affiliate, `?dryRun=1` supported), `self-stats` (token-gated dashboard data — balances + recent payouts), `stripe-onboarding` (creates Express account on the affiliate's behalf, returns Account Link URL), `ytd-payouts` (seller-scoped year-to-date paid totals with US 1099-NEC threshold flagging at $600), `record-click` (always 200, swallows errors), `click-stats` (signed seller request, 30-day click × conversion FULL OUTER JOIN), `reverse-referral` (seller-only manual clawback — `pubkey === sellerPubkey` signed-event auth, reuses `reverseReferralsForOrder` for partial-refund math), `unsubscribe` (RFC 8058 one-click).

## Payment integration

- `pages/api/stripe/create-payment-intent.ts` accepts per-seller `affiliateRebateSmallest`, `affiliateAccountId`, `affiliateId`, `affiliateCodeId`, `affiliateCode`.
- `pages/api/stripe/process-transfers.ts` caps the rebate (seller keeps ≥1 unit after donation+rebate), subtracts rebate from the seller transfer, calls `recordReferral` server-side (initial status `pending`). Real-time affiliate Stripe transfers were removed so refunds remain reversible during the hold window.
- `pages/api/stripe/webhook.ts` handles `charge.refunded` → `reverseReferralsForOrder` (cancels still-pending, marks already-paid as `refunded` for out-of-band reconciliation). Also handles `account.updated` → `syncAffiliateStripeAccountState` (mirrors `charges_enabled` / `payouts_enabled` / `details_submitted` so a Connect account that loses payouts capability auto-stops getting transfers; unknown accounts no-op silently).
- Cashu/Lightning orders accrue to balance via the cart's record-referral call and are paid out by the cron once they age past `PAYOUT_HOLD_DAYS` for their code's schedule.

## Anti-abuse

- Self-referral blocked at invite-claim time (`updateAffiliatePayoutMethod`) and referral-record time.
- `recordReferral` runs in a transaction with `SELECT ... FOR UPDATE` on the code row, enforcing `max_uses` atomically and incrementing `times_used` only on first insert. `ON CONFLICT (order_id, code_id) DO NOTHING` + SELECT fallback prevents the browser from overwriting the server-written row.
- `process-payouts` takes per-schedule advisory locks (weekly=91001, biweekly=91002, monthly=91003) and per-affiliate locks (`92_000_000 + id`) so two schedules can't double-pay the same affiliate. Enforces a min payout floor (100 sats / 50¢) and skips affiliates with `payouts_enabled = false`. Emits structured `AFFILIATE_PAYOUT_RUN` / `AFFILIATE_PAYOUT_FAILURE` log lines and returns a per-affiliate summary.
- After `MAX_PAYOUT_FAILURES` (5) consecutive failures the cron auto-pauses the affiliate.
- Refund handling is partial-refund aware: `reverseReferralsForOrder` consumes `originalGrossSmallest` from the Stripe webhook, computes a refund ratio, scales pending rebates proportionally; already-paid rebates are recorded as clawbacks for out-of-band reconciliation.
- Stripe payout idempotency: stable SHA-256 of `(affiliateId, currency, amount, sorted referralIds)` (key `aff-payout-{id}-{hash32}`), stored as `bundleDigest` in transfer metadata for forensic lookup.
- Pure helpers (`computeRefundRatio`, `computeClawbackSmallest`, `computeBuyerDiscountSmallest`, `computeRebateSmallest`, `isSelfReferral`) covered by `__tests__/utils/db/affiliates.test.ts`.
- `scripts/reconcile-affiliate-balances.ts` (`pnpm tsx scripts/reconcile-affiliate-balances.ts [--apply]`) recomputes per-affiliate per-currency balances and flags orphan paid rows, refund overshoots, and stale payable rows.
- **Partial-refund caveat**: a single Stripe charge can span multiple sellers. `reverseReferralsForOrder` applies a global refund ratio (`refunded / original_gross`) to every pending rebate on the order. When a buyer refunds only one seller's portion of a multi-seller cart, the resulting clawback is best-effort and must be reconciled manually using the Stripe dashboard. See `docs/affiliate-payout-cron.md`.

## UI

- `components/market/affiliates.tsx` — seller dashboard (4 tabs: Affiliates, Codes, Balances, Payouts), wired into `market-page.tsx`. Schedule picker: weekly/biweekly/monthly (default monthly).
- `pages/affiliate/[token].tsx` — affiliate self-service page. Per-currency pending/ready/paid balances, recent-payouts table, paused-state warning banner pulled from `/api/affiliates/self-stats`. Includes a "Set up Stripe Connect for me" button.
- `components/utility-components/affiliate-ref-tracker.tsx` — mounted in `pages/_app.tsx`; on any `?ref=CODE` URL stores the code in a 30-day `mm_aff_ref` cookie. Cookie is a JSON map keyed by seller pubkey (with `*` wildcard fallback) so a code captured on seller A's storefront is preferred for seller A's checkout and won't bleed onto seller B. `?ref_seller=PUBKEY` lets links bind explicitly. Click POST is at-most-once per session via `sessionStorage`.
- `pages/cart/index.tsx` — on cart load, calls `getAffiliateRefCookie(sellerPubkey)` per seller and validates against `/api/affiliates/validate`.
- `cart-invoice-card.tsx` — passes affiliate fields into the payment-intent body and per-seller splits. Cashu success still POSTs `/api/affiliates/record-referral` (server-side enforcement); Stripe success no longer does (process-transfers + webhook are authoritative).

## Email notifications & unsubscribe

- `process-payouts` sends `affiliatePaidEmail` on every successful Stripe payout, plus one-time `affiliatePausedToAffiliateEmail` and `affiliatePausedToSellerEmail` notifications when `MAX_PAYOUT_FAILURES` flips `payouts_enabled` to `false`. Seller emails resolved via `getSellerEmailForPubkey` (wraps `getSellerNotificationEmail`).
- Affiliate emails (`affiliatePaidEmail`, `affiliatePausedToAffiliateEmail`) emit `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers + footer link, all built from `mintAffiliateUnsubscribeToken` (HMAC, requires `AFFILIATE_UNSUBSCRIBE_SECRET`). Hitting the URL flips `email_notifications_enabled = false`; the cron then skips that affiliate's notifications without affecting payouts.
- Tokens carry an issued-at timestamp and expire after 1 year (`UNSUBSCRIBE_TOKEN_TTL_MS` in `utils/email/unsubscribe-tokens.ts`). Rotating `AFFILIATE_UNSUBSCRIBE_SECRET` invalidates every outstanding link at once.

## Operator runbook

- **Reverse a referral / clawback**: seller dashboard → Affiliates → Analytics → "Reverse referral". Calls `/api/affiliates/reverse-referral` with the seller's signed Nostr event; route applies `reverseReferralsForOrder` so pending rebates are scaled and already-paid rebates are recorded as clawbacks.
- **Unsubscribe an affiliate from emails**: every affiliate email contains a one-click unsubscribe link. Operators can also POST to `/api/affiliates/unsubscribe` with a token from `mintAffiliateUnsubscribeToken(id)`. Re-subscribing requires updating `affiliates.email_notifications_enabled = true` directly in the DB (intentional — there's no public re-subscribe surface).
- **Stripe Connect goes cold**: nothing to do — `account.updated` webhooks flip the affiliate's flags automatically; the next cron pass logs `payouts disabled`.

## Scheduled deployment

`.replit` is read-only here, so the affiliate payout crons are documented in `docs/affiliate-payout-cron.md`. Configure three Replit Scheduled Deployments — weekly (`0 14 * * 1`), biweekly (`0 14 1,15 * *`), monthly (`0 14 1 * *`) — each running:

```sh
curl -fsSL -X POST \
  -H "Authorization: Bearer $AFFILIATE_PAYOUT_CRON_SECRET" \
  "$NEXT_PUBLIC_BASE_URL/api/affiliates/process-payouts?schedule=<weekly|biweekly|monthly>"
```

## Tests

- `__tests__/utils/db/affiliates.test.ts` — pure helpers.
- `__tests__/api/affiliates/validate.test.ts` — public validation, fixed-amount currency guard, uniform `{ valid: false }` shape.
- `__tests__/api/affiliates/record-referral.test.ts` — self-referral block, currency-mismatch reject, happy path (computed amounts + `initialStatus: 'pending'`), 409 surface for `max_uses` contention.

## Env

- `AFFILIATE_PAYOUT_CRON_SECRET` — bearer guarding `/api/affiliates/process-payouts`.
- `AFFILIATE_UNSUBSCRIBE_SECRET` — HMAC key (≥16 chars) to mint/verify one-click unsubscribe tokens. Required for the `unsubscribe` route and for any affiliate email with `List-Unsubscribe` headers.
