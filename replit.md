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
- **Fiat Support**: Traditional payment processing.
- **Multi-Currency**: Support for dynamic currency conversion.

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
- **Subscribe & Save (Recurring Subscriptions)**: Sellers can enable subscription pricing on listings with configurable discount percentages and delivery frequencies (weekly, every 2 weeks, monthly, every 2 months, quarterly). Product pages show two pricing cards (Subscribe & Save default, One-Time Purchase). Checkout creates Stripe Subscriptions via connected accounts. Guest buyers must provide email for subscriptions. Subscription management page under Orders tab allows cancellation, delivery date changes, and address changes. Renewal reminders sent via email and Nostr DMs one week before billing. Address changes notify sellers via gift-wrapped Nostr DMs. Guest users can manage subscriptions via email lookup.
- **Cart Multi-Payment Support**: When all cart products are from the same merchant, Stripe (credit card) and fiat payment options (cash, payment apps) are available alongside Bitcoin options. Multi-merchant carts remain Bitcoin-only with an informational note.
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

The platform exposes a Model Context Protocol (MCP) server that allows AI agents to programmatically browse the marketplace and place orders.

### Architecture

- **MCP Endpoint**: `pages/api/mcp/index.ts` — Streamable HTTP transport endpoint that handles MCP protocol messages
- **Server Factory**: `mcp/server.ts` — Creates the MCP server with registered tools and resources
- **Read Tools**: `mcp/tools/read-tools.ts` — Tools for browsing products, companies, reviews, and discount codes
- **Purchase Tools**: `mcp/tools/purchase-tools.ts` — Database functions for MCP order management
- **Resources**: `mcp/resources.ts` — MCP resources (product catalog)
- **Auth Middleware**: `utils/mcp/auth.ts` — API key generation, validation, and request authentication
- **API Key Management**: `pages/api/mcp/api-keys.ts` — CRUD endpoints for API keys
- **Order API**: `pages/api/mcp/create-order.ts` — Order creation, status, and listing endpoint
- **Settings UI**: `pages/settings/api-keys.tsx` — UI page for managing API keys

### Available MCP Tools

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

### Payment Methods

- **Lightning**: Generates a Cashu mint quote (bolt11 invoice) via `@cashu/cashu-ts`. Agent pays the invoice, then calls `verify_payment` to confirm. Default mint: `https://mint.minibits.cash/Bitcoin`.
- **Cashu**: Agent provides a serialized Cashu token string. Server verifies and redeems the tokens.
- **Stripe**: Creates a Stripe PaymentIntent. Agent completes payment via Stripe SDK.
- **Fiat**: Returns seller's fiat payment handles (Venmo, Cash App, etc.). Agent sends payment externally and includes order ID in memo. Seller confirms receipt manually.
- **Payment method discounts**: Sellers can set per-method discounts (e.g., 10% off Bitcoin). Applied automatically in order pricing.

### Database Tables

- `mcp_api_keys` — API keys with hashed secrets, permissions (read/read_write), and usage tracking
- `mcp_orders` — Orders placed through the MCP/API with payment and status tracking

### Agentic Commerce Endpoints

- **Capabilities Manifest**: `GET /.well-known/agent.json` — Machine-readable service description (unauthenticated). Describes all tools, resources, auth method, endpoints, and pricing model. Implemented via `pages/api/.well-known/agent.json.ts` with a middleware rewrite in `middleware.ts`.
- **Automated Onboarding**: `POST /api/mcp/onboard` — Zero-touch agent registration (unauthenticated). Accepts `{ name, permissions?, contact?, pubkey? }`. If `pubkey` is omitted, generates a new Nostr keypair and returns the `nsec` (bech32-encoded). If `pubkey` is provided (hex or npub1... format), uses that existing identity (no nsec returned, `existingIdentity: true`). Always returns `npub` in bech32 format. Rate-limited to 10 per IP per hour.
- **Status & Metrics**: `GET /api/mcp/status` — Real-time service health and performance metrics (unauthenticated). Returns uptime, latency percentiles (p50/p95/p99), throughput, reliability rates, and data freshness counts. Backed by `utils/mcp/metrics.ts` in-memory collector.
- **Pricing in Protocol**: Every product response includes a structured `pricing` block with amount, currency, unit, shippingCost, shippingType, totalEstimate, and paymentMethods. Order creation returns HTTP 402 with payment instructions when Stripe payment is required.
- **Response Metadata**: All MCP tool responses include `_meta` blocks with `responseTimeMs`, `dataSource` ("cached_db" or "live"), `dataFreshness`, and `resultCount`. HTTP responses include `X-Response-Time` headers.

### Authentication

API keys are created via the `/settings/api-keys` UI page, the `/api/mcp/api-keys` endpoint, or the zero-touch `/api/mcp/onboard` endpoint. Keys use SHA-256 hashing and Bearer token authentication. Two permission levels: `read` (browse only) and `read_write` (browse + purchase).
