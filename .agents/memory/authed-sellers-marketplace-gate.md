---
name: Authed-sellers marketplace gate
description: How marketplace visibility is gated on the listing password, and the trust/fail-closed constraints around it.
---

# Authed-sellers marketplace gate

The marketplace only displays products from pubkeys that have entered the listing
password. Backed by a server-side `authed_sellers` table (pubkey PK), exposed via
`GET /api/authed-sellers`, and filtered client-side in `display-products.tsx`.

**Why server-side:** the original listing-password auth was tracked ONLY in
`localStorage` per-browser, never tied to an npub. To hide non-authed sellers for
_all_ visitors you need a shared/server record, not localStorage.

**How it grows:** `POST /api/validate-password` records the submitted pubkey via
`recordAuthedSeller` on success. The two pre-existing sellers are seeded in
`ensureAuthedSellersTable` because they authed before tracking existed and have no
DB row otherwise.

## Constraints to preserve

- **Fail closed.** The client filter must hide products while the allowlist is
  still loading (`authedSellers === null`) and on any API error/malformed payload
  (set empty Set). A fail-open default silently exposes every seller.
- **A logged-in seller always sees their own products** (`userPubkey === product.pubkey`),
  even before they appear in the allowlist — mirrors prior hardcoded-filter behavior.
- **Recorded pubkey is client-supplied, not ownership-proven.** Trust rests on the
  shared listing password: anyone with it can whitelist an arbitrary pubkey. Acceptable
  under the shared-password model (they could list under their own key anyway). If this
  ever needs hardening, bind the pubkey with a signed proof (NIP-98) in the password flow.
