---
name: Cashu spent-proof self-heal sweep
description: Why the wallet must verify locally-stored proofs against the mint and how to do it without deleting good funds.
---

Any recovery path that stashes cashu proofs into `localStorage["tokens"]` (failed-payment recovery, stash-on-throw, etc.) can stash proofs that are already SPENT at the mint. Once stashed, they present as a phantom balance: sends fail with "insufficient" (mint refuses to swap spent inputs) and ecash exports fail at the receiving wallet with "proofs already spent".

**Rule:** the wallet must run a passive sweep against each configured mint that calls `wallet.checkProofsStates(...)` and removes proofs whose state is `SPENT`. Keep `PENDING` proofs — a pending melt can still resolve to UNPAID and free them.

**Why:** without a sweep, there is no other place in the app that reconciles local proofs with mint state — balance is computed purely from local proofs + keyset attribution, and no spend path verifies inputs before swapping. A single failed-payment recovery can permanently soft-brick the wallet.

**How to apply:**

- Only probe proofs whose keyset id belongs to the mint being asked. `checkProofsStates` on foreign proofs is invalid.
- On any probe error, leave proofs intact — a transient mint outage must never delete user funds.
- **Merge-safe write**: probe a snapshot, but at write time _re-read_ the latest tokens and remove only confirmed-spent secrets. Never write the snapshot back wholesale — overlapping receives/mints/stashes would be clobbered.
- Hold a per-tab in-flight lock so overlapping sweep calls (mount-effect + stash-triggered) serialize on one probe + write.
- Trigger on: wallet page mount (debounced) AND right after any recovery stash.
