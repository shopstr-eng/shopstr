---
name: Order spec descriptors threading
description: Where a per-line product "spec" (size/volume/weight/variant/bulk) must be threaded so it shows up in every order surface, and which specs may vs must not affect money/inventory.
---

Per-line product descriptors (size, volume, weight, bulk option, and the descriptive "variant option") must be threaded through a fixed set of surfaces or they silently vanish from some order views. A spec added in only one or two places is a bug.

**Surfaces that each need their own copy of the spec (use existing `selectedWeight` as the reference pattern to mirror):**

- Buyer selection UI + gating: `checkout-card.tsx` (state, render grid, disable Buy Now / Add to Cart until selected, write onto the cart item, pass as prop to invoice cards).
- Order DM tags: `sendOrder` in `nostr/nostr-helper-functions.ts` pushes `["<spec>", value]` (+ a label tag for variants). The order-message builders in `product-invoice-card.tsx` and `cart-invoice-card.tsx` must pass the option through.
- Invoice cards: `product-invoice-card.tsx` (props/types, `triggerOrderEmail` body, sendOrder option objects, the many human-readable `productDetails` text builders, the Stripe subscription `productDescription`/`metadata`, and the spec-display JSX) and `cart-invoice-card.tsx` (same, but per `product.*` cart item, incl. `variantInfo`).
- Email: `email/email-templates.ts` `buildProductDescriptors` + `OrderEmailParams`, AND the API route `pages/api/email/send-order-email.ts` (destructure from body + pass into `emailParams`) — the route is an easy-to-miss relay.
- Dashboard: `messages/orders-dashboard.tsx` (parse tag, `IProductOrder` field, consolidation merge, spec column).
- Summary page: `pages/order-summary/index.tsx` (top-level + `cartItems` types, both spec-display blocks).

**Gotchas:**

- Stripe subscription payload guards (`productDescription` ternary, cart `variantInfo` object) gate inclusion on `size || volume || weight || bulk`. Any NEW spec must be added to that guard or a spec-only item drops all metadata.
- `checkout-card.tsx` had a local `const selectedVariant = selectedVolume || selectedWeight` for bulk pricing — unrelated to the variant feature; rename to avoid shadowing component state.
- Cart items are `ProductData` round-tripped through `localStorage` JSON, so only plain string/number fields survive (a `Map` like `variantImages` is dropped). Keep the _selected_ value as a string on the item.

**Money/inventory rule:** size/volume/weight CAN carry price deltas and feed inventory keys. The "variant option" is purely descriptive — it MUST NOT alter price, shipping, or inventory and MUST NOT be added to any pricing/inventory-key path.

**Why:** order info is assembled independently per surface; there is no single shared serializer, so a new spec has to be wired into ~10 places. Missing one shows the spec in, e.g., the DM but not the seller dashboard or the email.
