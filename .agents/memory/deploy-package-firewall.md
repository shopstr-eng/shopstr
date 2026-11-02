---
name: Deploy package firewall blocks CVE'd versions
description: Replit deploy builds fetch npm packages through a firewall that 403s versions with critical CVEs, and Replit-local installs pollute the lockfile with non-portable URLs
---

# Deploy package firewall blocks CVE'd versions

Deploy builds resolve npm tarballs through `package-firewall.replit.internal`, which returns **403 "Blocked by Security Policy" (Critical CVE)** for affected versions. A previous fix later became vulnerable to new advisories, so never treat an old recorded patched floor as permanently safe: consult the current audit ranges. Stale local `node_modules` previously hid a vulnerable locked version.

**Why:** the block only fires in the deploy's fresh `npm install`/`npm ci`; a stale local tree never downloads the pinned tarball, so the failure is invisible until publish.

**How to apply:**

- If a deploy build fails in the "Installing packages" phase with `E403` / "Blocked by Security Policy", bump the named package to its nearest patched release.
- After running `npm install` on Replit, check `git diff package-lock.json` before committing: installs here rewrite some `resolved` URLs to `http://package-firewall.replit.internal/npm/<pkg>/-/<file>` (breaks `npm ci` off-Replit) and can drop `libc` fields from native-binary records (breaks musl installs). Repair: rewrite to `https://registry.npmjs.org/<pkg>/-/<file>` — note the `/npm/` path segment must be stripped — and restore `libc` from the previous lockfile (libc constraints are stable per package name across versions). Verify by curling every changed `resolved` URL for a 200.
- Validate the deploy path locally with a clean `npm ci --prefer-offline --no-audit --no-fund && npm run build`, not just a build against an existing node_modules.
