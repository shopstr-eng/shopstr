---
name: Recovery record safety
description: Rules for localStorage fund-recovery records (pending payouts, pending mint ops) — identity binding, mutation-time dedupe, verify-before-clear
---

Fund-recovery records in localStorage (e.g. `shopstr.pendingSellerLightningPayouts`) follow three rules:

1. **Bind records to the buyer's pubkey at write time, required for all new writes.** These records survive `LogOut()` while tokens/identity are cleared, so an unbound record is claimable by any account that later signs in on the same browser. Legacy unbound records must stay display-only / unresolvable — a warning is not an authorization control.
2. **Dedupe proofs by secret immediately before mutating the token store, not when a mint state check starts.** A check can take seconds; the checkout catch handler or another tab can insert the same proofs mid-check, and blind re-append double-counts the balance.
3. **Read-back-verify the wallet write (exactly one occurrence per secret) before removing the recovery record; keep the record on any failure so retries converge idempotently.** `storage.setJson` swallows localStorage failures, and removal-after-verified-restore ordering is what makes retry safe.

4. **Legacy unbound records get a proof-export path only, never claim-and-bind.** With no identity on record there is nothing to re-confirm against, so letting a signed-in account bind a legacy record would recreate the cross-account theft the quarantine prevents. Export is safe because it only reveals bearer data already in that browser's localStorage — but the export builder must hard-refuse any record with a `buyerPubkey` (bound records go through the owner-checked resolver) and exclude proofs already in the wallet to avoid double-claim.

**Why:** code review of the pending-payout recovery flow (Sept 2026) caught all three as fund-loss / cross-account-theft vectors after the happy path already passed.
**How to apply:** any new localStorage recovery store or restore-from-record flow in this repo (pending payouts, pending mint operations, escrow) — enforce all three before considering it done.
