---
name: Payment overlay cleanup
description: Long-running payment overlays (Cashu swap/melt, LN polling) must clear their visibility state in a `finally`, not a `catch`, or buyers get hard-blocked behind a non-dismissable modal.
---

Any "processing" overlay tied to a single state flag (`overlayStartedAt`, `pollDeadlineMs`, etc.) must be set immediately before the try and cleared in `finally`. Clearing in `catch` only leaks on the success branch; clearing at the end of `try` leaks on the throw branch. Either leak leaves a non-dismissable modal stuck on top of the success/failure UX.

**Why:** Direct Cashu swap+melt and Lightning polling both render full-screen `isDismissable={false}` modals so buyers can't accidentally close mid-mint. The dismiss safety guarantee inverts into a hard-block the moment cleanup is asymmetric. Architect caught exactly this on the product-invoice-card cashu path — start in try, clear only in catch — which would have shipped a stuck spinner over every successful purchase.

**How to apply:** When introducing a new long-running payment flow with an in-progress overlay:

1. Set the start/deadline state on the line _before_ `try {`.
2. Add `finally { setState(null); }` even if `catch` already calls it.
3. Don't add the same cleanup to the outer wrapper handler — double cleanup is just noise, but missing inner cleanup is a hard-block.
4. Overlay's `isOpen` must read the state flag directly (`x !== null`), not derive from a separate `isProcessing` boolean that can drift.
