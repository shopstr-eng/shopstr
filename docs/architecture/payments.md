# Payment Systems

## Lightning & Cashu

- **Lightning**: Direct invoice gen + verify.
- **Cashu**: `@cashu/cashu-ts` v4.1.0 (`Mint`/`Wallet`/`Keyset`, bolt11-suffixed quote helpers, `Amount` boundary type with `.toNumber()`, `KeyChain.getKeysets()`, explicit `await wallet.loadMint()`, `getDecodedToken(token, keysetIds)` requires the second arg).
- **Proof amount JSON gotcha**: Proofs in `localStorage["tokens"]` lose the `Amount` wrapper on JSON round-trip and come back as plain `number`. Code reading `getLocalStorageData().tokens` must use `proofAmountToNumber` / `sumProofAmounts` from `utils/cashu/proof-amount.ts`, not `.amount.toNumber()`.
- **Hardening utilities** (`utils/cashu/`): `mint-retry-service` (`withMintRetry`), `swap-retry-service` (`safeSwap`), `melt-retry-service` (`safeMeltProofs`), `pending-mint-operations` (DB-backed `pending_mint_quotes` for orphan recovery), `wallet-recovery` (boot reconciler via `components/utility-components/mint-recovery-boot.tsx`). All cashu call sites use these wrappers and check melt/swap status before treating ops as successful.

## Stripe Connect

- **Express Connect** with embedded Stripe Elements (PaymentIntent API). Card form: `components/utility-components/stripe-card-form.tsx`. PaymentIntent: `pages/api/stripe/create-payment-intent.ts`.
- **Currency utils** (`utils/stripe/currency.ts`): `satsToUSD`, `isCrypto`, `toSmallestUnit`, `convertToSmallestUnit`, `ZERO_DECIMAL_CURRENCIES`. Live BTC→fiat via `@getalby/lightning-tools` (no hardcoded fallback). Stripe payments use the native fiat currency directly; only sats/BTC convert to USD.
- **Webhooks** (`webhook.ts`, `subscription-webhook.ts`): require `STRIPE_WEBHOOK_SECRET` / `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET`, reject unverified payloads, dedupe via `claimStripeEvent` (`stripe_processed_events`, fail-open). Both honor `application_fee.created`/`refunded` for donation reconciliation.
- **Retries & idempotency**: `withStripeRetry` (`utils/stripe/retry-service.ts`) wraps API calls. All PaymentIntent / Subscription / Invoice / Transfer create calls use a deterministic `stableIdempotencyKey()`.
- **Pending payments & failures**: `stripe_pending_payments` (`utils/stripe/pending-payments.ts`); webhook updates status. Failures email both parties (`sendPaymentFailedToBuyer`/`Seller`); transfer failures alert admin (`sendTransferFailureAlert`).
- **Cron cleanup** (`pages/api/stripe/cron-cleanup.ts`, gated by `FLOW_PROCESSOR_SECRET`): prunes `stripe_processed_events` >45d and terminal `stripe_pending_payments` (`succeeded`/`failed_terminal`/`abandoned`) >30d. Active rows preserved.

## Donations (platform fee)

- **Field**: Sellers' donation percent lives in Nostr profile JSON under `mm_donation` (was `shopstr_donation` upstream). Defaults to 2.1% when absent. Profile form writes only `mm_donation` and strips stale `shopstr_donation`.
- **Cashu/Lightning**: Donation eCash sent to `process.env.NEXT_PUBLIC_MILK_MARKET_PK`; skipped with a warn if unset.
- **Stripe parity**: `utils/stripe/donation.ts` reads `mm_donation` from cached `profile_events`, defaults to 2.1%, caches per-seller for 5 min, skips when seller equals `NEXT_PUBLIC_MILK_MARKET_PK`, falls back to no fee when cut would be ≥ gross. Wired into:
  - `create-payment-intent.ts` — `application_fee_amount` for single-merchant; embeds per-seller fees in multi-merchant `sellerSplits` metadata.
  - `process-transfers.ts` — withholds cut from each `Transfer.amount` (prefers embedded values, falls back to fresh profile lookup).
  - `create-subscription.ts` / `create-cart-subscription.ts` — `application_fee_percent` on direct-charge subs; `create-invoice.ts` — `application_fee_amount` on direct-billed invoices.
- **Dashboard parity**: Stripe success handlers in `cart-invoice-card.tsx` and `product-invoice-card.tsx` compute donation from cached profile and pass `donationAmountValue`/`donationPercentageValue` into every `sendPaymentAndContactMessage`. `donation_amount` tag emitted via `utils/nostr/nostr-helper-functions.ts` so Stripe orders render the donation row identically to Cashu/Lightning.
- Platform-account selling-to-itself is a no-op everywhere.

## Multi-currency & cart math

- Cart display currency = most common item currency (tiebreak: USD > sats > alphabetical). Mixed carts convert via `@getalby/lightning-tools`. Zero-decimal currencies (JPY/KRW/etc.) handled. Bitcoin/Lightning always sats; Lightning buttons show fiat + sats estimate for fiat-priced products. Sats-only carts show USD estimate on Stripe/fiat buttons.
- `nativeTotalCost` and `nativeCostsPerProduct` are async (`useEffect`+state) for cross-currency conversion.
- `process-transfers.ts` reads currency from the PaymentIntent for multi-merchant transfers; subscription-renewal transfers read it from the invoice. Order messages include `["currency", ...]` and `["amount", ...]` tags. Subscriptions are `pending` until first successful payment activates them via the subscription webhook.
- **Round-up policy**: All conversions and on-the-wire charge math use `Math.ceil` (never `round`/`floor`). Stripe charges below the gateway floor surface a "$0.50 minimum" banner.

## Fiat & multi-merchant fiat

Manual methods: Venmo, Zelle, Cash App, PayPal, Apple Pay, Google Pay, Cash. Multi-merchant fiat: each seller gets their own dropdown, per-merchant instructions/amounts, individual confirmation checkboxes. Order only confirmed when all checkboxes checked. Single-merchant retains the original single-dropdown flow.

## API rate limiting

All public `pages/api/**` endpoints use the in-memory token bucket in `utils/rate-limit.ts` (`checkRateLimit`, `applyRateLimit`, `getRequestIp`) keyed by client IP, with `X-RateLimit-*` headers and `Retry-After` on 429. Per-process buckets — under horizontal scaling the effective ceiling is `N × limit` (intentional coarse DB-pool guard). Webhooks rely on signature + Stripe-event idempotency instead.
