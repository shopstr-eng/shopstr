# Overview

Milk Market is a permissionless marketplace built on the Nostr protocol for Bitcoin-enabled commerce, specializing in raw milk and related products. It leverages various Nostr Implementation Possibilities (NIPs) to offer a decentralized, censorship-resistant platform. Users can buy and sell products using Bitcoin via Lightning Network, Cashu eCash tokens, and traditional fiat currencies. The platform supports product listings, order management, encrypted communication, and multi-currency payments, emphasizing user privacy and self-sovereignty within Nostr's architecture. Recent enhancements include a dedicated order summary page, an email notification system with guest checkout, a redesigned landing page for improved conversion, and integration with Stripe Connect for sellers to accept credit card payments.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

- **Framework**: Next.js 14 with TypeScript (App Router), React 18.
- **UI/UX**: NextUI, Tailwind CSS, Framer Motion for animations, PWA support.
- **State Management**: React Context API for various domains (products, profiles, shops, chats, reviews, follows, relays, media, wallet, communities).
- **Data Persistence**: Local storage for user preferences and authentication, service worker for caching.
- **Routing**: Middleware-based URL rewriting, dynamic routing, protected routes for authenticated operations. Friendly URL slugs for listings (title-based) and profiles (name-based) with collision handling via pubkey disambiguation. naddr/npub inputs still resolve but redirect to friendly slugs. URL slug utilities in `utils/url-slugs.ts`.

## Backend Architecture

- **API Routes**: Next.js API routes for server-side logic.
- **Database**: PostgreSQL for relational data storage.
- **File Handling**: Formidable for file uploads.
- **Middleware**: Custom Next.js middleware for routing.

## Authentication & Signing

- **Multiple Signer Support**: NIP-07, NIP-46, and direct nsec key input.
- **Key Management**: NIP-49 encrypted private key storage.
- **Migration System**: Automatic migration to NIP-49 standard.

## Nostr Protocol Implementation

- **Core NIPs**: Implements 15+ NIPs for profiles (NIP-01, NIP-05), marketplace (NIP-99), private messaging (NIP-17), media (Blossom), reviews (NIP-85), and social graph (NIP-02, NIP-51).
- **Relay Management**: Multi-relay support with configurable lists (NIP-65).
- **Event Caching**: Local caching of Nostr events.

## Payment Systems

- **Lightning Network**: Direct invoice generation and payment verification.
- **Cashu eCash**: Integration with Cashu mints.
- **Stripe Connect**: Express accounts for sellers to accept credit card payments. Uses embedded Stripe Elements card form (PaymentIntent API) for on-site checkout instead of external Stripe hosted pages. Card form component at `components/utility-components/stripe-card-form.tsx`, PaymentIntent API at `pages/api/stripe/create-payment-intent.ts`.
- **Fiat Support**: Traditional payment processing (Venmo, Zelle, Cash App, PayPal, Apple Pay, Google Pay, Cash). Multi-merchant fiat checkout supported: each seller with fiat options gets their own payment method dropdown, per-merchant payment instructions with per-merchant amounts, and individual confirmation checkboxes. Order is only confirmed when all merchant checkboxes are checked. Single-merchant carts retain the original single-dropdown flow.
- **Multi-Currency**: Cart display currency is determined by the most common currency among cart items (tiebreak: USD > sats > alphabetical). Mixed-currency carts convert non-matching products to the cart currency via `@getalby/lightning-tools` exchange rates. Stripe payments use the native fiat currency directly (EUR, INR, GBP, etc.) — only sats/BTC are converted to USD. Zero-decimal currencies (JPY, KRW, etc.) are handled correctly. Both `create-subscription.ts` (single-product) and `create-cart-subscription.ts` (cart) use native fiat currencies for Stripe prices and subscription records. `process-transfers.ts` reads the currency from the PaymentIntent for multi-merchant transfers; `webhook.ts` reads the currency from the invoice for subscription renewal transfers. Bitcoin/Lightning payments always use sats; Lightning buttons show fiat amount + sats estimate for fiat-priced products. Nostr order messages include `["currency", "..."]` and `["amount", "..."]` tags. Emails and order summaries use the cart's native display currency. `nativeTotalCost` and `nativeCostsPerProduct` are async (useEffect+state) to support cross-currency conversion. Sats-only carts show USD estimate on Stripe/fiat payment buttons. Server-side Nostr DMs (subscription notifications) are published to relays via `ws` WebSocket connections in addition to being cached locally. Subscriptions are created with `status: "pending"` and activated to `"active"` on first successful payment via the subscription webhook.

## Data Management

- **Event Parsing**: Custom parsers for various data types.
- **Caching Strategy**: Hybrid local IndexedDB and real-time Nostr events.
- **File Storage**: Blossom server integration for decentralized media.
- **Encryption**: NIP-44 for private messages and documents.

## Trust & Web of Trust

- **Social Graph**: Follow-based trust system.
- **Review System**: User reviews with weighted scoring.
- **WoT Filtering**: Filtering based on follow relationships.

## Key Features

- **Order Summary Page**: Dedicated page post-purchase, displaying product details, cost, payment, and shipping.
- **Email Notifications & Guest Checkout**: Transactional emails via SendGrid for order confirmations, seller alerts, and shipping updates; allows purchases without sign-in using an email.
- **Landing Page Optimization**: Redesigned following YC best practices for improved conversion with a clear CTA, outcome-first headline, social proof, and simplified sections.
- **Herdshare Agreement Management**: Column in orders dashboard for signing and viewing herdshare agreements using PDFAnnotator.
- **Stripe Connect Integration**: Full Stripe Connect Express flow for sellers to accept credit card payments via their own connected accounts.
- **Bulk/Bundle Pricing**: Allows sellers to define tiered pricing based on quantity, displayed and calculated in the checkout flow.
- **Size and Volume Options**: Integration of product size and volume selections into order messages and dashboard displays.
- **Pickup Location Selection**: Option for buyers to select pickup locations for orders with pickup shipping methods.
- **Order Status Persistence**: Database persistence of order statuses with a priority system to prevent downgrades, ensuring consistent tracking.
- **Unread/Read Indicator System**: Tracks read status of messages and orders, with visual indicators and automatic marking as read.
- **Image Compression**: Automatic compression of large images before Blossom uploads, converting to WebP and scaling resolution if necessary.
- **Subscribe & Save (Recurring Subscriptions)**: Sellers can enable subscription pricing on listings with configurable discount percentages and delivery frequencies (weekly, every 2 weeks, monthly, every 2 months, quarterly). Product pages show two pricing cards (Subscribe & Save default, One-Time Purchase). Checkout creates Stripe Subscriptions via connected accounts. Guest buyers must provide email for subscriptions. Subscription management page under Orders tab allows cancellation, delivery date changes, and address changes. Renewal reminders sent via email and Nostr DMs one week before billing. Address changes notify sellers via gift-wrapped Nostr DMs. Guest users can manage subscriptions via email lookup. Cart checkout supports subscription products: per-product subscription toggle and frequency selector on the cart page, subscription info badges in checkout order summaries, and a dedicated cart subscription API (`pages/api/stripe/create-cart-subscription.ts`) that handles mixed carts with both subscription (recurring) and one-time items on a single Stripe invoice. Multi-merchant subscriptions are supported when all sellers have Stripe — subscription is created on the platform account and funds are transferred to each merchant.
- **Cart Multi-Payment Support**: Card payment is available whenever all merchants in the cart have Stripe enabled — single-merchant carts use direct charges on the connected account, multi-merchant carts use Stripe's "Separate Charges and Transfers" model where payment is collected on the platform and funds are transferred to each merchant's connected account via `pages/api/stripe/process-transfers.ts`. Fiat payment options are available only for single-merchant carts. Bitcoin payments (Lightning, Cashu, NWC) are always available. When any product has an active subscription selection, only card payment is available. A Stripe webhook endpoint (`pages/api/stripe/webhook.ts`) handles automatic fund distribution on subscription renewal payments for multi-merchant subscriptions.
- **Free Shipping Threshold**: Merchants can set a minimum order amount (with currency) in their shop profile; when a buyer's order from that seller meets the threshold, all shipping costs drop to zero. Shipping is consolidated per seller (highest shipping cost used, not sum). Progress toward free shipping is shown in cart and checkout with progress bars, and a popup notification appears when adding items to cart from eligible merchants. Order summary shows strikethrough original shipping cost with green "Free" badge when threshold is met. Shop profile fields: `freeShippingThreshold` (number) and `freeShippingCurrency` (string) stored in Kind 30019 event content JSON.
- **Payment Method Discounts**: Merchants can set flat percentage discounts for specific payment methods in their shop profile. Supports discounts for Bitcoin (Lightning/Cashu/NWC), Stripe (Card), and each individual fiat payment option (Cash, Venmo, etc.). Discounted prices are displayed on payment method buttons during checkout in both single-product and cart invoice cards, with a "(X% off)" label. The actual payment amount sent to invoices reflects the method-specific discount. Shop profile field: `paymentMethodDiscounts` (object mapping method keys like `"bitcoin"`, `"stripe"`, `"cash"`, `"venmo"` to discount percentages) stored in Kind 30019 event content JSON.

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
- **UI Components**: `@nextui-org/react`, `@heroicons/react`, `framer-motion`.
- **Payments**: `stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`.
- **File Processing**: `pdf-lib`, `qrcode`.
- **MCP**: `@modelcontextprotocol/sdk` for AI agent integration.

## MCP Server (AI Agent Integration)

The platform exposes a Model Context Protocol (MCP) server enabling AI agents to programmatically participate in the marketplace as both buyers and sellers. Agents can browse products, place orders, create listings, manage shop profiles, upload media, send encrypted DMs, publish reviews, manage communities, configure relays/blossom servers, handle discount codes, and manage Cashu wallets — all using their Nostr keys for event signing.

### Architecture

- **MCP Endpoint**: `pages/api/mcp/index.ts` — Streamable HTTP transport endpoint that handles MCP protocol messages
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

### Available MCP Tools

**Read Tools (any valid key):**

- `search_products` — Search/filter products by keyword, category, location, price range
- `get_product_details` — Get full details for a product by ID
- `list_companies` — List all seller/shop profiles
- `get_company_details` — Get a company's profile, products, and reviews
- `get_reviews` — Get reviews for a product or seller
- `check_discount_code` — Validate a discount code
- `get_payment_methods` — Get available payment methods for a seller (stripe, lightning, cashu, fiat)
- `create_order` — Place an order with payment method selection (requires read_write key). Supports: `stripe` (credit card), `lightning` (Bitcoin Lightning invoice), `cashu` (ecash tokens), `fiat` (Venmo, Cash App, Zelle, etc.)
- `verify_payment` — Verify Lightning invoice payment status (requires read_write key)
- `get_order_status` — Check order status (requires read_write key)
- `list_orders` — List orders (requires read_write key)

**Purchase Tools (requires read_write or full_access):**

- `create_order` — Place an order with payment method selection. Supports: `lightning` and `cashu`
- `verify_payment` — Verify Lightning invoice payment status
- `get_order_status` — Check order status
- `list_orders` — List orders

**Write Tools (requires full_access + stored nsec):**

- `set_user_profile` — Create/update Nostr user profile (kind 0)
- `set_shop_profile` — Create/update shop profile (kind 30019)
- `create_product_listing` — Publish product listing (kind 30402) with full tag support
- `update_product_listing` — Update existing listing by d-tag
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
