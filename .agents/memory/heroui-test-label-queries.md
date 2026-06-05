---
name: HeroUI form label queries in tests
description: Why getByLabelText fails on milk-market forms and what to use instead
---

In milk-market settings forms (market-profile-form, shop-profile-form, etc.),
field captions are plain `<label>` elements that are NOT associated to their
HeroUI `Input`/`Select` (no `htmlFor`/`id` or `aria-label`). So Testing Library
`getByLabelText("...")` / `findByLabelText("...")` throws
"no form control was found associated to that label".

**How to apply (in tests):**

- Text `Input`: query by its `placeholder` (e.g. `findByPlaceholderText("Add your display name...")`).
- `type="number"` `Input`: query by `getByRole("spinbutton")`.
- HeroUI `Select` with no `label` prop: its trigger is a `button` whose
  accessible name is the currently-selected value text — target that
  (e.g. `getByRole("button", { name: /Local Currency \(Fiat\)/i })`),
  not a caption that isn't wired up.

**Why:** these are durable downstream rendering choices; tests ported from
upstream (which used associated labels / different captions) break on them.
