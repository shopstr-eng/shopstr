---
name: Lightning mint amount source
description: The amount passed to mintProofsBolt11 must come from the exact value used to create the mint quote.
---

The `amount` passed to `wallet.mintProofsBolt11(amount, hash)` must be the same value that was used to create the mint quote (`createMintQuoteBolt11`). The mint rejects the claim if these differ, even by 1 sat.

**Why:** In cart Lightning/NWC payment handlers, the mint quote was being created for `convertedPrice` (== `bitcoinCosts.satsTotal` from `getMethodDiscountedCosts`, which applies bitcoin payment-method discounts on top of any discount code) but the claim call was passing the `totalCost` React state variable. When a buyer used a discount code together with a bitcoin payment-method discount, the two diverged and the mint rejected `mintProofsBolt11`, leaving the buyer in the polling loop with no proofs.

**How to apply:** In every Lightning handler (`handleLightningPayment`, `handleNWCPayment`, equivalents on new payment surfaces), thread the same local `convertedPrice` (or whatever variable was used for `createMintQuoteBolt11`) all the way into `invoiceHasBeenPaid` → `mintProofsBolt11`. Never substitute a React state variable like `totalCost` that can be recomputed by other effects mid-flow.
