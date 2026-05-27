---
name: Cashu post-swap proof recovery on payment failure
description: Every cashu payment path that calls safeSwap/safeMeltProofs must stash the new UNSPENT outputs on any post-swap throw, and stash them against the actual spend mint, or the wallet keeps SPENT inputs as a phantom balance.
---

A successful `wallet.swap(...)` (or `wallet.meltProofs(...)`) marks the input proofs SPENT at the mint and returns new UNSPENT outputs (`keep` / `send` / `changeProofs`). If the calling flow throws **after** that point but **before** the new outputs are written to `localStorage["tokens"]`, the user's wallet ends up holding only the spent inputs — Lightning sends then fail with "insufficient" and ecash exports fail at the receiving wallet with "proofs already spent". This was the actual root cause of the 48k phantom-balance incident, not the recovery-stash path.

**The rule:** every code path that calls `safeSwap` / `safeMeltProofs` must hold a `postSwapRecovery = { mintUrl, proofs }` variable that is updated as the flow progresses, and the outer `catch` must call `stashProofsLocally(proofs, mintUrl, ...)` when it is non-null. Narrow `proofs` as parts of the work get committed (`localStorage.setItem("tokens", ...)`, downstream distribution succeeds, encoded token is shown to the user) and set it to `null` only when nothing remains recoverable.

**Why:** the mint is the source of truth for spent-ness; the local wallet is the only source of truth for the unspent replacements. Losing the replacement is irreversible from local state alone. Stashing duplicates of already-saved change is fine (`persistReceivedTokens` dedups by secret); not stashing a real replacement is permanent loss.

**The mint URL must be the actual spend mint, not `mints[0]`.** In multi-mint wallets the spend mint is chosen per-payment by `pickMintForPayment` and can differ from the default. Stashing recovered proofs under `mints[0]` mis-attributes their keysets and they present as an unusable balance. Any distribution helper that wraps a swap+melt pipeline and throws a `SendTokensRecoverableError` (or equivalent) **must** be passed the spend mint explicitly by its caller and include it on the error — do not let the helper fall back to `mints[0]`.

**Catch precedence when both apply:** prefer the error's `recoverableProofs` over the outer `postSwapRecovery.proofs`, because the in-helper tracker reflects mid-distribution state (some proofs already transmitted to the recipient and no longer recoverable by the buyer). Fall back to `postSwapRecovery` only when the throw happened outside the helper.

**UI nuance for "send a token" flows:** persist `keep` to localStorage _before_ surfacing the encoded `send` token to the user. Once the user can see (and copy) the encoded token, the `send` proofs are theirs to deliver and the recovery slot for them must be cleared, otherwise a downstream throw would double-credit the wallet against a token already in the user's clipboard.
