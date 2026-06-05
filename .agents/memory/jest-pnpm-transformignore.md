---
name: Jest transformIgnorePatterns under pnpm
description: Decision — allowlist ESM deps with two explicit transformIgnorePatterns (pnpm + classic), never one optional-group lookahead.
---

# Jest transformIgnorePatterns under pnpm

**Rule:** When allowlisting ESM-only deps (nostr-tools, @noble/_, @scure/_,
@getalby/_, @cashu/_, uuid, dexie) so Jest transforms them, use TWO explicit
`transformIgnorePatterns` — one for the pnpm `.pnpm/<pkg>/node_modules/` layout
and one for the classic/hoisted layout — each with its own negative lookahead.
Do NOT collapse them into a single pattern with an optional pnpm group.

**Why:** Patterns match anywhere in the path (unanchored). A single pattern with
an _optional_ `.pnpm/.../node_modules/` group lets the regex engine backtrack and
re-anchor at the OUTER `node_modules/`, where the next segment is `.pnpm` (not in
the allowlist) — so an allowlisted nested ESM dep gets ignored/untransformed and
any test that imports the real module dies with "Cannot use import statement
outside a module". The bug hides while tests mock the module and only surfaces
when one loads it for real (a dependency bump can trigger this).

**How to apply:** In the lookahead, match the inner form of scoped packages
(`@scope/name`), since pnpm dirs use `@scope+name@ver` but the inner
`node_modules/` uses `@scope/name`. `pages/listing/__tests__/listing-page.test.tsx`
loads real nostr-tools through the pnpm layout and acts as the regression guard.
