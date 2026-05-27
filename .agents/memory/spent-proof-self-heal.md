---
name: Cashu spent-proof self-heal sweep
description: Why automatic pruning of locally-stored cashu proofs is too dangerous to do without user opt-in, and how to provide a safe recovery path instead.
---

Any recovery path that stashes cashu proofs into `localStorage["tokens"]` (failed-payment recovery, stash-on-throw, etc.) can stash proofs that are already SPENT at the mint. Once stashed, they present as a phantom balance: sends fail with "insufficient" (mint refuses to swap spent inputs) and ecash exports fail at the receiving wallet with "proofs already spent".

**Tempting fix that DOES NOT WORK on auto-run:** call `wallet.checkProofsStates(...)` on mount, treat any `state === "SPENT"` as deletable, prune from localStorage.

**Why auto-pruning is banned:** A first attempt that auto-pruned on wallet mount silently deleted a user's full balance — root cause was either a mint mis-reporting state or our probe matching proofs we shouldn't have. Spent-proof pruning of locally-stored cashu funds is irreversible from local state alone; the user has no undo. Treat it as a destructive operation and require explicit user opt-in (a button + confirmation) before running. Do **not** wire it into a `useEffect` on mount, and do **not** fire-and-forget it from recovery stash paths.

**How to apply (if you do build an opt-in sweep button):**

- Only probe proofs whose keyset id belongs to the mint being asked. `checkProofsStates` on foreign proofs is invalid.
- On any probe error, leave proofs intact — a transient mint outage must never delete user funds.
- **Merge-safe write**: probe a snapshot, but at write time _re-read_ the latest tokens and remove only confirmed-spent secrets. Never write the snapshot back wholesale — overlapping receives/mints/stashes would be clobbered.
- Hold a per-tab in-flight lock so overlapping sweep calls serialize on one probe + write.
- Quarantine pruned proofs to a separate `localStorage` key (don't truly delete) so the user can roll back if the mint was wrong.

**Always have an out-of-band recovery path.** Local tokens are not the only copy: every "in" proof is also published as a kind-7375 nostr event and cached in Postgres. Expose a "Restore wallet from nostr backup" button that calls `restoreTokensFromProofEvents(walletContext.proofEvents)` — merge-only, dedup by secret, never deletes. This is what saves users when any pruning/recovery logic goes wrong, and what we landed instead of an auto-sweep.
