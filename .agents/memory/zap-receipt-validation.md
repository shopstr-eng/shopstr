---
name: Zap receipt validation tradeoffs
description: Decisions behind Zapsnag/NIP-57 receipt validation — purchase vs inventory strictness, freshness window, and griefing/oversell tradeoffs.
---

# Zap receipt validation (NIP-57 / Zapsnag)

## Purchase flow stays fully strict

Exact invoice-amount match, receipt signer == LNURL provider `nostrPubkey`, and the preimage/payment-hash binding. The preimage check is the real proof of payment; do not relax anything here.

## Inventory counting is deliberately looser

- `alternateRecipientPubkeys: [sellerPubkey]` — most NIP-57 clients put the seller's own npub in the `p` tag, not the LNURL provider's signing key (which is what Alby's `ln.zap()` uses). Accepting both lets zaps made outside Shopstr count toward sold units.
- `allowOverpayment: true` (invoice >= price), NOT a skipped amount check. **Why:** skipping the amount entirely lets anyone sold-out-grief a listing for ~1 sat/unit via any zap client; a minimum-amount rule restores the attack cost to the full product price while still counting tips.
- Known residual gaps (accepted): sales made before a price _increase_ stop counting (oversell risk), and if the seller switches LNURL providers, old receipts signed by the old provider key stop counting. Fixing the latter would require tracking historical provider keys.

## Freshness window is asymmetric on purpose

Lower bound `startTime - 120s` blocks replays of older receipts; upper bound is `now + 120s` (future-dating guard only). **Why:** a symmetric ±120s window falsely failed buyers who took >2 min to pay from an external wallet. Replay protection comes from the lower bound plus the preimage binding, so a wide upper bound loses nothing.

## LNURL resolution is cached

Seller zap context (profile lud16 → LightningAddress fetch) is a module-level promise cache keyed by seller pubkey, 5-min TTL, failures evicted. **Why:** without it every product view made an HTTP round trip to the seller's LNURL provider (latency, availability coupling, privacy leak). Tests must call the exported cache-clear function between cases.
