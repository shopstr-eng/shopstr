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
