---
name: Multi-mint Cashu wallet attribution
description: Rules for showing per-mint balance, picking a spend mint, and keeping the default mint correct across receive/spend in a multi-mint wallet.
---

The Cashu wallet stores proofs in `localStorage["tokens"]` as a flat array; mint membership is _not_ on the proof itself. To attribute a proof to a mint you must match `proof.id` against that mint's `keyChain.getKeysets()` ids — there is no other reliable source.

**Why:** proofs were repeatedly displayed as "0 sats" on the wallet/storefront pages because the UI loaded keysets for `mints[0]` only, then filtered tokens by those keyset ids. Any proof from another mint (or any timing where keysets hadn't loaded yet) silently dropped out of the balance even though the user's funds were intact.

**How to apply:**

- Default mint = `mints[0]`. Any code path that credits the local wallet (receive, claim, mint, recovery, post-spend change) must promote its source mint to index 0 via `persistReceivedTokens` so the UI's keyset lookup attributes the new proofs correctly.
- When spending, never hardcode `mints[0]`. Use `pickMintForPayment(amount, mints, tokens)` — it probes each mint's keysets and picks the first that can cover the amount. Pass the chosen mint to both the swap _and_ `publishProofEvent`, otherwise the next reverse-attribution (kind 7375 proof events → mint) is poisoned.
- Balance fallback while keysets are unloaded: for single-mint wallets show the token total; for multi-mint wallets preserve the previous balance rather than flashing 0. Pair this with a keyset reload retry (token-count change + periodic tick) so a one-off `loadMint` failure cannot leave the balance stuck stale forever.
- Reactive reads of `localStorage` must JSON-dedup before calling state setters; otherwise a polling reload re-fires `loadMint` every tick and the resulting in-flight resets produce transient wrong balances.
