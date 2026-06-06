---
name: Reported order totals vs. charged/fund amounts
description: Why reported order totals (DMs/email/dashboard) must be computed separately from fund-distribution amounts, and what each must include.
---

Order **reported** totals (the `["amount"]` order-info tag, email `amount`, dashboard total) must equal the amount the buyer ACTUALLY PAID = items (after item discount) + shipping (after shipping discount), in the same unit as the accompanying currency tag. They are display-only.

Fund-distribution amounts must NEVER be derived from the reporting values:

- Cashu: the proof/payment `["amount"]` tag = `sellerAmount` (= tokenAmount − donations); ecash proofs are minted/split from these. The order-info `["amount"]` is a _separate_ tag and is the only one that should carry the discounted-shipping-inclusive order total.
- Stripe: the PaymentIntent amount comes from the charge calculators, not from the message `messageAmount`.
- Donation bases stay on the item amount, not the shipping-inclusive reported amount.

**Why:** Two real bugs lived here. Single-product path reported `productData.totalCost` (= price + FULL shipping, no discounts → too high). Cart path reported item-subtotal only (no shipping → too low). Both diverged from the charged total. Fixing reporting must not move funds.

**How to apply:**

- Single-product (`product-invoice-card.tsx`): the component-scope const `discountedTotal` (= discountedPrice + shippingCostToAdd, product currency) is the discount-aware total; route reported fallbacks + email/orderSummary `amount` through it. Sats products already report `price` (= bitcoinTotal converted), which is correct.
- Cart (`cart-invoice-card.tsx`): per-seller discounted shipping is needed in BOTH sats and native. Populate reporting-only maps INSIDE the existing charge-recompute effects (so they mirror the charged shipping exactly: skip free-shipping-qualified sellers, honor combined/pickup gating, reset to `{}` when not shipping). Add shipping ONCE per seller (per-product message loops use first-product attribution or a seen-set). Match unit to the currency tag (sats map ↔ "sats", native map ↔ cartCurrency).
- The reporting maps are async-effect state read at payment time — same staleness profile as the pre-existing `nativeCostsPerProduct`/`nativeTotalCost`; acceptable, not a new race class.
