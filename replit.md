# Shopstr

## Overview

Shopstr is a global, permissionless marketplace built on the Nostr protocol, enabling Bitcoin commerce through decentralized communication and censorship-resistant transactions. The platform leverages Nostr's event-based architecture to create, manage, and trade products while supporting multiple payment methods including Lightning Network, Cashu ecash, and fiat currencies. Built with Next.js 14, the application provides a Progressive Web App (PWA) experience with client-side state management and local caching via IndexedDB.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Core Technologies**

- Next.js 14.2.32 with TypeScript in App Router mode
- React 18.2.0 for component composition
- NextUI component library with Tailwind CSS for styling
- Framer Motion for animations and transitions
- Progressive Web App (PWA) capabilities via next-pwa

**State Management Pattern**

- React Context API for global state distribution across multiple domains:
  - ProductContext: Product listings and marketplace data
  - ProfileMapContext: User profile information
  - ShopMapContext: Shop metadata and configurations
  - ChatsContext: Direct messaging state
  - ReviewsContext: Product and seller reviews
  - FollowsContext: Social graph relationships
  - RelaysContext: Nostr relay connections
  - BlossomContext: Media server configurations
  - CashuWalletContext: Ecash wallet state
  - CommunityContext: Community management

**Client-Side Data Persistence**

- Dexie.js wrapper over IndexedDB for offline-first data storage
- Local storage for user preferences and authentication tokens
- Service worker for asset caching and offline functionality

**Routing Strategy**

- Middleware-based URL rewriting for Nostr identifier handling (npub, naddr)
- Dynamic routing for product listings, user profiles, and communities
- Protected routes requiring authentication for sensitive operations

### Backend Architecture

**Nostr Protocol Integration**

- Multi-signer architecture supporting:
  - NIP-07: Browser extension signing (Alby, nos2x)
  - NIP-46: Remote signing via Nostr Connect/bunker
  - NIP-49: Encrypted private key storage with passphrase
- Event-based data model using standardized Nostr event kinds:
  - Kind 30402: Product listings (NIP-99 classified listings)
  - Kind 0: User metadata profiles
  - Kind 10000: Shop profiles (custom merchant metadata)
  - Kind 14: Direct messages with gift wrapping (NIP-17)
  - Kind 1985: Product reviews (NIP-85)
  - Kind 34550: Community definitions (NIP-72)

**Data Fetching & Caching**

- Service layer pattern with dedicated fetch functions per data type
- Subscription-based real-time updates from Nostr relays
- Multi-relay querying with timeout handling and fallback mechanisms
- Cache-first strategy with background refresh for product listings and profiles

**Authentication & Authorization**

- Stateless authentication via cryptographic signing
- Passphrase-based encryption for stored credentials (NIP-49 standard)
- Challenge-response pattern for secure operations
- Migration system for upgrading encryption standards

### Payment Processing Architecture

**Multi-Payment Support**

- Lightning Network: Invoice generation and payment verification via Lightning Address (LNURL)
- Cashu Ecash: Privacy-preserving payments using Cashu protocol with token minting and redemption
- Fiat Options: Traditional payment metadata support with currency conversion display

**Payment Flow Components**

- Product/Cart Invoice Cards: Payment interface generation
- Claim Button: Ecash token redemption
- Volume Selector: Quantity-based pricing calculations

**Order Management**

- Gift-wrapped messaging for order placement (encrypted buyer-seller communication)
- Proof publication for payment confirmation
- Review system post-fulfillment

### Media Handling

**Blossom Protocol Integration (NIP-B7)**

- Decentralized media storage via Blossom servers
- Authenticated uploads with Nostr event signing
- Progress tracking for multi-file uploads
- Image optimization with responsive srcset generation
- Maximum 100MB file size limit per upload
- Supported formats: JPEG, PNG, WebP

**Image Serving Strategy**

- Automatic responsive image generation for nostr.build domains
- Fallback to original URLs for unknown providers
- Lazy loading and placeholder support

### Community Features

**Moderated Communities (NIP-72)**

- Community creation and management interface
- Post approval workflow for moderators
- Feed rendering with rich content support (images, videos, YouTube embeds)
- Member interaction through Nostr events

**Social Graph & Trust**

- Web of Trust (WoT) filtering based on follow relationships
- First and second-degree follow calculations
- Configurable trust thresholds for marketplace filtering

## External Dependencies

**Nostr Protocol Libraries**

- nostr-tools 2.7.1: Core Nostr protocol implementation (event creation, signing, encoding)
- @getalby/lightning-tools 5.0.1: Lightning Network utilities and LNURL handling

**Payment & Wallet Integration**

- @cashu/cashu-ts 2.1.0: Cashu ecash protocol client for privacy-preserving payments
- Lightning Address support via Alby tools

**Database & Storage**

- Dexie 3.2.4: IndexedDB wrapper for client-side database operations
- dexie-react-hooks 1.1.7: React integration for reactive queries

**UI & Styling**

- @nextui-org/react 2.2.9: Component library providing consistent UI patterns
- @heroicons/react 2.1.1: Icon system
- Tailwind CSS 3.3.1: Utility-first CSS framework
- Framer Motion 10.16.4: Animation library for transitions

**Media & Content**

- qrcode 1.5.3: QR code generation for Lightning invoices and payment requests
- react-responsive-carousel 3.2.23: Image carousel component
- @braintree/sanitize-url 7.1.0: URL sanitization for user-generated content

**Cryptography & Security**

- crypto-js 4.2.0: Additional encryption utilities beyond Nostr protocol requirements

**Development & Testing**

- Jest 29.5.14 with Testing Library: Unit and integration testing
- ESLint with TypeScript support: Code quality enforcement
- TypeScript 5.x: Static type checking

**Relay Infrastructure**

- Default relay set managed in localStorage with fallback to hardcoded defaults
- Multi-relay broadcast for event publication redundancy
- Subscription management for real-time event streaming

**Blossom Media Servers**

- User-configurable Blossom server list stored in localStorage
- Authenticated upload support with progress tracking
- Fallback to traditional image hosting when Blossom unavailable

## Recent Changes

### Deployment Configuration (October 4, 2025)

- Added health check endpoint at `/api/health` for Cloud Run deployment monitoring
- Configured production server to bind to `0.0.0.0` and respect PORT environment variable
- Removed `babel.config.json` to use Next.js 14's default SWC compiler for better performance
- Enhanced error handling in `_app.tsx` initialization with individual try-catch blocks for each data fetch operation
- Updated development workflow to run on port 5000
- Configured autoscale deployment with proper build and run commands
