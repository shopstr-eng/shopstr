# Overview

Milk Market is a permissionless marketplace built on the Nostr protocol for Bitcoin-enabled commerce, specializing in raw milk and related products. It leverages various Nostr Implementation Possibilities (NIPs) to offer a decentralized, censorship-resistant platform. Users can buy and sell products using Bitcoin via Lightning Network, Cashu eCash tokens, and traditional fiat currencies. The platform supports product listings, order management, encrypted communication, and multi-currency payments, emphasizing user privacy and self-sovereignty within Nostr's architecture. Recent enhancements include a dedicated order summary page, an email notification system with guest checkout, a redesigned landing page for improved conversion, and integration with Stripe Connect for sellers to accept credit card payments.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

- **Framework**: Next.js 16 with TypeScript v4 (App Router), React 19.
- **UI/UX**: HeroUI, Tailwind CSS, Framer Motion for animations, PWA support.
- **State Management**: React Context API for various domains (products, profiles, shops, chats, reviews, follows, relays, media, wallet, communities).
- **Data Persistence**: Local storage for user preferences and authentication, service worker for caching.
- **Routing**: Middleware-based URL rewriting, dynamic routing, protected routes for authenticated operations. Friendly URL slugs for listings (title-based) and profiles (name-based) with collision handling via pubkey disambiguation. naddr/npub inputs still resolve but redirect to friendly slugs. URL slug utilities in `utils/url-slugs.ts`.
- **SSR OpenGraph Meta Tags**: Product (`/listing/`), shop (`/shop/`, `/shop/.../`), marketplace seller (`/marketplace/`), and community (`/communities/`) pages use `getServerSideProps` to fetch entity data from the PostgreSQL cache and render `og:title`, `og:description`, `og:image`, and Twitter Card meta tags server-side. This ensures social media crawlers (which don't execute JS) see personalized link previews. Single-entity DB query functions in `utils/db/db-service.ts`. SSR OG data flows from `getServerSideProps` → `pageProps.ogMeta` → `DynamicHead` component (via `_app.tsx`). Shared OG type/defaults in `components/og-head.tsx`.

## Backend Architecture

- **API Routes**: Next.js API routes for server-side logic.
- **Database**: PostgreSQL for relational data storage.
- **File Handling**: Formidable for file uploads.
- **Middleware**: Custom Next.js middleware for routing.

## Authentication & Signing

- **Multiple Signer Support**: NIP-07, NIP-46, and direct nsec key input.
- **Key Management**: NIP-49 encrypted private key storage (ncryptsec). Sign-in supports both nsec and ncryptsec formats with auto-detection.
- **Migration System**: Automatic migration to NIP-49 standard.
- **Account Recovery**: Recovery key system for email and nsec users with email attached. Recovery keys (24-char, segmented format e.g. XXXX-XXXX-XXXX-XXXX-XXXX-XXXX) are generated at email signup and can be set up from profile settings for nsec users. Recovery flow: email verification token → recovery key + new password/passphrase → re-encrypted nsec. Recovery key is downloadable as .txt file. DB tables: `account_recovery` (pubkey, email, recovery_key_hash, recovery_encrypted_nsec, auth_type), `account_recovery_tokens`, `recovery_email_verifications`. API routes: `setup-recovery`, `check-recovery`, `request-recovery`, `verify-recovery-token`, `reset-password`, `send-recovery-verification`. UI: `RecoveryKeyModal`, `/auth/recover` page, "Forgot password?" link in SignInModal, recovery setup section in profile settings. Recovery utilities in `utils/auth/recovery.ts`. Security: cryptographically secure RNG (`crypto.randomBytes`) for key/token generation, PBKDF2 with 600,000 iterations (backward-compatible with legacy 1,000 iteration decryption), rate limiting on all recovery endpoints (`utils/auth/rate-limit.ts`), email verification required before recovery setup, `check-recovery` returns masked email only, `reset-password` sets no-cache headers. Recovery page dynamically labels fields as "password" (email users) or "passphrase" (nsec/OAuth users). Expired/used tokens are cleaned up during recovery requests.

## Nostr Protocol Implementation

- **Core NIPs**: Implements 15+ NIPs for profiles (NIP-01, NIP-05), marketplace (NIP-99), private messaging (NIP-17), media (Blossom), reviews (NIP-85), and social graph (NIP-02, NIP-51).
- **Relay Management**: Multi-relay support with configurable lists (NIP-65).
- **Event Caching**: Local caching of Nostr events.

## Order Message Handling & Payment Tags

- **Payment Method Resolution**: `resolveExplicitPaymentMethod()` in `utils/messages/order-message-utils.ts` maps raw payment tags from order messages to human-readable display names (e.g., "stripe" → "Card", "nwc" → "NWC", "cash app" → "Cash App", "paypal" → "PayPal", "apple pay" → "Apple Pay", "google pay" → "Google Pay"). Used in both the orders dashboard and email notifications. Unknown payment types get title-cased with word-boundary splitting.
- **Order Currency Resolution**: Orders dashboard (`components/messages/orders-dashboard.tsx`) reads the `["currency", ...]` tag from order messages when available, falling back to the product listing's currency. This ensures correct currency display even when the product is deleted or the order was paid in a different currency.
- **Shipping Tag Parsing**: `parseShippingTag()` and `parseShippingFromTags()` in `utils/parsers/product-tag-helpers.ts` enforce strict 4-element format `["shipping", type, cost, currency]` validated against `SHIPPING_OPTIONS` allowlist. `getEffectiveShippingCost()` returns 0 for zero-cost types (Free, Free/Pickup, Pickup, N/A) and handles "Added Cost/Pickup" with zero cost (pickup selected).
- **Order Grouping**: `buildOrderGroupingKey()` groups related order messages using product reference + amount + fulfillment target (address or pickup location). `getOrderConsolidationKey()` and `registerTaggedOrderGroupingKey()` handle deduplication across explicit order tags and computed grouping keys.
- **Email Payment Method Formatting**: The `/api/email/send-order-email` endpoint uses `resolveExplicitPaymentMethod()` to normalize raw payment type strings before sending to email templates, ensuring consistent branded names (e.g., "PayPal" not "paypal") in both buyer and seller notification emails.
- **Order Subject Routing**: `messages.tsx` filters order-related messages for the Orders chat tab using subjects: `order-payment`, `order-info`, `payment-change`, `order-receipt`, `shipping-info`, `order-completed`, `zapsnag-order`, `address-change`. The `chat-panel.tsx` sends `order-completed` when a seller marks an order delivered.
- **ZapsnagButton Order Tags**: `ZapsnagButton.tsx` sends full order metadata (productData, orderAmount, orderCurrency, paymentType, paymentReference, status) to `constructGiftWrappedEvent`, ensuring zapsnag orders display properly in the orders dashboard with product name, amount, and payment info.
- **MCP Order Emails**: `pages/api/mcp/create-order.ts` `sendOrderEmail()` passes full order metadata (shippingAddress, selectedSize, selectedVolume, selectedWeight, selectedBulkOption, productId, quantity) to the email API, ensuring MCP-created orders produce complete seller/buyer notification emails with variant and shipping details.
- **Order Summary Payment Display**: Both `pages/order-summary/index.tsx` and `components/storefront/storefront-order-confirmation.tsx` use `resolveExplicitPaymentMethod()` as the canonical source for payment method names, with additional descriptive labels for the summary context (e.g., "Lightning" → "Lightning Network", "Card" → "Credit Card (Stripe)"). Free shipping displays use the order's actual currency instead of hardcoded "$".

## Payment Systems

- **Lightning Network**: Direct invoice generation and payment verification.
- **Cashu eCash**: Integration with Cashu mints. Uses `@cashu/cashu-ts` v4.1.0 (`Mint`/`Wallet`/`Keyset` exports; bolt11-suffixed quote helpers; `Amount` boundary type with `.toNumber()`; `KeyChain.getKeysets()`; explicit `await wallet.loadMint()` after construction; `getDecodedToken(token, keysetIds)` requires the second argument). Payment hardening utilities live in `utils/cashu/`: `mint-retry-service` (`withMintRetry` — rate-limit-aware exponential backoff for transient mint errors), `swap-retry-service` (`safeSwap` returns `{status, proofs}` outcomes), `melt-retry-service` (`safeMeltProofs` returns `{status, changeProofs, errorMessage}`), `pending-mint-operations` (DB-backed `pending_mint_quotes` table for orphan recovery via `recordPendingMintQuote`/`markMintQuotePaid`/`markMintQuoteClaimed`), and `wallet-recovery` (boot-time reconciler mounted via `components/utility-components/mint-recovery-boot.tsx` in `pages/_app.tsx`). All cashu call sites in `components/wallet/*`, `components/cart-invoice-card.tsx`, `components/product-invoice-card.tsx`, `components/utility-components/claim-button.tsx`, `mcp/tools/write-tools.ts`, and `pages/api/mcp/{create-order,verify-payment}.ts` use these wrappers and check melt/swap status before treating the operation as successful.
- **Stripe Connect**: Express accounts for sellers to accept credit card payments. Uses embedded Stripe Elements card form (PaymentIntent API) for on-site checkout instead of external Stripe hosted pages. Card form component at `components/utility-components/stripe-card-form.tsx`, PaymentIntent API at `pages/api/stripe/create-payment-intent.ts`. Shared currency conversion utilities in `utils/stripe/currency.ts` (`satsToUSD`, `isCrypto`, `toSmallestUnit`, `convertToSmallestUnit`, `ZERO_DECIMAL_CURRENCIES`) — uses `@getalby/lightning-tools` for live BTC→fiat conversion with no hardcoded fallback. Both webhook endpoints (`webhook.ts` and `subscription-webhook.ts`) require `STRIPE_WEBHOOK_SECRET` / `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` and reject unverified payloads. Both webhooks dedupe replays by claiming the Stripe event ID via `claimStripeEvent` (table `stripe_processed_events`, fail-open on table errors). Transient Stripe API errors are retried with rate-limit-aware exponential backoff via `withStripeRetry` (`utils/stripe/retry-service.ts`); all PaymentIntent / Subscription / Invoice / Transfer create calls include a deterministic `idempotencyKey` derived from the request payload via `stableIdempotencyKey()` so a client-side retry of the same purchase dedupes at Stripe (returning the original resource within Stripe's 24h idempotency window) instead of creating duplicates. Pending payments are tracked in `stripe_pending_payments` (`utils/stripe/pending-payments.ts`) for orphan reconciliation; the webhook updates status on `payment_intent.succeeded` / `payment_failed`. Failed payments trigger email notifications to both buyer and seller via `sendPaymentFailedToBuyer` / `sendPaymentFailedToSeller`. Multi-merchant transfer failures trigger alert emails to platform admin via `sendTransferFailureAlert`.
- **API Rate Limiting**: All public API endpoints under `pages/api/**` use the in-memory token bucket in `utils/rate-limit.ts` (`checkRateLimit` + `applyRateLimit`/`getRequestIp`) keyed by client IP. Standard `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` headers are emitted, and 429 responses include a `Retry-After` header. Buckets are per-process (`Map`), so under horizontal scaling the effective ceiling is `N × limit`; this is intentional as a coarse DB-pool guard, not a strict cryptographic ceiling. Coverage extends beyond upstream to `pages/api/stripe/**` and to secret-gated cron endpoints (`email/flows/process`, `email/flows/cron-abandoned-cart`, `email/flows/cron-winback`, `stripe/cron-cleanup`) as belt-and-suspenders against secret leak; webhook endpoints rely on signature + Stripe-event idempotency instead of IP buckets.
- **Stripe Table Maintenance**: `pages/api/stripe/cron-cleanup.ts` (POST, gated by `FLOW_PROCESSOR_SECRET`) prunes `stripe_processed_events` rows older than 45 days (Stripe's replay window is ~30) via `pruneStripeProcessedEvents`, and prunes `stripe_pending_payments` rows in terminal status (`succeeded`/`failed_terminal`/`abandoned`) older than 30 days via `pruneStripePendingPayments`. Active rows (`creating`/`created`) are preserved regardless of age so orphan-recovery still sees them. Both retention windows are overridable per-call via `processed_events_max_age_days` / `pending_payments_max_age_days` body params (minimum 7 days each).
- **Donation Field**: Sellers' Milk Market platform-donation percentage lives in the Nostr profile JSON under `mm_donation` (was `shopstr_donation` upstream). When the field is absent the seller defaults to 2.1%; no fallback to the legacy key. The profile form writes only `mm_donation` and strips any stale `shopstr_donation` on save. Donation eCash is sent to `process.env.NEXT_PUBLIC_MILK_MARKET_PK` (was a hardcoded shopstr platform pubkey upstream); the send is skipped with a warn if the env var is unset.
- **Stripe Donation Parity (DM + dashboard)**: Stripe success handlers in `components/cart-invoice-card.tsx` and `components/product-invoice-card.tsx` now compute the per-product/per-seller donation amount from the cached profile (`profileContext.profileData.get(pubkey).content.mm_donation`, defaulting to 2.1%) and pass `donationAmountValue`/`donationPercentageValue` into every payment-and-receipt `sendPaymentAndContactMessage` call. The shared helper in `utils/nostr/nostr-helper-functions.ts` already emits a `donation_amount` tag whenever those values are present, so the orders dashboard now displays the donation row for Stripe orders the same way it does for Cashu/Lightning. The Stripe webhook (`pages/api/stripe/webhook.ts`) also handles `application_fee.created` and `application_fee.refunded` events, logging `STRIPE_DONATION_COLLECTED` / `STRIPE_DONATION_REFUNDED` lines for reconciliation against those dashboard totals.
- **Stripe Donation Parity**: All Stripe payment paths now apply the same `mm_donation` cut as the Cashu/Lightning paths so card-paying buyers fund the platform on equal terms with Bitcoin-paying buyers. The server-side helper `utils/stripe/donation.ts` reads the seller's `mm_donation` from the cached `profile_events` (kind=0) row, defaults to 2.1% when the row is missing/malformed, caches per-seller for 5 minutes, skips the deduction when the seller pubkey equals `NEXT_PUBLIC_MILK_MARKET_PK`, and falls back to no fee when the computed cut would be ≥ the gross (so a tiny floor charge never breaks). Wiring sites: `create-payment-intent.ts` adds `application_fee_amount` for single-merchant direct charges and embeds per-seller `donationPercent`/`donationCutSmallest` into the multi-merchant `sellerSplits` metadata; `process-transfers.ts` withholds that cut from each `Transfer.amount` (preferring the embedded values, falling back to a fresh profile lookup so older clients still get parity); `create-subscription.ts` and `create-cart-subscription.ts` set `application_fee_percent` on direct-charge subscriptions; `create-invoice.ts` sets `application_fee_amount` on direct-billed invoices; the multi-merchant cart-subscription helper enriches its `sellerSplits` metadata with the same donation fields so downstream invoice-paid transfers stay consistent. Platform-account selling-to-itself is a no-op everywhere.
- **Runtime**: Node `>=22.4.0` (`.nvmrc` = `22`); `@cashu/cashu-ts` pinned to `4.1.0`.
- **Pricing Round-Up Policy**: Display-side currency conversions and on-the-wire charge math all use `Math.ceil` (never `round` / `floor`) so the user is never quoted less than they will be charged. Applied across `pages/cart/index.tsx` (`convertPriceToSats`, `convertShippingToSats`, `subtotalNative`, cross-currency fiat subtotal), `pages/api/mcp/create-order.ts` (sats × 2 sites + Stripe cents), and `components/cart-invoice-card.tsx` seller-payout splitting. Stripe charges below the gateway floor surface a transparent "$0.50 minimum" banner instead of silently failing.
- **Domain / User-Agent**: Storefront custom-domain verification (`pages/api/storefront/verify-domain.ts`) targets `milk.market` (CNAME + A-record fallback). Open Graph crawler (`pages/api/og-preview.ts`) advertises User-Agent `MilkMarket/1.0 (+https://milk.market)`.
- **Fiat Support**: Traditional payment processing (Venmo, Zelle, Cash App, PayPal, Apple Pay, Google Pay, Cash). Multi-merchant fiat checkout supported: each seller with fiat options gets their own payment method dropdown, per-merchant payment instructions with per-merchant amounts, and individual confirmation checkboxes. Order is only confirmed when all merchant checkboxes are checked. Single-merchant carts retain the original single-dropdown flow.
- **Multi-Currency**: Cart display currency is determined by the most common currency among cart items (tiebreak: USD > sats > alphabetical). Mixed-currency carts convert non-matching products to the cart currency via `@getalby/lightning-tools` exchange rates. Stripe payments use the native fiat currency directly (EUR, INR, GBP, etc.) — only sats/BTC are converted to USD. Zero-decimal currencies (JPY, KRW, etc.) are handled correctly. Both `create-subscription.ts` (single-product) and `create-cart-subscription.ts` (cart) use native fiat currencies for Stripe prices and subscription records. `process-transfers.ts` reads the currency from the PaymentIntent for multi-merchant transfers; `webhook.ts` reads the currency from the invoice for subscription renewal transfers. Bitcoin/Lightning payments always use sats; Lightning buttons show fiat amount + sats estimate for fiat-priced products. Nostr order messages include `["currency", "..."]` and `["amount", "..."]` tags. Emails and order summaries use the cart's native display currency. `nativeTotalCost` and `nativeCostsPerProduct` are async (useEffect+state) to support cross-currency conversion. Sats-only carts show USD estimate on Stripe/fiat payment buttons. Server-side Nostr DMs (subscription notifications) are published to relays via `ws` WebSocket connections in addition to being cached locally. Subscriptions are created with `status: "pending"` and activated to `"active"` on first successful payment via the subscription webhook.

## Inventory Management

- **Centralized Inventory**: PostgreSQL `inventory` table tracks stock per product (and per variant like size), with automatic deduction on orders.
- **Tables**: `inventory` (product_id, seller_pubkey, variant_key, quantity, source), `inventory_log` (audit trail with change_amount, reason, order_id).
- **Variant Keys**: `_default` for global stock, `size:SizeName` for size-specific stock.
- **Automatic Stock Deduction**: All order flows (MCP Stripe/Lightning/Cashu/Fiat, frontend checkout, cart checkout) automatically deduct stock from the central inventory after successful orders. Bulk/bundle orders correctly multiply the bundle size × order quantity for the deduction (e.g., 2 orders of a 5-pack deducts 10 units).
- **Seller Manual Override**: When a seller publishes/updates a product listing (kind 30402) with quantity tags, the inventory is synced with `source: 'seller_override'`, overriding the tracked quantity.
- **Availability Checks**: MCP order creation checks central inventory first; falls back to Nostr event quantities if the product isn't yet tracked in the inventory table.
- **Stock Restore**: `restoreStock()` function available for cancelled/refunded orders.
- **API Endpoint**: `/api/inventory` supports actions: `check`, `deduct`, `set`, `restore`, `sync`. GET returns stock for a product.
- **Service**: `utils/db/inventory-service.ts` — `getStock`, `getAllStock`, `setStock`, `deductStock`, `restoreStock`, `syncFromNostrEvent`, `checkAvailability`.
- **Integration Points**: `pages/api/mcp/create-order.ts` (stock check + deduction), `pages/api/mcp/verify-payment.ts` (deduction on Lightning confirm), `pages/api/email/send-order-email.ts` (deduction for frontend orders), `utils/db/db-service.ts` `cacheEvent()` (auto-sync on product event cache), `components/ZapsnagButton.tsx` (checks central inventory for sold count), `components/cart-invoice-card.tsx` (per-product deduction on cart payment confirm).

## Data Management

- **Event Parsing**: Custom parsers for various data types.
- **Caching Strategy**: Hybrid local IndexedDB and real-time Nostr events. Kind 1111 events are disambiguated by tags: NIP-22 review replies (with `K` tags) go to `comment_events`, community posts (with `a:34550:...` tags) go to `community_events`. Community posts (kind 1111) and approval events (kind 4550) are cached on fetch and loaded DB-first via `fetchCommunityPostsFromDb` / `pages/api/db/fetch-community-posts.ts`.
- **File Storage**: Blossom server integration for decentralized media.
- **Encryption**: NIP-44 for private messages and documents.

## Trust & Web of Trust

- **Social Graph**: Follow-based trust system.
- **Review System**: User reviews with weighted scoring. Sentiment-based quality labels (Trustworthy/Solid/Questionable/Don't trust) with color coding. Sellers can reply to reviews on their products using NIP-22 (kind 1111) comment events via `publishReviewReply` in `nostr-helper-functions.ts`. Replies are displayed across all review surfaces (checkout card, marketplace, storefront). Shared reply component: `components/utility-components/seller-review-reply.tsx`. Review event IDs and replies stored in `ReviewsContext` (`reviewEventIds`, `reviewReplies`). NIP-22 review reply events cached in `comment_events` DB table.
- **WoT Filtering**: Filtering based on follow relationships.

## Key Features

- **Order Summary Page**: Dedicated page post-purchase, displaying product details, cost, payment, and shipping.
- **Email Notifications & Guest Checkout**: Transactional emails via SendGrid for order confirmations, seller alerts, and shipping updates; allows purchases without sign-in using an email.
- **Custom Email Flows**: Sellers can draft and manage automated email sequences (welcome series, abandoned cart, post-purchase, winback). Each flow contains timed steps with customizable subject lines and HTML body content. Supports merge tags (`{{buyer_name}}`, `{{shop_name}}`, `{{product_title}}`, `{{order_id}}`, `{{product_image}}`, `{{shop_url}}`). Default templates provided for all 4 flow types. Post-purchase and welcome series flows auto-trigger on order placement. Abandoned cart flow triggered automatically via cron endpoint (`pages/api/email/flows/cron-abandoned-cart.ts`) that scans `cart_reports` for stale unenrolled carts (default 60min) and enrolls them. Winback flow triggered via cron endpoint (`pages/api/email/flows/cron-winback.ts`) that finds customers inactive for N days (default 30) and enrolls them. Both cron endpoints secured with `FLOW_PROCESSOR_SECRET`. A processor endpoint handles sending pending emails in batches. Database tables: `email_flows`, `email_flow_steps`, `email_flow_enrollments`, `email_flow_executions`, `cart_reports`. DB helper functions: `getUnenrolledAbandonedCarts()`, `markCartEnrolled()`, `getWinbackCandidates()`. API routes under `pages/api/email/flows/`. Flow templates and merge tag rendering in `utils/email/flow-email-templates.ts`. Visual email builder component at `components/settings/flow-step-editor.tsx` with formatting toolbar (heading, paragraph, bold, italic, image upload via Blossom, link, CTA button, divider), raw HTML toggle, live preview, and clickable merge tag insertion. Per-flow sender settings: custom "From Name" (display name on sent emails) and "Reply-To" email address stored in `from_name` and `reply_to` columns on `email_flows` table. The processor uses these to customize the SendGrid `from` field (name + platform email) and `replyTo` header per flow. Flow deletion cascades to all related steps, enrollments, and executions in a transaction. Step update/delete endpoints verify the step belongs to the specified flow to prevent cross-flow authorization bypass. MCP tools: `create_email_flow`, `list_email_flows`, `update_email_flow`, `delete_email_flow`, `toggle_email_flow`, `get_email_flow_stats`. Processor endpoint (`pages/api/email/flows/process.ts`) secured with `FLOW_PROCESSOR_SECRET` env var. Internal scheduler (`utils/email/flow-scheduler.ts`) auto-starts via Next.js instrumentation (`instrumentation.ts`) and runs: email processor every 2 min, abandoned cart cron every 30 min, winback cron once daily. Scheduler requires `FLOW_PROCESSOR_SECRET` env var to be set; gracefully disables itself otherwise. Cart activity is reported per-merchant from the checkout component (`components/cart-invoice-card.tsx`) when the buyer's email is known.
- **Landing Page Optimization**: Redesigned following YC best practices for improved conversion with a clear CTA, outcome-first headline, social proof, and simplified sections.
- **Herdshare Agreement Management**: Column in orders dashboard for signing and viewing herdshare agreements using PDFAnnotator.
- **Inquiry Email Notifications**: When a user sends a direct inquiry message, an email notification is sent to the recipient (if they have an email on file). The email includes the message content and sets the reply-to address to the sender's email (if available). If the sender has no email, the email tells the recipient to reply via the Inquiries chat. If neither party has email, no emails are sent. Email template `inquiryNotificationEmail` in `utils/email/email-templates.ts`, service function `sendInquiryNotification` in `utils/email/email-service.ts`, API endpoint `/api/email/send-inquiry-email`. Triggered from `components/messages/messages.tsx` after successful gift-wrapped DM send.
- **Return/Refund/Exchange Requests**: Buyers can request returns, refunds, or exchanges from the orders dashboard. Opens a modal with request type selector and editable default message. Sends a gift-wrapped Nostr DM (subject `return-request`) to the seller with the request details, plus an email notification via `/api/email/send-return-request-email`. Buyer sees "Return Requested" status after sending. Sellers see an alert badge on the order's status column when a return request is received. Return request type stored in the `status` tag of the gift-wrapped event. Email template in `utils/email/email-templates.ts` (`returnRequestEmail`), service function in `utils/email/email-service.ts` (`sendReturnRequestToSeller`).
- **Stripe Connect Integration**: Full Stripe Connect Express flow for sellers to accept credit card payments via their own connected accounts. Stripe Connect API endpoints (`create-account`, `create-account-link`, `account-status`) use the mandatory `McpRequestProof` signed event system (same as MCP API key endpoints) for authentication — proof builders in `utils/mcp/request-proof.ts`, server-side verification via `verifyAndConsumeSignedRequestProof` in `utils/mcp/request-proof-server.ts`.
- **Bulk/Bundle Pricing**: Supports both global and per-variant (per-volume, per-weight) tiered pricing. Tag format: `["bulk", "units", "price"]` for global, `["bulk", "units", "price", "variantName"]` for variant-specific. The bundle selector only appears when the selected variant has bulk tiers defined. Parsed into `bulkPrices` (global) and `variantBulkPrices` (per-variant Map<string, Map<number, number>>). When switching variants, the bulk selection resets.
- **Size and Volume Options**: Integration of product size and volume selections into order messages and dashboard displays.
- **Pickup Location Selection**: Option for buyers to select pickup locations for orders with pickup shipping methods.
- **Order Status Persistence**: Database persistence of order statuses with a priority system to prevent downgrades, ensuring consistent tracking.
- **Unread/Read Indicator System**: Tracks read status of messages and orders, with visual indicators and automatic marking as read.
- **Image Compression**: Automatic compression of large images before Blossom uploads, converting to WebP and scaling resolution if necessary.
- **Subscribe & Save (Recurring Subscriptions)**: Sellers can enable subscription pricing on listings with configurable discount percentages and delivery frequencies (weekly, every 2 weeks, monthly, every 2 months, quarterly). Product pages show two pricing cards (Subscribe & Save default, One-Time Purchase). Checkout creates Stripe Subscriptions via connected accounts. Guest buyers must provide email for subscriptions. Subscription management page under Orders tab allows cancellation, delivery date changes, and address changes. Renewal reminders sent via email and Nostr DMs one week before billing. Address changes notify sellers via gift-wrapped Nostr DMs. Guest users can manage subscriptions via email lookup. Cart checkout supports subscription products: per-product subscription toggle and frequency selector on the cart page, subscription info badges in checkout order summaries, and a dedicated cart subscription API (`pages/api/stripe/create-cart-subscription.ts`) that handles mixed carts with both subscription (recurring) and one-time items on a single Stripe invoice. Multi-merchant subscriptions are supported when all sellers have Stripe — subscription is created on the platform account and funds are transferred to each merchant.
- **Cart Multi-Payment Support**: Card payment is available whenever all merchants in the cart have Stripe enabled — single-merchant carts use direct charges on the connected account, multi-merchant carts use Stripe's "Separate Charges and Transfers" model where payment is collected on the platform and funds are transferred to each merchant's connected account via `pages/api/stripe/process-transfers.ts`. Fiat payment options are available only for single-merchant carts. Bitcoin payments (Lightning, Cashu, NWC) are always available. When any product has an active subscription selection, only card payment is available. A Stripe webhook endpoint (`pages/api/stripe/webhook.ts`) handles automatic fund distribution on subscription renewal payments for multi-merchant subscriptions.
- **Free Shipping Threshold**: Merchants can set a minimum order amount (with currency) in their shop profile; when a buyer's order from that seller meets the threshold, all shipping costs drop to zero. Shipping is consolidated per seller (highest shipping cost used, not sum). Progress toward free shipping is shown in cart and checkout with progress bars, and a popup notification appears when adding items to cart from eligible merchants. Order summary shows strikethrough original shipping cost with green "Free" badge when threshold is met. Shop profile fields: `freeShippingThreshold` (number) and `freeShippingCurrency` (string) stored in Kind 30019 event content JSON.
- **Payment Method Discounts**: Merchants can set flat percentage discounts for specific payment methods in their shop profile. Supports discounts for Bitcoin (Lightning/Cashu/NWC), Stripe (Card), and each individual fiat payment option (Cash, Venmo, etc.). Discounted prices are displayed on payment method buttons during checkout in both single-product and cart invoice cards, with a "(X% off)" label. The actual payment amount sent to invoices reflects the method-specific discount. Shop profile field: `paymentMethodDiscounts` (object mapping method keys like `"bitcoin"`, `"stripe"`, `"cash"`, `"venmo"` to discount percentages) stored in Kind 30019 event content JSON.
- **Seller Storefronts**: Sellers can set up customizable standalone shop pages accessible via `/shop/[slug]`. Custom domains available on request (contact us flow in settings). Storefront customization includes: color scheme (with per-color usage hints), independent navbar colors (background/text/accent), independent footer colors (background/text/accent), landing page style, product layout, Google Fonts or custom uploaded fonts (.woff2/.woff/.ttf/.otf via Blossom), section-based page builder, multi-page navigation, custom footer with social links, and store policies. **SEO & Open Graph Meta**: Each storefront supports custom SEO meta tags and Open Graph previews for search engines, social media, and AI-powered search (GEO). Fields: meta title, meta description, OG image, keywords, locale, location region (geo.region), location city (geo.placename). An "auto-generate" mode fills empty fields from shop name/about/slug at save time. SSR renders the SEO meta in `getServerSideProps` for both `[slug].tsx` and `[...shopPath].tsx`. The `storefront-layout.tsx` also injects meta tags client-side via `<Head>`. Type: `StorefrontSeoMeta` in `packages/domain/src/storefront.ts`. Settings UI in `shop-profile-form.tsx` under "SEO & Open Graph" section. **Built-in Shop Page**: Every storefront gets a dedicated "Shop" page (`/shop/[slug]/shop`) with search, category filters (pill toggles based on seller's actual product categories), location filter, sort options (newest/oldest/price/name), and paginated product grid — all styled with storefront colors. The "Shop" link is auto-injected into the navbar if not already present. Component: `components/storefront/storefront-shop-page.tsx`. Uses `productSatisfiesAllFilters` from `utils/parsers/product-filter-helpers.ts`. Preview panel shows a mockup of search/categories/grid for the shop page. **Independent Nav/Footer Colors**: Navbar and footer each have their own `StorefrontNavColors`/`StorefrontFooterColors` types with `background`, `text`, and `accent` fields in `StorefrontConfig`. When not set, they fall back to the general color scheme (secondary→bg, background→text, primary→accent). Settings UI shows color pickers with reset-to-default buttons for each. All rendering surfaces (storefront-layout, storefront-theme-wrapper, storefront-nav, storefront-footer, preview panel, preview modal) respect these overrides. **Custom Font Uploads**: Sellers can upload their own font files for heading and/or body text. Uploaded fonts are stored via Blossom and rendered using `@font-face` CSS injection in `StorefrontThemeWrapper`. Custom fonts override Google Font selections. Config fields: `customFontHeadingUrl`, `customFontHeadingName`, `customFontBodyUrl`, `customFontBodyName` in `StorefrontConfig`. **Live Preview Panel**: The storefront builder has a split-screen layout on large screens (≥1280px) with settings editor on the left (~45%) and a live preview panel on the right (~55%) that updates instantly as settings change. The preview panel includes viewport toggle (Desktop/Tablet/Mobile) and page switcher for custom pages. On small/medium screens, a floating "Preview" button opens a full-screen overlay with the same live preview. The "Add Section" menu uses visual thumbnail cards with icons and descriptions. Landing page style and product layout selectors show SVG mini-mockup previews illustrating each option's appearance. **Product Ordering**: Product sections support manual ordering via `productIds` (drag-and-drop reorder list in section editor) and `heroProductId` (dropdown to select which product is featured prominently in "featured" layout). Ordering is applied in `SectionProducts` via `applyProductOrder()` which first sorts by `productIds` then moves the hero product to position 0 for featured layout. Both live storefront and preview panel respect these ordering fields. The preview rendering logic is extracted into a reusable `StorefrontPreviewPanel` component (`components/settings/storefront/storefront-preview-panel.tsx`) that is shared between the side panel, mobile overlay, and the full-screen modal (which remains as a fallback). The settings page (`pages/settings/shop-profile.tsx`) uses a wider container on xl screens to accommodate the split layout. **Focused Storefront Loading**: When a storefront is accessed directly via slug URL, only data relevant to that specific seller is loaded (their products, profile, shop profile, reviews, and community). The full marketplace data (all products, all profiles, chats, wallet, follows) is deferred until the user navigates away to the marketplace or another non-storefront page. Slug-to-pubkey resolution happens immediately via the `/api/storefront/lookup` DB endpoint, bypassing the Nostr websocket initialization chain. The focused fetch function is `fetchStorefrontData` in `utils/nostr/fetch-service.ts`. Products can be fetched by pubkey via `GET /api/db/fetch-products?pubkey=...`. A 15-second timeout ensures the storefront page never spins indefinitely. **Store Policies**: Four policy types (Return & Refund, Terms of Service, Privacy Policy, Cancellation Policy) enabled by default with seller-adapted templates. Sellers can toggle each on/off and edit content (Markdown). Policy links in footer open full pages within the storefront. Templates in `utils/storefront-policies.ts`, types in `utils/types/types.ts`, renderer in `components/storefront/storefront-policy-page.tsx`. Policies stored in `footer.policies` of `StorefrontConfig`. Custom domain proxy routing in `proxy.ts` restricts custom domains to storefront-only routes. **Email Capture Popup**: Sellers can enable a popup that appears to new storefront visitors after 3 seconds, offering a seller-configured discount percentage in exchange for email (and optionally phone number). Auto-generates a unique discount code (valid 90 days), saves it to the `discount_codes` table for checkout use, stores capture in `popup_email_captures` table, and emails the code to the buyer via SendGrid. Popup dismissal persisted in localStorage per shop. Configuration stored in `emailPopup` field of `StorefrontConfig` with options for headline, subtext, button text, success message, phone collection, and discount percentage. Popup component at `components/storefront/storefront-email-popup.tsx`, API at `pages/api/storefront/popup-capture.ts`, email template `popupDiscountEmail` in `utils/email/email-templates.ts`, DB functions `savePopupEmailCapture` and `getPopupEmailCapture` in `utils/db/db-service.ts`. Settings UI in the "Email Capture Popup" section of the shop profile form.

# External Dependencies

## Nostr Infrastructure

- **Nostr Relays**: For event publishing and subscription.
- **Blossom Servers**: For decentralized media storage.
- **NIP-05 Verification**: For DNS-based identity verification.

## Payment Services

- **Lightning Network**: For invoice generation and verification.
- **Cashu Mints**: For eCash token services.
- **Getalby Lightning Tools**: For Lightning address and payment utilities.
- **Stripe**: For credit card payment processing via Stripe Connect.
- **SendGrid**: For transactional email services.

## Third-Party Libraries

- **Cryptography**: `crypto-js`, `nostr-tools`, `@cashu/cashu-ts`.
- **UI Components**: `@heroui/react`, `@heroicons/react`, `framer-motion`.
- **Payments**: `stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`.
- **File Processing**: `pdf-lib`, `qrcode`.
- **MCP**: `@modelcontextprotocol/sdk` for AI agent integration.

## MCP Server (AI Agent Integration)

The platform exposes a Model Context Protocol (MCP) server enabling AI agents to programmatically participate in the marketplace as both buyers and sellers. Agents can browse products, place orders, create listings, manage shop profiles, upload media, send encrypted DMs, publish reviews, manage communities, configure relays/blossom servers, handle discount codes, and manage Cashu wallets — all using their Nostr keys for event signing.

### Architecture

- **MCP Endpoint**: `pages/api/mcp/index.ts` — Streamable HTTP transport endpoint that handles MCP protocol messages
- **Server Factory**: `mcp/server.ts` — Creates the MCP server with registered tools and resources
- **Read Tools**: `mcp/tools/read-tools.ts` — Tools for browsing products, companies, reviews, and discount codes
- **Write Tools**: `mcp/tools/write-tools.ts` — Tools for full marketplace participation (profiles, listings, reviews, DMs, media, relay/blossom config, discount codes, Cashu wallet, custom domains, storefront policies, email popup config, email capture list)
- **Purchase Tools**: Inline in `pages/api/mcp/index.ts` — Order creation, status, payment verification
- **Resources**: `mcp/resources.ts` — MCP resources (product catalog via `milkmarket://catalog/products`)
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

### Available MCP Tools

**Read Tools (any valid key):**

- `search_products` — Search/filter products by keyword, category, location, price range. Responses include subscription info, variant options (sizes, volumes, weights, bulk), herdshare agreements, pickup locations, and required customer info
- `get_product_details` — Get full details for a product by ID, including all variant options, subscription settings, herdshare agreement URL, and pickup locations
- `list_companies` — List all seller/shop profiles with fiat options, payment method discounts, and free shipping settings
- `get_company_details` — Get a company's profile, products, and reviews. Profile includes fiat options, payment preferences, payment method discounts, and free shipping thresholds
- `get_reviews` — Get reviews for a product or seller, including seller replies (kind 1111)
- `check_discount_code` — Validate a discount code
- `get_payment_methods` — Get available payment methods for a seller (stripe, lightning, cashu, fiat)

**Purchase Tools (requires read_write or full_access):**

- `create_order` — Place an order with payment method selection (`stripe`/`lightning`/`cashu`/`fiat`), product spec selection (`selectedSize`/`selectedVolume`/`selectedBulkUnits`/`selectedWeight`), and optional `shippingAddress`. Supports: `stripe` (credit card), `lightning` (Bitcoin Lightning invoice), `cashu` (ecash tokens), `fiat` (Venmo, Cash App, Zelle, etc.)
- `verify_payment` — Verify Lightning invoice payment status
- `get_order_status` — Check order status
- `list_orders` — List orders
- `create_subscription` — Create a recurring subscription order for a subscription-enabled product. Requires product to have subscription tags. Parameters: productId, frequency (weekly/every_2_weeks/monthly/every_2_months/quarterly), buyerEmail, quantity, shippingAddress, selectedSize, selectedVolume, selectedWeight. Creates a Stripe Subscription via the seller's connected account.
- `list_subscriptions` — List buyer's subscriptions by pubkey or email
- `cancel_subscription` — Cancel an existing subscription (remains active until end of billing period)
- `update_subscription` — Update subscription shipping address or next billing date
- - `list_seller_orders` — List incoming orders as seller, with optional status filter
- `get_notifications` — Check for new activity: unread message count, recent orders as buyer/seller, and `actionRequired` summary (pending payments, orders to fulfill, unread messages)

**Write Tools (requires full_access + stored nsec):**

- `set_user_profile` — Create/update Nostr user profile (kind 0). Supports fiat_options (object mapping method names to usernames, e.g. `{venmo: "@handle"}`), payment_preference (ecash/lightning/fiat), and standard fields (name, about, picture, banner, lud16, nip05, website)
- `set_shop_profile` — Create/update shop profile (kind 30019). Supports paymentMethodDiscounts (object mapping method keys like "bitcoin", "stripe", "venmo" to discount percentages), freeShippingThreshold, freeShippingCurrency, and standard fields (name, about, picture, banner, theme, darkMode, merchants)
- `set_notification_email` — Set notification email address for order updates and communications. Supports both buyer and seller roles
- `get_notification_email` — Retrieve configured notification email by pubkey and optional role
- `create_product_listing` — Publish product listing (kind 30402) with full tag support, including sizes, volumes, weights (with per-weight pricing), bulk/bundle pricing, pickup locations, expiration, herdshareAgreement (URL), requiredCustomerInfo, and subscription settings (subscriptionEnabled, subscriptionDiscount, subscriptionFrequencies)
- `update_product_listing` — Update existing listing by d-tag, supports all fields including sizes, volumes, weights, bulk pricing, pickup locations, expiration, herdshare agreement, required customer info, and subscription settings
- `delete_listing` — Delete events (kind 5)
- `publish_review` — Publish review (kind 31555) with ratings
- `reply_to_review` — Reply to a product review as the seller (kind 1111, NIP-22). Validates seller ownership and enforces one reply per review
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
- `list_seller_subscriptions` — List all subscriptions to your products with optional status filter (active/paused/canceled)
- `update_order_address` — Change shipping address post-purchase, sends encrypted address change DM to seller and updates order record
- `send_shipping_update` — Send shipping info (tracking number, carrier, ETA) to buyer via encrypted DM and update order status to shipped
- `update_order_status` — Update order status (confirmed/shipped/delivered/completed/cancelled) with optional notification DM to buyer
- `list_messages` — Fetch and decrypt incoming NIP-17 DMs with filters for unread, subject type, and sender. Returns decrypted content, subject, order IDs, and read status
- `mark_messages_read` — Mark specific messages as read by event ID
- `create_email_flow` — Create an automated email flow (welcome_series, abandoned_cart, post_purchase, winback) with optional default template steps or custom steps
- `list_email_flows` — List all email flows for the authenticated seller
- `update_email_flow` — Update a flow's name and/or steps (add, update, or delete steps)
- `delete_email_flow` — Delete a flow and all associated data
- `toggle_email_flow` — Toggle a flow between active and paused status
- `get_email_flow_stats` — Get enrollment and per-step execution statistics for a flow

### Payment Methods

- **Lightning**: Generates a Cashu mint quote (bolt11 invoice) via `@cashu/cashu-ts`. Agent pays the invoice, then calls `verify_payment` to confirm. Default mint: `https://mint.minibits.cash/Bitcoin`.
- **Cashu**: Agent provides a serialized Cashu token string. Server verifies and redeems the tokens.
- **Stripe**: Creates a Stripe PaymentIntent. Agent completes payment via Stripe SDK.
- **Fiat**: Returns seller's fiat payment handles (Venmo, Cash App, etc.). Agent sends payment externally and includes order ID in memo. Seller confirms receipt manually.
- **Payment method discounts**: Sellers can set per-method discounts (e.g., 10% off Bitcoin). Applied automatically in order pricing.

#### Permission Levels

- `read` — Browse-only access (search products, view profiles/reviews)
- `read_write` — Browse + purchase (place orders, verify payments)
- `full_access` — Full marketplace participation (all read/write tools + server-side Nostr event signing). Requires nsec stored during onboarding or via `/api/mcp/set-nsec`.

#### Server-Side Nostr Signing

Agents with `full_access` permission have their Nostr private key (nsec) stored encrypted in the database using AES-256-GCM. The encryption key is configured via the `MCP_ENCRYPTION_KEY` environment variable. The `McpNostrSigner` class provides `sign()`, `encrypt()`, `decrypt()`, and `getPubKey()` methods without browser dependencies. Events are signed server-side, cached to the database, and published to relays via `McpRelayManager` (using `nostr-tools` SimplePool).

#### Database Tables

- `mcp_api_keys` — API keys with hashed secrets, permissions (read/read_write/full_access), usage tracking, and optional encrypted_nsec for server-side signing
- `mcp_orders` — Orders placed through the MCP/API with payment and status tracking

### Agentic Commerce Endpoints

- **Capabilities Manifest**: `GET /.well-known/agent.json` — Machine-readable service description (unauthenticated). Describes all tools, resources, auth method, endpoints, and pricing model. Implemented via `pages/api/.well-known/agent.json.ts` with a middleware rewrite in `middleware.ts`.
- **Automated Onboarding**: `POST /api/mcp/onboard` — Zero-touch agent registration (unauthenticated). Accepts `{ name, permissions?, contact?, pubkey? }`. If `pubkey` is omitted, generates a new Nostr keypair and returns the `nsec` (bech32-encoded). If `pubkey` is provided (hex or npub1... format), uses that existing identity (no nsec returned, `existingIdentity: true`). Always returns `npub` in bech32 format. Rate-limited to 10 per IP per hour.
- **Status & Metrics**: `GET /api/mcp/status` — Real-time service health and performance metrics (unauthenticated). Returns uptime, latency percentiles (p50/p95/p99), throughput, reliability rates, and data freshness counts. Backed by `utils/mcp/metrics.ts` in-memory collector.
- **Pricing in Protocol**: Every product response includes a structured `pricing` block with amount, currency, unit, shippingCost, shippingType, totalEstimate, and paymentMethods. Order creation returns HTTP 402 with payment instructions when Stripe payment is required.
- **Response Metadata**: All MCP tool responses include `_meta` blocks with `responseTimeMs`, `dataSource` ("cached_db" or "live"), `dataFreshness`, and `resultCount`. HTTP responses include `X-Response-Time` headers.

### Authentication

API keys are created via the `/settings/api-keys` UI page, the `/api/mcp/api-keys` endpoint, or the zero-touch `/api/mcp/onboard` endpoint. Keys use PBKDF2 hashing and Bearer token authentication. Three permission levels: `read` (browse only), `read_write` (browse + purchase), and `full_access` (full marketplace participation with Nostr signing). Key prefix: `sk_`. Agents can set their nsec post-onboarding via `POST /api/mcp/set-nsec`.

## SEO & GEO Optimizations

### On-Page SEO

- **Alt Text & Image Optimization**: All images across landing page (`pages/index.tsx`), producers page (`pages/producer-guide/index.tsx`), and image carousel (`components/utility-components/image-carousel.tsx`) have descriptive alt text and explicit `width`/`height` attributes.
- **Structured Data (JSON-LD)**: Global `Organization`, `WebSite`, `LocalBusiness`, and `FAQPage` schemas injected via `components/structured-data.tsx` (loaded in `_app.tsx`). Contact page has its own `ContactPage` schema.
- **robots.txt**: `public/robots.txt` allows all crawlers, disallows admin/API paths, and references the sitemap.
- **XML Sitemap**: Dynamic sitemap at `pages/api/sitemap.xml.ts`, accessible via `/sitemap.xml` (Next.js rewrite in `next.config.mjs`). Covers all 9 public pages.

### Trust Signal Pages

- **About Us** (`pages/about/index.tsx`): Mission, team info, industry context with USDA citations, expert quote, and statistics.
- **Contact** (`pages/contact/index.tsx`): Email, Nostr, social media links, GitHub, and a mailto-based contact form with subject categories.

### GEO (Generative Engine Optimization)

- **Authoritative Citations**: Inline links to USDA ERS, USDA AMS with specific statistics (e.g., "$44B+ farm revenue", "12% YoY growth in direct sales").
- **Expert Quotes**: Attributed dairy expert quote on landing page and about page.
- **E-E-A-T Signals**: Author/founder schema, team credentials, social proof with real data, and comprehensive business information.

## Dev Mode Optimizations

- **Turbopack**: Dev server uses Turbopack (Next.js default) instead of webpack for significantly faster compilation (~36s vs ~87s initial, sub-second subsequent).
- **PWA disabled in dev**: Service worker and PWA caching are disabled via `next.config.mjs` in development.
- **Flow scheduler disabled in dev**: Email flow scheduler skipped in development to reduce memory pressure.
