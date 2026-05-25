---
name: Lightning invoice polling loop
description: Rules for the cart/product invoiceHasBeenPaid polling loop so the QR card always reaches a terminal UI.
---

Every branch inside the Lightning `invoiceHasBeenPaid` polling while-loop must (a) advance `retryCount` and back off (≈2.1s sleep) on transient outcomes, and (b) the loop must always surface a terminal UI — even when it exits naturally without an exception.

Transient outcomes that must `retryCount++; sleep; continue;` rather than fall through:

- `quoteState.state === "UNPAID"`.
- `quoteState.state === "PAID"` but `mintProofsBolt11(...)` returned `[]` or `undefined` without throwing. This case is easy to miss because it sits inside the PAID branch, not the outer UNPAID `else` — guard it explicitly right after `mintProofsBolt11` returns.

Terminal-UI guarantee:

- Track a `handledTerminalOutcome` flag inside the function. Set it `true` at every terminal setter (success break, ISSUED dropped-connection modal, sendTokens-failed stash path, in-catch TypeError, in-catch maxRetries).
- After the while loop, check `if (!handledTerminalOutcome && retryCount >= maxRetries)` and open the wallet-recovery modal. The flag prevents double-firing when an in-catch terminal branch already ran on the final attempt.

**Why:** A user paid a Lightning invoice (with a discount code) and the QR sat on screen for minutes with no success/failure UI — the mint had been paid but `sendGiftWrappedMessageEvent` was never reached, so the seller got no order. Root cause was the loop terminating via the UNPAID branch's natural exhaustion (no exception → no in-catch recovery → no UI update), combined with a separate PAID-empty-proofs fall-through that could tight-loop without advancing the counter.

**How to apply:** Whenever editing `invoiceHasBeenPaid` in `components/cart-invoice-card.tsx` or `components/product-invoice-card.tsx` (or porting the pattern to a new payment surface), audit every branch under `try` for "transient → advance + sleep + continue" and every terminal setter for the `handledTerminalOutcome` flag. Keep the post-loop safety net.
