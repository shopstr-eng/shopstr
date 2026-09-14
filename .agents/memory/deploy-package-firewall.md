---
name: Deploy package firewall blocks CVE'd versions
description: Replit deploy builds fetch npm packages through a firewall that 403s versions with critical CVEs, and Replit-local installs pollute the lockfile with non-portable URLs
---

# Deploy package firewall blocks CVE'd versions

Deploy builds resolve npm tarballs through `package-firewall.replit.internal`, which returns **403 "Blocked by Security Policy" (Critical CVE)** for affected versions. This killed a deploy on `next@16.3.1`; the fix was bumping to `16.3.5` (16.3.3 is the patched floor for the critical RCE advisories). Local dev had a stale `node_modules` at 16.2.7, so everything looked fine locally.

**Why:** the block only fires in the deploy's fresh `npm install`/`npm ci`; a stale local tree never downloads the pinned tarball, so the failure is invisible until publish.

**How to apply:**
- If a deploy build fails in the "Installing packages" phase with `E403` / "Blocked by Security Policy", bump the named package to its nearest patched release.
- After running `npm install` on Replit, check `git diff package-lock.json` before committing: installs here rewrite some `resolved` URLs to `http://package-firewall.replit.internal/...` (breaks `npm ci` off-Replit) and can drop `libc` fields from native-binary records (breaks musl installs). Repair: rewrite those URLs back to `https://registry.npmjs.org/...` and restore `libc` from the previous lockfile (libc constraints are stable per package name across versions).
- Validate the deploy path locally with a clean `npm ci --prefer-offline --no-audit --no-fund && npm run build`, not just a build against an existing node_modules.
