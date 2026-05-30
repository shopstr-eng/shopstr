---
name: Stripe webhook claim must be released on failure
description: claimStripeEvent permanently dedups an event id; if processing throws after the claim, you must release it or Stripe's retry is silently dropped.
---

# Stripe webhook dedup: claim-then-release on failure

`claimStripeEvent(eventId, eventType)` (utils/stripe/processed-events.ts) inserts
the event id with `ON CONFLICT DO NOTHING` and returns whether this caller won
the claim. There is **no separate "processed successfully" phase** — the row is
written before handler logic runs.

**Rule:** if your webhook handler throws _after_ a successful claim, call
`releaseStripeEvent(eventId)` (added alongside it) in the catch path before
returning 5xx. Otherwise the permanent claim dedups every Stripe retry and the
event (entitlement activation, lapse, payment-failed, etc.) is dropped forever.

**Why:** Stripe retries failed deliveries for ~30 days, but only if you return a
non-2xx _and_ the retry isn't deduped. A claim that survives a thrown handler
turns a transient DB/Stripe error into permanent data loss.

**How to apply:** new webhook endpoints should claim _outside_ the try, then
process _inside_ the try, and release in the catch. The Pro rail
(pages/api/pro/stripe-webhook.ts) follows this. The older
pages/api/stripe/webhook.ts still claims-before-process without release — a
latent version of the same bug if you touch it.
