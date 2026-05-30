---
name: Onboarding flow redirects
description: Inserting a step into the seller onboarding wizard requires updating multiple redirect entry points, not just the linear "Next" chain.
---

The seller onboarding wizard is `new-account → user-type → choose-plan → market-profile → shop-profile → stripe-connect`, with `type`, `plan`, and `migrate` threaded as query params via per-page `URLSearchParams` builders.

**Rule:** When you insert or move a step, you must update _every_ redirect that targets the wizard, not just the visible "Next" button chain. There are at least two non-obvious auto-redirects for the Shopify migration funnel:

- `pages/onboarding/new-account.tsx` — after account creation, `migrate === "shopify"` redirects sellers past role selection.
- `pages/onboarding/user-type.tsx` — a `useEffect` also auto-redirects `migrate === "shopify"` sellers (in case they land on user-type directly).

**Why:** Missing one silently bypasses the new step (e.g. Shopify migrants skipping plan choice) and drops threaded params like `plan`. The buyer path intentionally skips `choose-plan` (buyers go straight to `market-profile`).

**How to apply:** grep the whole `pages/onboarding/` dir for `router.push`/`router.replace` and `migrate === "shopify"` before assuming the flow is linear. Step-number labels are hardcoded per page (seller profile=Step 4, stall=5, card=6; buyer profile stays Step 3) — keep them in sync when reordering.
