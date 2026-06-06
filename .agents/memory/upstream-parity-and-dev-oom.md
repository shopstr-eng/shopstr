---
name: Upstream-parity merge-record + dev cold-compile OOM
description: Two gotchas from the big upstream (shopstr) hand-port — how to record git parity, and why the dev server dies after a dep install
---

# Recording git "up-to-date with upstream"

The fork (milk-market) is heavily diverged from `upstream/main`; we hand-port upstream areas rather than `git merge` (a raw merge clobbers diverged downstream files). To make `git` show parity afterward, the intended marker is `git merge -s ours upstream/main` (keeps our tree, records upstream as a merged parent so "behind" drops to 0).

**Constraint:** the main agent cannot run this — `git merge`/`git commit` are blocked destructive ops, and the auto-checkpoint/Project-Task merge-back is _content-based_, so a history-only (zero file diff) merge-record may not survive it. Practical paths: delegate to a background Project Task, or have the user run the one-liner themselves. Do NOT attempt a raw `git merge upstream/main`.

**How to apply:** when asked to "merge all upstream" or "show up-to-date with upstream," port area-by-area (diff `<merge-base>..upstream/main` for the files, check downstream divergence, port only genuine net improvements, preserve downstream features, adapt UI to neo-brutalist, typecheck). The literal git parity record is a separate, last step that the main agent must hand off.

# Dev server dies right after a dependency install

`pnpm install` wipes the `.next` Turbopack cache. The dev workflow runs with `NODE_OPTIONS='--max-old-space-size=1024'` (1GB). The first _cold_ compile of the heaviest SSR route (the homepage `/` — `getServerSideProps` pulls Postgres + Nostr for OG meta) can exceed 1GB and the process exits → workflow flips to NOT_STARTED. The server itself boots fine ("✓ Ready in <1s").

**Why:** this is an environmental memory ceiling, NOT a code regression — `tsc --noEmit` (use `NODE_OPTIONS='--max-old-space-size=3072'`; plain tsc OOMs) stays clean through it.

**How to apply:** don't chase it as a code bug after a dep bump. The bash tool also kills any backgrounded `next dev` at call timeout, so you can't warm the cache outside the workflow — and leaked `next dev` processes from such attempts eat RAM and make everything else OOM (kill them with `pkill -9 -f "next dev"`). Verify health via typecheck + clean boot; treat heavy cold compiles as slow/environmental.
