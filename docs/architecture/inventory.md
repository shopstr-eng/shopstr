# Inventory

- **Centralized**: Postgres `inventory` (product_id, seller_pubkey, variant_key, quantity, source) + `inventory_log`. Variant keys: `_default` for global, `size:Name` for per-size.
- **Auto deduction**: All order flows deduct on success. Bulk/bundle orders multiply bundle size × quantity.
- **Seller override**: Publishing kind 30402 with quantity tags syncs inventory with `source: 'seller_override'`.
- **API**: `/api/inventory` actions: `check`, `deduct`, `set`, `restore`, `sync`. Service: `utils/db/inventory-service.ts`.
- MCP availability checks consult inventory first, falling back to Nostr event quantities for untracked products.
