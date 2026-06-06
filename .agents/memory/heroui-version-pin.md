---
name: HeroUI version pin (v2, not v3)
description: Why @heroui/react must stay on v2.x and how a dependabot major bump broke the deploy build
---

# HeroUI must stay on v2.x

`@heroui/react` must remain on **2.8.10**. The codebase uses v2-only APIs in ~52 files: `ModalContent`, `useDisclosure`, v2 Button/Input prop shapes, `HeroUIProvider`.

**Why:** v3 is a breaking React Aria Components rewrite — it removes `ModalContent`, `useDisclosure`, etc. A dependabot-style "bump the major-updates group" commit pushed `@heroui/react` 2.8.10 → 3.1.0 (and `@getalby/sdk` 7 → 8) in package.json **and** the lockfile with no code migration. `npm ci` at deploy time installs the lockfile exactly (v3) → `next build` fails with `Module '"@heroui/react"' has no exported member 'ModalContent'`. `@getalby/sdk` v8 was fine (still exports `NostrWebLNProvider`); only HeroUI needed reverting.

**How to apply:** If a deploy build fails on a missing HeroUI export, check package.json/lockfile for a v3 bump and pin back to 2.8.10, then `npm install` to regenerate the lockfile. Reject dependabot HeroUI majors unless a full v3 migration is planned.

## Stale node_modules can mask deploy failures

A local `next build` can PASS while the deploy FAILS, because local `node_modules` may be stale (left at an old version that no longer matches the lockfile). The deploy's `npm ci` installs the lockfile exactly. **Before trusting a local build as a deploy gate, reconcile node_modules to the lockfile** (`npm ci`, or `npm install` then verify installed version == lockfile version).
