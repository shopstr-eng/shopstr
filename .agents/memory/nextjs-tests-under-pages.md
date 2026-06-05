---
name: Test files must not live under pages/
description: Why a Jest test colocated in pages/ crashes `next build` even though dev works
---

Jest/RTL test files must NOT live anywhere under `pages/` (e.g.
`pages/listing/__tests__/foo.test.tsx`). Keep them in the top-level
`__tests__/` tree instead.

**Why:** Next.js treats every file under `pages/` (matching pageExtensions,
which includes `.test.tsx` since it ends in `tsx`) as a route. `next dev`
(Turbopack) tolerates it, but `next build` / `build:deploy` runs "Collecting
page data" and module-evaluates the file as a page — the jest globals
(`expect`, `describe`, `jest`) are undefined at build time, so it throws
`ReferenceError: expect is not defined` and the whole build fails. This is a
latent trap: it never shows up in dev, only on a production build/deploy.
This repo has no `pageExtensions` filter, so there is nothing catching it.

**How to apply:** When adding or relocating component/page tests, put them
under top-level `__tests__/` (mirroring the source path, e.g.
`__tests__/pages/listing/listing-page.test.tsx`). Jest still finds them
(next/jest default testMatch scans `**/__tests__/**` and `*.test.*`
anywhere) and `@/...` import aliases resolve from any location. After any
merge, `find pages -name '*.test.*'` should return nothing.
