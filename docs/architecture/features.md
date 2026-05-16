# Trust, Reviews & Key Features

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
