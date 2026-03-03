# Shopstr

## Overview

Shopstr is a global, permissionless marketplace built on the Nostr protocol, enabling Bitcoin commerce through decentralized communication and censorship-resistant transactions. It supports multiple payment methods including Lightning Network, Cashu ecash, and NWC (Nostr Wallet Connect). The platform provides a Progressive Web App (PWA) experience with client-side state management and server-side caching. Its core purpose is to offer a censorship-resistant, decentralized e-commerce solution.

## User Preferences

Preferred communication style: Simple, everyday language.

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
- **Free Shipping Threshold**: Merchants can set a minimum order amount (with currency) in their shop profile settings. When a buyer's cart subtotal from a seller meets or exceeds the threshold, shipping costs for that seller's items are waived. Features include: shop profile form fields (`freeShippingThreshold`, `freeShippingCurrency` in `ShopProfile` type), a slide-in notification on add-to-cart (`components/free-shipping-notification.tsx` using Framer Motion), per-seller progress bars on the cart page, automatic shipping cost waiver in `cart-invoice-card.tsx` for all order types (shipping/combined/pickup selection), and strikethrough original shipping cost with "Free" badge on the order summary page.

### MCP Server (AI Agent Integration)

The platform exposes a Model Context Protocol (MCP) server enabling AI agents to programmatically browse the marketplace and place orders using Bitcoin payment methods.

#### Architecture

- **MCP Endpoint**: `pages/api/mcp/index.ts` — Streamable HTTP transport endpoint handling MCP protocol messages
- **Server Factory**: `mcp/server.ts` — Creates the MCP server with registered tools and resources
- **Read Tools**: `mcp/tools/read-tools.ts` — Tools for browsing products, companies, reviews, and discount codes
- **Purchase Tools**: `mcp/tools/purchase-tools.ts` — Database functions for MCP order management
- **Resources**: `mcp/resources.ts` — MCP resources (product catalog via `shopstr://catalog/products`)
- **Auth Middleware**: `utils/mcp/auth.ts` — API key generation, validation, and request authentication
- **Metrics**: `utils/mcp/metrics.ts` — Request tracking, latency percentiles, rate limiting
- **API Key Management**: `pages/api/mcp/api-keys.ts` — CRUD endpoints for API keys
- **Order API**: `pages/api/mcp/create-order.ts` — Order creation, status, and listing endpoint
- **Payment Verification**: `pages/api/mcp/verify-payment.ts` — Lightning payment verification
- **Onboarding**: `pages/api/mcp/onboard.ts` — Zero-touch agent registration
- **Status**: `pages/api/mcp/status.ts` — Service health and metrics
- **Agent Manifest**: `pages/api/.well-known/agent.json.ts` — Machine-readable service description
- **Settings UI**: `pages/settings/api-keys.tsx` — UI page for managing API keys

#### Available MCP Tools

- `search_products` — Search/filter products by keyword, category, location, price range
- `get_product_details` — Get full details for a product by ID
- `list_companies` — List all seller/shop profiles
- `get_company_details` — Get a company's profile, products, and reviews
- `get_reviews` — Get reviews for a product or seller
- `check_discount_code` — Validate a discount code
- `get_payment_methods` — Get available Bitcoin payment methods for a seller (lightning, cashu)
- `create_order` — Place an order with payment method selection (requires read_write key). Supports: `lightning` (Bitcoin Lightning invoice) and `cashu` (ecash tokens)
- `verify_payment` — Verify Lightning invoice payment status (requires read_write key)
- `get_order_status` — Check order status (requires read_write key)
- `list_orders` — List orders (requires read_write key)

#### Payment Methods

- **Lightning**: Generates a Cashu mint quote (bolt11 invoice) via `@cashu/cashu-ts`. Agent pays the invoice, then calls `verify_payment` to confirm. Default mint: `https://mint.minibits.cash/Bitcoin`.
- **Cashu**: Agent provides a serialized Cashu token string. Server verifies and redeems the tokens.

#### Database Tables

- `mcp_api_keys` — API keys with hashed secrets, permissions (read/read_write), and usage tracking
- `mcp_orders` — Orders placed through the MCP/API with payment and status tracking

#### Authentication

API keys are created via the `/settings/api-keys` UI page, the `/api/mcp/api-keys` endpoint, or the zero-touch `/api/mcp/onboard` endpoint. Keys use SHA-256 hashing and Bearer token authentication. Two permission levels: `read` (browse only) and `read_write` (browse + purchase). Key prefix: `sk_`.

## External Dependencies

- **Nostr Protocol Libraries**: `nostr-tools`, `@getalby/lightning-tools`.
- **Payment & Wallet Integration**: `@cashu/cashu-ts`, Lightning Address support (via Alby tools).
- **MCP**: `@modelcontextprotocol/sdk` for AI agent integration.
- **Database**: `pg` (PostgreSQL) for server-side caching and MCP data.
- **UI & Styling**: `@nextui-org/react`, `@heroicons/react`, Tailwind CSS, Framer Motion.
- **Media & Content**: `qrcode`, `react-responsive-carousel`, `@braintree/sanitize-url`.
- **Cryptography**: `crypto-js`.
- **Relay Infrastructure**: Default and user-configurable Nostr relays, multi-relay broadcast, subscription management.
- **Blossom Media Servers**: User-configurable Blossom server list for decentralized media.
