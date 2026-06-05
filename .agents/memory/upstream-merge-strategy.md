---
name: Upstream (shopstr) → milk-market merge strategy
description: How to port changes from the shopstr-eng/shopstr upstream into the heavily diverged milk-market downstream without regressing downstream features.
---

# Porting from upstream `shopstr` into `milk-market`

`origin` = shopstr-eng/milk-market; `upstream` = shopstr-eng/shopstr. The downstream
is hundreds of commits diverged with whole features upstream lacks (Pro tier, custom
storefronts/stalls, affiliates, herdshares, shipping, Stripe, MCP rework).

**Rule:** never bulk `git merge upstream/main`. Cherry-port individual upstream changes
by hand and adapt them.

**Why:** a blind merge produces massive conflicts and silently regresses diverged
downstream work (custom stall/storefront, cart/invoice totals, order DMs, reporting,
_app SSR ogMeta). The user explicitly wants only genuine refinements, styled to match.

**How to apply:**
- Safe to port (touch files that barely diverged): security/input hardening
  (og-preview URL normalization, fetch-service event validation, order-status API
  bounds), small self-contained UX (api-key show/hide, passphrase show/hide,
  NIP-99 content-as-description parser), dropdown search filters.
- Skip / high regression risk (files reworked downstream): cart invoice totals,
  storefront cart hardening, the reporting overhaul touching `_app.tsx`, the
  upstream "seller orders dashboard" (downstream has its own), MCP changes, the
  nostr abort-handling overhaul, dependabot bumps (downstream pins differ, e.g.
  `@cashu/cashu-ts` 4.1.0).
- Any UI port must be restyled to Milk Market's neo-brutalist look
  (`border-2/4 border-black`, `shadow-neo`, `bg-primary-yellow`, light theme,
  black text) — upstream's `shopstr-*`/`dark:` palette classes do not apply and
  several pages (e.g. `pages/onboarding/user-type.tsx`) are fully restyled already.
- Don't port upstream test files; they assert upstream code shape.

## Gotchas
- `FollowsContextInterface` exposes `firstDegreeFollowsLength` (number), `followList`,
  `isLoading`. The `ln` field only appears in test mocks (mm-slider tests) — real code
  uses `firstDegreeFollowsLength`.
- Downstream tsconfig has no global `JSX` namespace — don't annotate with `JSX.Element`;
  drop the cast or use React types.
- HeroUI `Select` long-list search = `listboxProps.topContent` with an `<Input>` whose
  `onKeyDown`/`onClick` call `e.stopPropagation()` so typing doesn't trigger item
  selection; filter the `SelectItem`s by the search value. Remove `sticky top-1 z-20`
  from section heading classes when adding a search input or it overlaps the input.
