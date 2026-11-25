# Dependency security compatibility

Run `npm run audit:deps` to audit **both** independently installed trees.
`npm run test:dependency-compat` covers the overrides through their real consumers,
including legacy glob, modern glob, ESLint plugin resolution, coverage filtering,
HeroUI theme merges and prototype-poisoning regressions.

## minimatch

GHSA-g3hv-75wg-m249 marks every release before 11.0.1 as affected, including
legacy releases still required by ESLint plugins, glob 7 and coverage tooling.
Blindly overriding those consumers to minimatch 11 breaks their callable
CommonJS API.

The local `minimatch-compat` package provides that export shape while delegating
all matching to upstream minimatch 11.0.4, installed under the `minimatch-patched`
npm alias. It also preserves the named exports needed by modern consumers.
There is no copied legacy matcher or suppressed advisory.

## deepmerge

There is no patched upstream release for GHSA-gcqx-w48m-w2h4. Downgrading to a
version omitted from its range would not demonstrate that the bug is fixed.
`deepmerge-safe` is an MIT-licensed derivative of deepmerge 4.3.1, retaining the
API used by HeroUI v2, Jest and Rollup. It rejects `__proto__`, `constructor`
and `prototype` keys from **both** inputs at every cloned/merged level, including
null-prototype objects. Writes use data descriptors rather than invoking setters.
As in upstream, `clone: false` and custom merge callbacks explicitly allow
caller-owned references/values and are not sanitization boundaries.

Keep this replacement until an upstream fix or a compatible parent migration
is available; do not remove it just because an audit no longer lists deepmerge.

## Installation

The local packages are direct dependencies as well as override targets.
`.npmrc` uses `install-links=true` so npm copies their contents rather than
creating filesystem links. This is important for clean installs and Next.js
standalone tracing. After editing their contents, use `npm ci` to refresh the
installed copies before running tests or building.
