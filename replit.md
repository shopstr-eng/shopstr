# Overview

Milk Market is a permissionless Nostr-based marketplace for raw milk and related products. Payments: Bitcoin (Lightning, Cashu), Stripe, manual fiat. Implements 15+ NIPs, with PostgreSQL caching for SSR + analytics. Sellers run customizable storefronts; buyers can check out as guests or with Nostr keys; AI agents participate via the MCP API.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Stack

- **Frontend**: Next.js 16 (App Router) + TypeScript v4, React 19, HeroUI, Tailwind, Framer Motion, PWA. State via React Context per domain; localStorage for prefs/auth; service worker caching.
- **Backend**: Next.js API routes, PostgreSQL, Formidable uploads.
- **Runtime**: Node `>=22.4.0` (`.nvmrc` = `22`); `@cashu/cashu-ts` pinned to `4.1.0`.
- **Routing**: Friendly slugs for listings + profiles with pubkey disambiguation; naddr/npub URLs redirect to slugs (`utils/url-slugs.ts`).
- **SSR OpenGraph**: `/listing/`, `/shop/`, `/marketplace/`, `/communities/` fetch from PostgreSQL in `getServerSideProps` and inject meta via `pageProps.ogMeta` → `DynamicHead` (`_app.tsx`).

## Authentication & Recovery

- **Signers**: NIP-07, NIP-46, direct nsec (with ncryptsec auto-detection). NIP-49 encrypted storage with auto-migration.
- **Account Recovery** (email + nsec-with-email users): 24-char segmented recovery key generated at signup or in profile settings, downloadable as `.txt`. Flow: email-verification token → recovery key + new password → re-encrypted nsec.
  - Tables: `account_recovery`, `account_recovery_tokens`, `recovery_email_verifications`.
  - APIs under `pages/api/auth/`; UI: `RecoveryKeyModal`, `/auth/recover`, "Forgot password?" in `SignInModal`. Helpers in `utils/auth/recovery.ts`.
  - Security: `crypto.randomBytes` RNG; PBKDF2 600k iterations (back-compat with 1k); per-route rate limiting; email verification required.

## Nostr Protocol

- 15+ NIPs: profiles (NIP-01, NIP-05), marketplace (NIP-99), DMs (NIP-17), media (Blossom), reviews (NIP-85), social graph (NIP-02, NIP-51), relay lists (NIP-65).
- Hybrid event caching: IndexedDB + Postgres + live relays. Kind 1111 disambiguated by tags: NIP-22 review replies (`K` tags) → `comment_events`; community posts (`a:34550:...`) → `community_events`. Community posts (1111) and approvals (4550) load DB-first via `fetchCommunityPostsFromDb`.
- File storage: Blossom. Encryption: NIP-44 (DMs + documents).

## Order Messages & Payment Tags

- **Payment method names**: `resolveExplicitPaymentMethod()` in `utils/messages/order-message-utils.ts` is the canonical mapper (`stripe`→`Card`, `nwc`→`NWC`, etc.). Order-summary pages add descriptive labels (e.g. `Lightning`→`Lightning Network`).
- **Currency**: Orders dashboard reads `["currency", ...]` from the order message first, falls back to listing currency.
- **Shipping tags**: Strict 4-tuple `["shipping", type, cost, currency]` validated against `SHIPPING_OPTIONS` in `utils/parsers/product-tag-helpers.ts`. `getEffectiveShippingCost()` returns 0 for `Free`/`Free/Pickup`/`Pickup`/`N/A` and for `Added Cost/Pickup` when pickup is selected.
- **Order grouping**: `buildOrderGroupingKey()` keys on product ref + amount + fulfillment target. `getOrderConsolidationKey()` + `registerTaggedOrderGroupingKey()` dedupe across explicit order tags and computed keys.
- **Subject routing**: `messages.tsx` routes order subjects (`order-payment`, `order-info`, `payment-change`, `order-receipt`, `shipping-info`, `order-completed`, `zapsnag-order`, `address-change`) to the Orders chat tab. MCP `create-order.ts` `sendOrderEmail()` passes full metadata for complete buyer/seller emails.

## Payment Systems

### Lightning & Cashu

- **Lightning**: Direct invoice gen + verify.
- **Cashu**: `@cashu/cashu-ts` v4.1.0 (`Mint`/`Wallet`/`Keyset`, bolt11-suffixed quote helpers, `Amount` boundary type with `.toNumber()`, `KeyChain.getKeysets()`, explicit `await wallet.loadMint()`, `getDecodedToken(token, keysetIds)` requires the second arg).
- **Proof amount JSON gotcha**: Proofs in `localStorage["tokens"]` lose the `Amount` wrapper on JSON round-trip and come back as plain `number`. Code reading `getLocalStorageData().tokens` must use `proofAmountToNumber` / `sumProofAmounts` from `utils/cashu/proof-amount.ts`, not `.amount.toNumber()`.
- **Hardening utilities** (`utils/cashu/`): `mint-retry-service` (`withMintRetry`), `swap-retry-service` (`safeSwap`), `melt-retry-service` (`safeMeltProofs`), `pending-mint-operations` (DB-backed `pending_mint_quotes` for orphan recovery), `wallet-recovery` (boot reconciler via `components/utility-components/mint-recovery-boot.tsx`). All cashu call sites use these wrappers and check melt/swap status before treating ops as successful.

### Stripe Connect

- **Express Connect** with embedded Stripe Elements (PaymentIntent API). Card form: `components/utility-components/stripe-card-form.tsx`. PaymentIntent: `pages/api/stripe/create-payment-intent.ts`.
- **Currency utils** (`utils/stripe/currency.ts`): `satsToUSD`, `isCrypto`, `toSmallestUnit`, `convertToSmallestUnit`, `ZERO_DECIMAL_CURRENCIES`. Live BTC→fiat via `@getalby/lightning-tools` (no hardcoded fallback). Stripe payments use the native fiat currency directly; only sats/BTC convert to USD.
- **Webhooks** (`webhook.ts`, `subscription-webhook.ts`): require `STRIPE_WEBHOOK_SECRET` / `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET`, reject unverified payloads, dedupe via `claimStripeEvent` (`stripe_processed_events`, fail-open). Both honor `application_fee.created`/`refunded` for donation reconciliation.
- **Retries & idempotency**: `withStripeRetry` (`utils/stripe/retry-service.ts`) wraps API calls. All PaymentIntent / Subscription / Invoice / Transfer create calls use a deterministic `stableIdempotencyKey()`.
- **Pending payments & failures**: `stripe_pending_payments` (`utils/stripe/pending-payments.ts`); webhook updates status. Failures email both parties (`sendPaymentFailedToBuyer`/`Seller`); transfer failures alert admin (`sendTransferFailureAlert`).
- **Cron cleanup** (`pages/api/stripe/cron-cleanup.ts`, gated by `FLOW_PROCESSOR_SECRET`): prunes `stripe_processed_events` >45d and terminal `stripe_pending_payments` (`succeeded`/`failed_terminal`/`abandoned`) >30d. Active rows preserved.

### Donations (platform fee)

- **Field**: Sellers' donation percent lives in Nostr profile JSON under `mm_donation` (was `shopstr_donation` upstream). Defaults to 2.1% when absent. Profile form writes only `mm_donation` and strips stale `shopstr_donation`.
- **Cashu/Lightning**: Donation eCash sent to `process.env.NEXT_PUBLIC_MILK_MARKET_PK`; skipped with a warn if unset.
- **Stripe parity**: `utils/stripe/donation.ts` reads `mm_donation` from cached `profile_events`, defaults to 2.1%, caches per-seller for 5 min, skips when seller equals `NEXT_PUBLIC_MILK_MARKET_PK`, falls back to no fee when cut would be ≥ gross. Wired into:
  - `create-payment-intent.ts` — `application_fee_amount` for single-merchant; embeds per-seller fees in multi-merchant `sellerSplits` metadata.
  - `process-transfers.ts` — withholds cut from each `Transfer.amount` (prefers embedded values, falls back to fresh profile lookup).
  - `create-subscription.ts` / `create-cart-subscription.ts` — `application_fee_percent` on direct-charge subs; `create-invoice.ts` — `application_fee_amount` on direct-billed invoices.
- **Dashboard parity**: Stripe success handlers in `cart-invoice-card.tsx` and `product-invoice-card.tsx` compute donation from cached profile and pass `donationAmountValue`/`donationPercentageValue` into every `sendPaymentAndContactMessage`. `donation_amount` tag emitted via `utils/nostr/nostr-helper-functions.ts` so Stripe orders render the donation row identically to Cashu/Lightning.
- Platform-account selling-to-itself is a no-op everywhere.

### Multi-currency & cart math

- Cart display currency = most common item currency (tiebreak: USD > sats > alphabetical). Mixed carts convert via `@getalby/lightning-tools`. Zero-decimal currencies (JPY/KRW/etc.) handled. Bitcoin/Lightning always sats; Lightning buttons show fiat + sats estimate for fiat-priced products. Sats-only carts show USD estimate on Stripe/fiat buttons.
- `nativeTotalCost` and `nativeCostsPerProduct` are async (`useEffect`+state) for cross-currency conversion.
- `process-transfers.ts` reads currency from the PaymentIntent for multi-merchant transfers; subscription-renewal transfers read it from the invoice. Order messages include `["currency", ...]` and `["amount", ...]` tags. Subscriptions are `pending` until first successful payment activates them via the subscription webhook.
- **Round-up policy**: All conversions and on-the-wire charge math use `Math.ceil` (never `round`/`floor`). Stripe charges below the gateway floor surface a "$0.50 minimum" banner.

### Fiat & multi-merchant fiat

- Manual methods: Venmo, Zelle, Cash App, PayPal, Apple Pay, Google Pay, Cash. Multi-merchant fiat: each seller gets their own dropdown, per-merchant instructions/amounts, individual confirmation checkboxes. Order only confirmed when all checkboxes checked. Single-merchant retains the original single-dropdown flow.

### API rate limiting

- All public `pages/api/**` endpoints use the in-memory token bucket in `utils/rate-limit.ts` (`checkRateLimit`, `applyRateLimit`, `getRequestIp`) keyed by client IP, with `X-RateLimit-*` headers and `Retry-After` on 429. Per-process buckets — under horizontal scaling the effective ceiling is `N × limit` (intentional coarse DB-pool guard). Webhooks rely on signature + Stripe-event idempotency instead.

## Inventory

- **Centralized**: Postgres `inventory` (product_id, seller_pubkey, variant_key, quantity, source) + `inventory_log`. Variant keys: `_default` for global, `size:Name` for per-size.
- **Auto deduction**: All order flows deduct on success. Bulk/bundle orders multiply bundle size × quantity.
- **Seller override**: Publishing kind 30402 with quantity tags syncs inventory with `source: 'seller_override'`.
- **API**: `/api/inventory` actions: `check`, `deduct`, `set`, `restore`, `sync`. Service: `utils/db/inventory-service.ts`.
- MCP availability checks consult inventory first, falling back to Nostr event quantities for untracked products.

## Trust & Reviews

- **Social graph**: Follow-based trust with WoT filtering.
- **Reviews**: Weighted scoring with sentiment quality labels (Trustworthy/Solid/Questionable/Don't trust). Sellers reply via NIP-22 (kind 1111) using `publishReviewReply`. Replies render across checkout card, marketplace, and storefront via `components/utility-components/seller-review-reply.tsx`. Stored in `ReviewsContext`; reply events cached in `comment_events`.

## Key Features

- **Order Summary** (`pages/order-summary/index.tsx`): Post-purchase page with product, cost, payment, and shipping details.
- **Email & Guest Checkout**: SendGrid for order/seller/shipping emails; guest purchases via email.
- **Custom Email Flows**: Sellers manage automated sequences (welcome, abandoned cart, post-purchase, winback).
  - Each flow has timed steps with subject + HTML body. Merge tags: `{{buyer_name}}`, `{{shop_name}}`, `{{product_title}}`, `{{order_id}}`, `{{product_image}}`, `{{shop_url}}`.
  - Triggers: post-purchase + welcome auto-trigger on order. Abandoned-cart and winback crons gated by `FLOW_PROCESSOR_SECRET`. Cart activity reported per-merchant from `cart-invoice-card.tsx` when buyer's email is known.
  - Tables: `email_flows`, `email_flow_steps`, `email_flow_enrollments`, `email_flow_executions`, `cart_reports`. Routes under `pages/api/email/flows/`. Visual builder: `components/settings/flow-step-editor.tsx`. Per-flow sender settings (`from_name`, `reply_to`).
  - Internal scheduler (`utils/email/flow-scheduler.ts`) auto-starts via `instrumentation.ts`: processor every 2 min, abandoned-cart every 30 min, winback once daily. Disabled gracefully if `FLOW_PROCESSOR_SECRET` unset.
- **Inquiry Email Notifications**: Direct inquiry DMs trigger emails when recipient has email on file. Reply-to set to sender's email when available. Template `inquiryNotificationEmail`.
- **Return/Refund/Exchange Requests**: Buyers request from orders dashboard; sends gift-wrapped DM (`return-request` subject) + email. Buyer sees "Return Requested"; sellers see alert badge. Template `returnRequestEmail`.
- **Stripe Connect Onboarding**: `create-account`, `create-account-link`, `account-status` use mandatory `McpRequestProof` signed-event auth (proof builders in `utils/mcp/request-proof.ts`, server verify via `verifyAndConsumeSignedRequestProof`).
- **Bulk/Bundle Pricing**: Tag format `["bulk", units, price]` global, `["bulk", units, price, variantName]` variant-specific. Selector only appears when selected variant has bulk tiers. Parsed into `bulkPrices` (global) and `variantBulkPrices` (`Map<string, Map<number, number>>`).
- **Variants & Pickup**: Size, volume, weight (with per-weight pricing), and pickup-location selection integrated into order messages and dashboard. Order status persisted with priority system to prevent downgrades.
- **Subscribe & Save**: Configurable subscription pricing (weekly / 2-week / monthly / 2-month / quarterly) with discount %. Stripe Subscriptions on connected accounts. Renewal reminders one week before billing via email + Nostr DMs; address changes notify sellers via gift-wrapped DMs. Cart supports mixed sub + one-time via `pages/api/stripe/create-cart-subscription.ts` (single Stripe invoice). Multi-merchant subs use platform charging + transfers.
- **Cart Multi-Payment**: Card when all merchants have Stripe (single-merchant uses direct charges; multi-merchant uses Separate Charges and Transfers via `process-transfers.ts`). Fiat single-merchant only. Bitcoin (Lightning, Cashu, NWC) always available. When any product has an active subscription selection, only card is available.
- **Free Shipping Threshold**: Per-merchant `freeShippingThreshold` + `freeShippingCurrency` in Kind 30019 JSON. Shipping consolidates per seller (highest cost, not sum). Progress bars + popup notification + strikethrough green "Free" badge.
- **Payment Method Discounts**: `paymentMethodDiscounts` in Kind 30019 JSON maps `bitcoin`/`stripe`/`cash`/`venmo`/etc. → percent. Buttons show "(X% off)"; invoice amount reflects the discount.
- **Herdshare Agreements**: Dashboard column for signing/viewing via PDFAnnotator.
- **Image Compression**: Auto-compress (WebP + scaling) before Blossom uploads.
- **Unread/Read Indicators** for messages and orders with auto-mark.

## Shopify → Milk Market Migration

Sellers import a Shopify product CSV export and republish as NIP-99 listings (kind 30402).

- **Entry points**: (1) Settings → Market Stall → Products & Discounts has "Import from Shopify" + tooltip; (2) landing footer "Migrate from Shopify" routes through onboarding (`migrate=shopify` param propagated through new-account → market-profile → shop-profile → stripe-connect → `/settings/stall?tab=products&migrate=shopify`). Already-signed-in users hitting `/onboarding/new-account` redirect to the stall page.
- **Modal**: 4-step (Upload → Configure → Review → Publish) in `components/stall/shopify-migration-modal.tsx`.
- **Parsing/mapping**: `utils/migrations/shopify-csv-parser.ts` groups variants by `Handle`. `utils/migrations/shopify-to-nip99.ts` maps to NIP-99, surfaces price-variance warnings, omits `quantity` when total inventory is 0, supports per-variant `size` tags.
- **Image rehosting**: `utils/migrations/rehost-images.ts` re-uploads remote images to seller's Blossom servers; failures fall back to original URL with warning. Done step has "Retry N failed" button.

## Seller Storefronts

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

# External Dependencies

- **Nostr**: Relays for events, Blossom for media, NIP-05 DNS verification.
- **Payments**: Lightning, Cashu Mints, Getalby Lightning Tools (LN address utils), Stripe Connect, SendGrid (transactional email).
- **Libraries**: `crypto-js`, `nostr-tools`, `@cashu/cashu-ts`, `@heroui/react`, `@heroicons/react`, `framer-motion`, `stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`, `pdf-lib`, `qrcode`, `@modelcontextprotocol/sdk`.

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

# SEO & GEO

- **On-page**: Descriptive alt text + explicit `width`/`height` on key pages. Global JSON-LD (`Organization`, `WebSite`, `LocalBusiness`, `FAQPage`) via `components/structured-data.tsx`. `public/robots.txt` allows all crawlers but disallows admin/API. Dynamic sitemap at `pages/api/sitemap.xml.ts`.
- **GEO**: Inline USDA citations with specific numbers; attributed dairy expert quote on landing + about; E-E-A-T signals (founder schema, team credentials, social proof).

# Dev Mode Optimizations

- **Turbopack** for dev server.
- **PWA disabled** in dev via `next.config.mjs`. **Flow scheduler skipped in dev** to reduce memory pressure.

# Affiliate / Referral System

Seller-managed affiliate links and codes that work for both Stripe and Bitcoin/Cashu payments.

## Data model (`db/schema.sql`, `utils/db/affiliates.ts`)

- `affiliates` — name, email, optional pubkey, lightning address, Stripe Connect id, balance, invite token, `payouts_enabled`, `payout_failure_count`, `last_payout_failure_*`, `email_notifications_enabled`.
- `affiliate_codes` — per-affiliate: rebate (% or fixed) + buyer discount, expiry, `max_uses`, `times_used`, `payout_schedule` ∈ {weekly, biweekly, monthly} (default monthly). Functional unique index on `(seller_pubkey, UPPER(code))` prevents case-variant collisions.
- `affiliate_referrals` — one per (order, code): gross/net/rebate/buyer-discount in smallest units, payment rail, status (`pending` → `payable` → `paid`, plus `cancelled`/`refunded`), `refunded_smallest`, `refund_event_ref`. Unique on `(order_id, code_id)` for idempotent reposts.
- `affiliate_payouts` — settled batches (Stripe transfer id, lightning preimage, or manual mark-paid).
- `affiliate_clicks` — `(code_id, seller_pubkey, occurred_at, optional landing_path, optional referer_host)`. **PII-free by design**: no IPs, UAs, cookies, fingerprints. Future contributors must not add identifying columns without privacy review and updated public privacy notice.

## API endpoints (`pages/api/affiliates/`)

- `manage` (CRUD + `regenerate-token`/`set-payouts-enabled`/409-guarded `force-delete`), `codes`, `validate` (public buyer validation, requires `currency` for fixed-amount codes, uniform `{ valid: false }` on failure), `claim` (signed-pubkey proof required after first claim; GET masks email/lightning/Stripe id once claimed), `payouts`, `mark-paid`, `record-referral` (server-first attribution, atomic max_uses + idempotent), `process-payouts` (cron, `Authorization: Bearer $AFFILIATE_PAYOUT_CRON_SECRET`, advisory-locked per schedule + per affiliate, `?dryRun=1`), `self-stats`, `stripe-onboarding`, `ytd-payouts` (US 1099-NEC threshold flagging at $600), `record-click` (always 200), `click-stats` (signed seller request, 30-day FULL OUTER JOIN), `reverse-referral` (seller-only manual clawback), `unsubscribe` (RFC 8058 one-click).

## Payment integration

- `pages/api/stripe/create-payment-intent.ts` accepts per-seller `affiliateRebateSmallest`, `affiliateAccountId`, `affiliateId`, `affiliateCodeId`, `affiliateCode`.
- `pages/api/stripe/process-transfers.ts` caps the rebate (seller keeps ≥1 unit after donation+rebate), subtracts from seller transfer, calls `recordReferral` server-side (`pending`). Real-time affiliate Stripe transfers removed so refunds remain reversible during hold window.
- `pages/api/stripe/webhook.ts` handles `charge.refunded` → `reverseReferralsForOrder` (cancels pending, marks paid as `refunded` for out-of-band reconciliation). Also `account.updated` → `syncAffiliateStripeAccountState` (mirrors `charges_enabled`/`payouts_enabled`/`details_submitted`; auto-stops transfers when capability lost).
- Cashu/Lightning orders accrue to balance via cart's record-referral and pay out by cron after `PAYOUT_HOLD_DAYS` for the code's schedule.

## Anti-abuse

- Self-referral blocked at invite-claim time (`updateAffiliatePayoutMethod`) and referral-record time.
- `recordReferral` runs in a transaction with `SELECT ... FOR UPDATE` on the code row, enforcing `max_uses` atomically and incrementing `times_used` only on first insert. `ON CONFLICT (order_id, code_id) DO NOTHING` + SELECT fallback prevents the browser from overwriting server-written rows.
- `process-payouts` takes per-schedule advisory locks (weekly=91001, biweekly=91002, monthly=91003) and per-affiliate locks (`92_000_000 + id`). Min payout floor (100 sats / 50¢). Skips affiliates with `payouts_enabled = false`. Emits `AFFILIATE_PAYOUT_RUN`/`AFFILIATE_PAYOUT_FAILURE` log lines.
- After `MAX_PAYOUT_FAILURES` (5) consecutive failures, cron auto-pauses the affiliate.
- Refund handling is partial-refund aware: `reverseReferralsForOrder` consumes `originalGrossSmallest` from the Stripe webhook, computes a refund ratio, scales pending rebates proportionally; already-paid rebates recorded as clawbacks for out-of-band reconciliation.
- Stripe payout idempotency: stable SHA-256 of `(affiliateId, currency, amount, sorted referralIds)` (key `aff-payout-{id}-{hash32}`), stored as `bundleDigest` in transfer metadata.
- Pure helpers (`computeRefundRatio`, `computeClawbackSmallest`, `computeBuyerDiscountSmallest`, `computeRebateSmallest`, `isSelfReferral`) covered by `__tests__/utils/db/affiliates.test.ts`.
- `scripts/reconcile-affiliate-balances.ts` (`pnpm tsx scripts/reconcile-affiliate-balances.ts [--apply]`) recomputes balances and flags orphan paid rows, refund overshoots, stale payable rows.
- **Partial-refund caveat**: a single Stripe charge can span multiple sellers. `reverseReferralsForOrder` applies a global refund ratio to every pending rebate on the order. When a buyer refunds only one seller's portion of a multi-seller cart, the resulting clawback is best-effort and must be reconciled manually. See `docs/affiliate-payout-cron.md`.

## UI

- `components/market/affiliates.tsx` — seller dashboard (Affiliates / Codes / Balances / Payouts).
- `pages/affiliate/[token].tsx` — affiliate self-service. Per-currency pending/ready/paid balances, recent payouts, paused-state warning.
- `components/utility-components/affiliate-ref-tracker.tsx` (mounted in `_app.tsx`) — on `?ref=CODE` URL stores code in 30-day `mm_aff_ref` cookie. Cookie is JSON map keyed by seller pubkey (with `*` wildcard) so codes don't bleed across sellers. `?ref_seller=PUBKEY` binds explicitly. Click POST is at-most-once per session.
- `pages/cart/index.tsx` calls `getAffiliateRefCookie(sellerPubkey)` per seller and validates against `/api/affiliates/validate`.
- `cart-invoice-card.tsx` passes affiliate fields into payment-intent + per-seller splits. Cashu success POSTs `/api/affiliates/record-referral`; Stripe success no longer does (process-transfers + webhook are authoritative).

## Email & unsubscribe

- `process-payouts` sends `affiliatePaidEmail` on every successful Stripe payout, plus one-time `affiliatePausedToAffiliate*` / `affiliatePausedToSeller*` notifications when failures flip `payouts_enabled` to false.
- Affiliate emails emit `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers + footer link, built from `mintAffiliateUnsubscribeToken` (HMAC, requires `AFFILIATE_UNSUBSCRIBE_SECRET`). Hitting the URL flips `email_notifications_enabled = false`; cron then skips that affiliate's notifications without affecting payouts.
- Tokens carry issued-at and expire after 1 year (`UNSUBSCRIBE_TOKEN_TTL_MS` in `utils/email/unsubscribe-tokens.ts`). Rotating `AFFILIATE_UNSUBSCRIBE_SECRET` invalidates every outstanding link at once.

## Operator runbook

- **Reverse a referral / clawback**: seller dashboard → Affiliates → Analytics → "Reverse referral" (signed Nostr event; applies `reverseReferralsForOrder`).
- **Unsubscribe an affiliate**: every affiliate email has one-click unsubscribe. Re-subscribing requires updating `affiliates.email_notifications_enabled = true` directly in the DB (intentional — no public re-subscribe surface).
- **Stripe Connect goes cold**: nothing to do — `account.updated` webhooks flip flags automatically.

## Scheduled deployment

`.replit` is read-only here; affiliate payout crons documented in `docs/affiliate-payout-cron.md`. Configure three Replit Scheduled Deployments — weekly (`0 14 * * 1`), biweekly (`0 14 1,15 * *`), monthly (`0 14 1 * *`) — each running:

```sh
curl -fsSL -X POST \
  -H "Authorization: Bearer $AFFILIATE_PAYOUT_CRON_SECRET" \
  "$NEXT_PUBLIC_BASE_URL/api/affiliates/process-payouts?schedule=<weekly|biweekly|monthly>"
```

## Tests

- `__tests__/utils/db/affiliates.test.ts` — pure helpers.
- `__tests__/api/affiliates/validate.test.ts` — public validation, fixed-amount currency guard, uniform `{ valid: false }`.
- `__tests__/api/affiliates/record-referral.test.ts` — self-referral block, currency-mismatch reject, happy path, 409 for `max_uses` contention.

## Env

- `AFFILIATE_PAYOUT_CRON_SECRET` — bearer guarding `/api/affiliates/process-payouts`.
- `AFFILIATE_UNSUBSCRIBE_SECRET` — HMAC key (≥16 chars) for one-click unsubscribe tokens.
