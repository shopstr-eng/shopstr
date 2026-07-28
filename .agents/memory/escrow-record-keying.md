---
name: Escrow record keying
description: Why p2pk escrow records and the dispute plane are keyed by H(token), not the invoice orderId
---

`p2pk_escrow_orders.order_id`, the kind 30407 dispute event `d`-tag, and the `escrow-dispute`/`escrow-arbiter-sig` DM payloads are all keyed by `hashEscrowToken(token)` ("escrowId"), never the invoice orderId. The invoice orderId lives in the `invoice_order_id` column and is only used for the P2PK `shopstr_order` tag cross-check and display.

**Why:** Invoice orderIds are visible to the seller before payment. With first-write-wins registration (`ON CONFLICT DO NOTHING`), anyone who knew the key could squat it — even after token-bound registration, a seller could mint a counterfeit 2-of-3 token carrying the same `shopstr_order` tag and register first, disabling arbiter dispute resolution. Keying by H(token) means the squatter cannot predict the real key (preimage), and a counterfeit token lands on a different, harmless record.

**How to apply:**

- General rule: any first-write-wins registration must be keyed by something an observer of the natural identifier cannot predict or reproduce.
- The safety invariant depends on checkout ordering: the buyer registers the escrow BEFORE the token is disclosed to the seller (payment message). Never reorder `persistBuyerP2pkEscrowRecord` after the payment DM in the invoice cards.
- Payment-request/buyer-sig DMs deliberately still use the invoice orderId (buyer↔seller coordination only, no arbiter lookup).
- Rows registered before `invoice_order_id` existed fail closed: hash lookups miss (403) and rule.ts null-rejects the order binding.
