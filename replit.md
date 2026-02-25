# Shopstr

## Overview

Shopstr is a global, permissionless marketplace built on the Nostr protocol, enabling Bitcoin commerce through decentralized communication and censorship-resistant transactions. It supports multiple payment methods including Lightning Network, Cashu ecash, and fiat currencies. The platform provides a Progressive Web App (PWA) experience with client-side state management and server-side caching. Its core purpose is to offer a censorship-resistant, decentralized e-commerce solution.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

- **Framework**: Next.js 14 with TypeScript (App Router), React 18.
- **UI/UX**: NextUI, Tailwind CSS, Framer Motion for animations, PWA support.
- **State Management**: React Context API for various domains (products, profiles, shops, chats, reviews, follows, relays, media, wallet, communities).
- **Data Persistence**: Local storage for user preferences and authentication, service worker for caching.
- **Routing**: Middleware-based URL rewriting, dynamic routing, protected routes for authenticated operations.

### Backend

- **Nostr Protocol Integration**: Multi-signer architecture (NIP-07, NIP-46, NIP-49), utilizing standard and custom Nostr event kinds for products (NIP-99), user metadata, shop profiles, direct messages (NIP-17), reviews (NIP-85), and communities (NIP-72).
- **Data Fetching & Caching**: Service layer with dedicated fetch functions, subscription-based real-time updates from Nostr relays, multi-relay querying with fallback, cache-first strategy with background refresh.
- **Authentication & Authorization**: Stateless authentication via cryptographic signing, passphrase-based encryption (NIP-49), challenge-response pattern for secure operations.

### Payment Processing

- **Multi-Payment Support**: Lightning Network (invoice generation, LNURL), Cashu Ecash (token minting/redemption), and fiat currency display.
- **Payment Flow**: Invoice generation, ecash token redemption, quantity-based pricing.
- **Order Management**: Encrypted buyer-seller communication (gift-wrapped messages), payment confirmation proof, post-fulfillment review system.

### Media Handling

- **Blossom Protocol Integration (NIP-B7)**: Decentralized media storage, authenticated uploads, multi-file upload progress, image optimization (responsive srcset generation), maximum 100MB file size, automatic image compression for larger files.
- **Image Serving**: Automatic responsive image generation for nostr.build domains, fallback to original URLs, lazy loading.

### Community Features

- **Moderated Communities (NIP-72)**: Creation and management, post approval workflows, rich content feed rendering.
- **Social Graph & Trust**: Web of Trust (WoT) filtering based on follow relationships, configurable trust thresholds.

### Core Features

- **Order Summary Page**: Dedicated post-purchase page (`/order-summary`) displaying order confirmation with order ID, product details (single product or cart items with images, sizes, volumes, weights, bulk options, quantities), payment method with human-readable names, subtotal/shipping/total cost breakdown, and delivery information (shipping address or per-item pickup locations). Data is passed via sessionStorage from the checkout flow. Includes "Continue Shopping" (primary), "Check Order Status", and "Contact Merchant" buttons (latter two shown when logged in). Also displays a "More From the Marketplace" section with randomized product recommendations excluding the seller's own products.
- **Bulk/Bundle Pricing**: Support for tiered pricing based on quantity.
- **Size and Volume Options**: Customizable product options for orders.
- **Pickup Location Selection**: Option for customers to select pickup locations for orders.
- **Order Status Persistence**: Database storage and API for tracking and updating order statuses.
- **Unread/Read Indicator System**: Visual indicators for unread messages and new orders, with persistence.

## External Dependencies

- **Nostr Protocol Libraries**: `nostr-tools`, `@getalby/lightning-tools`.
- **Payment & Wallet Integration**: `@cashu/cashu-ts`, Lightning Address support (via Alby tools).
- **Database**: `pg` (PostgreSQL) for server-side caching.
- **UI & Styling**: `@nextui-org/react`, `@heroicons/react`, Tailwind CSS, Framer Motion.
- **Media & Content**: `qrcode`, `react-responsive-carousel`, `@braintree/sanitize-url`.
- **Cryptography**: `crypto-js`.
- **Relay Infrastructure**: Default and user-configurable Nostr relays, multi-relay broadcast, subscription management.
- **Blossom Media Servers**: User-configurable Blossom server list for decentralized media.
