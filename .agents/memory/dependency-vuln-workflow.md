---
name: Dependency vulnerability workflow (overrides + dual lockfiles)
description: This repo fixes transitive npm vulns via package.json overrides pins; packages/shopstr-mcp has an independent lockfile that root overrides and root npm audit do not cover
---

# Dependency vulnerability workflow

The maintainers' convention for transitive vulnerabilities is **npm `overrides` pins in package.json**, not parent-package upgrades. When fixing advisories, bump/add pins there.

Gotchas learned the hard way:

- **`packages/shopstr-mcp` is a separately installed package** (own package.json + lockfile, `npm ci --prefix packages/shopstr-mcp` in docs/CI). Root overrides and root `npm audit` do NOT apply to it — always audit and fix it independently.
- **Blanket overrides can force API-incompatible majors.** Case: `brace-expansion@5.x` pinned tree-wide breaks minimatch 3.x/5.x consumers that expect the v1/v2 callable API (v2+ exports `{expand}`). Scope by range instead: `"brace-expansion@>=3.0.0 <6.0.0": "5.0.9"` is safe because v3/4/5 share the named-export API. After any override change, run a runtime smoke test through the actual consumers, not just the test suite (tests may not exercise the path).
- **`npm audit`'s suggested major "fixes" can be downgrades in disguise** (it wanted @modelcontextprotocol/sdk 1.29.0→1.25.3 and jest-environment-jsdom 30→29 to escape vulns that actually lived in transitive express/qs/ws). Fix the transitive dep; don't take the downgrade.

**Why:** dependabot alerts are computed per-lockfile, and overrides are this repo's chosen mechanism — mixing mechanisms or missing the second lockfile leaves the audit green while a deployable package stays vulnerable.

**How to apply:** for any "fix dependabot alerts" request, audit BOTH lockfiles, prefer scoped override pins compatible with consumers' declared ranges, and remember the post-install lockfile scrub (see deploy-package-firewall note).
