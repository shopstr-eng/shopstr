# Nostr Protocol

- 15+ NIPs: profiles (NIP-01, NIP-05), marketplace (NIP-99), DMs (NIP-17), media (Blossom), reviews (NIP-85), social graph (NIP-02, NIP-51), relay lists (NIP-65).
- Hybrid event caching: IndexedDB + Postgres + live relays. Kind 1111 disambiguated by tags: NIP-22 review replies (`K` tags) → `comment_events`; community posts (`a:34550:...`) → `community_events`. Community posts (1111) and approvals (4550) load DB-first via `fetchCommunityPostsFromDb`.
- File storage: Blossom. Encryption: NIP-44 (DMs + documents).

## Order Messages & Payment Tags

- **Payment method names**: `resolveExplicitPaymentMethod()` in `utils/messages/order-message-utils.ts` is the canonical mapper (`stripe`→`Card`, `nwc`→`NWC`, etc.). Order-summary pages add descriptive labels (e.g. `Lightning`→`Lightning Network`).
- **Currency**: Orders dashboard reads `["currency", ...]` from the order message first, falls back to listing currency.
- **Shipping tags**: Strict 4-tuple `["shipping", type, cost, currency]` validated against `SHIPPING_OPTIONS` in `utils/parsers/product-tag-helpers.ts`. `getEffectiveShippingCost()` returns 0 for `Free`/`Free/Pickup`/`Pickup`/`N/A` and for `Added Cost/Pickup` when pickup is selected.
- **Order grouping**: `buildOrderGroupingKey()` keys on product ref + amount + fulfillment target. `getOrderConsolidationKey()` + `registerTaggedOrderGroupingKey()` dedupe across explicit order tags and computed keys.
- **Subject routing**: `messages.tsx` routes order subjects (`order-payment`, `order-info`, `payment-change`, `order-receipt`, `shipping-info`, `order-completed`, `zapsnag-order`, `address-change`) to the Orders chat tab. MCP `create-order.ts` `sendOrderEmail()` passes full metadata for complete buyer/seller emails.
