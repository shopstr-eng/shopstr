---
name: Order participants not server-readable
description: Why getOrderParticipants returns null in production and what server-trusted order data actually exists
---

# Order data is encrypted; the server cannot resolve order participants

Order messages are NIP-17 gift wraps cached in `message_events` as kind-1059
events. Their tags are only `[["p", recipientPubkey]]` — there is **no
cleartext `b` (buyer), `a`/`item` (seller), `order` id, or `buyer_email` tag**.
In production, `message_events.order_id` is `NULL` for every row.

**Consequence:** `getOrderParticipants(orderId)` (which reads `order_id` + `b`/`a`
tags from `message_events`) returns `{ buyerPubkey: null, sellerPubkey: null }`
for essentially all real orders. Any endpoint that _hard-requires_ a resolved
seller/buyer from this function (e.g. a 404/403 gate) will block 100% of real
traffic. `update-order-status` has this same latent issue but masks it because
its client calls are fire-and-forget.

**How to apply:** Never gate order endpoints on `getOrderParticipants` resolving.
Treat it as best-effort: only enforce ownership _when_ it resolves; never reject
on the (normal) null case.

## What order data IS server-trusted

- `notification_emails` (keyed by `order_id`, role `buyer`/`seller`) — written at
  checkout by `send-order-email` from the buyer's browser. This is the only
  server-side buyer-email source. It's self-asserted (the unauthenticated
  `send-order-email` endpoint accepts any orderId+email), but adequate because
  the buyer is emailing themselves.
- The buyer's email otherwise lives only in the encrypted order's `buyer_email`
  tag, visible to the seller client-side (e.g. orders-dashboard
  `selectedOrder.buyerEmail`), NOT to the server.

## Email-relay posture

`send-order-email` has **no auth** (rate-limit only) — it's already an open relay
for order-confirmation emails to arbitrary addresses. So requiring NIP-98 + per
-pubkey/per-IP rate limits on order-update email (send-update-email) is stricter
than the existing peer endpoints. Branding for outbound order email must use the
authenticated pubkey, never a body-supplied sellerPubkey (brand-spoofing).
