# Testing

Shopstr uses Jest for unit and integration-style tests around UI components,
Nostr helpers, parser logic, API handlers, and Cashu wallet flows.

## Local Commands

```bash
npm test
npm test -- --watch
npm test -- --testPathPattern=<pattern>
npm run test:ci
npm run test:coverage
```

- `npm test` runs the suite in the default local mode with watch enabled.
- `npm test -- --watch` enables file change detection for continuous testing during development.
- `npm test -- --testPathPattern=nostr-helper` runs tests matching a file pattern (e.g., Nostr tests).
- `npm run test:ci` runs Jest serially for deterministic CI output (no watch mode).
- `npm run test:coverage` runs the CI suite with coverage collection and thresholds from `jest.config.cjs`.

## CI Enforcement

Pull requests to `main` run `.github/workflows/test.yml`. The workflow installs
dependencies with `npm ci` on Node 22, runs `npm run test:coverage`, and fails
the PR when either tests or coverage thresholds fail.

The coverage threshold currently focuses on the high-risk modules called out for
CI hardening:

- `utils/nostr/nostr-helper-functions.ts`
- `utils/nostr/fetch-service.ts`
- `utils/db/cache-event-policy.ts`
- `utils/parsers/product-parser-functions.ts`
- `utils/parsers/product-tag-helpers.ts`

Raise the threshold as coverage grows. New tests for Nostr order messaging,
Cashu wallet reconciliation, cache policy, and NIP-99 parsing should prefer
small, explicit fixtures that preserve real tags and event shapes.

## Test Environment & Setup

The project uses:

- **React Testing Library** for component testing with jest-dom matchers
- **jest-environment-jsdom** for DOM simulation
- **Next.js Jest integration** for automatic Next.js config loading
- **Module alias support** via `@/` path mapping
- **Custom jest.setup.js** that:
  - Mocks browser APIs (`TextEncoder`, `TextDecoder`)
  - Polyfills `Number.prototype.toNumber()` for Cashu `Amount` class compatibility
  - Filters out benign React/DOM warnings during test runs
  - Handles third-party mocks (e.g., `@braintree/sanitize-url`)

Additional environment variables used by tests

- **`RUN_TESTCONTAINERS`**: Set to exactly `1` to enable Testcontainers-backed integration tests. These tests will start real containers (e.g., Postgres) via Testcontainers and therefore require Docker to be available on the host or CI runner. Tests that require real Postgres are skipped by default locally.
- **`NEXT_PUBLIC_P2PK_ESCROW_ENABLED`**: Set to exactly `true` to enable P2PK escrow checkout on a deploy preview or staging deployment.
- **`NEXT_PUBLIC_P2PK_ESCROW_MAX_SATS`**: Optional P2PK escrow checkout cap. The app defaults to 100 sats and clamps higher configured values back to 100.
- **`NEXT_PUBLIC_P2PK_ESCROW_TEST_LOCKTIME_SECONDS`**: Optional short locktime override for deploy-preview testing. Do not set this in production.
- **`NEXT_PUBLIC_P2PK_ESCROW_ALLOWED_MINTS`**: Optional comma-separated list of mint URLs allowed for P2PK escrow checkout. Leave unset for local development; if set incorrectly, P2PK checkout fails closed.
- **`CASHU_MINT_VALIDATION_ALLOWED_MINTS`**: Optional server-side comma-separated mint allowlist for `/api/cashu/validate-mint`. Leave unset unless a deployment wants to restrict server-side mint discovery probes.

Transformed dependencies include: `dexie`, `nostr-tools`, `@noble/*`, `@scure/*`,
`@getalby/lightning-tools`, `@cashu/cashu-ts`, and `uuid`.

## P2PK Escrow Real-Money Staging Runbook

Run this only on a deploy preview or staging deployment with
`NEXT_PUBLIC_P2PK_ESCROW_ENABLED=true`, a max value of 100 sats or less, and a
known allowlisted mint whose NUT-06 `/v1/info` advertises NUT-10, NUT-11, and
NUT-07 support, and whose active keysets advertise zero input fees. Use two
fresh real Shopstr accounts with NIP-44-capable signers and generated Cashu
wallet identities.

Record order IDs, public event IDs, mint URL, sats amount, locktime, and proof
state outcomes. Never record or paste Cashu private keys, encoded tokens,
proof secrets, proof `C` values, or wallet event plaintext.

1. Seller wallet claim: Buyer A pays an escrow listing under the cap. Seller B
   claims the P2PK token into the Shopstr wallet before locktime. Verify the
   original proofs become spent at the mint and fresh seller proofs appear.
2. Seller Lightning redeem: Buyer A pays another low-value escrow listing.
   Seller B redeems the P2PK token to a real low-value Lightning address. Verify
   melt success, change handling, and spent original proofs.
3. Buyer reclaim: Buyer A pays an escrow listing and Seller B does not claim.
   Wait for the short test locktime. Buyer A confirms the refund/reclaim UI is
   available from the escrow record, reclaims into the wallet, and then verifies
   a later seller claim fails because the proofs are spent.
4. Negative checks: unsupported mint blocks checkout, missing Cashu wallet
   identity blocks checkout/claim, wrong refund key does not show reclaim,
   duplicate or spent token handling remains correct, and no private keys,
   tokens, or proofs appear in console, DB logs, screenshots, or artifacts.

## Viewing Coverage Reports

After running `npm run test:coverage`, open the HTML report:

```bash
open coverage/lcov-report/index.html
```

Coverage is tracked in `coverage/` with:

- `lcov.info` - line/branch coverage data
- `coverage-final.json` - summary by file
- `lcov-report/` - interactive HTML report

## Writing Tests

### Component Tests

- Use `render()` and `screen` queries from React Testing Library
- Mock child components and external dependencies with `jest.mock()`
- Mock Next.js router with `jest.mock("next/router")`
- Use `waitFor()` for async state updates

### Cashu Wallet Tests

- Return plain numbers from mocks (the `Number.prototype.toNumber()` shim handles conversion)
- Test quote flows with mock mint responses and wallet state changes
- Verify rate-limit retry behavior in quote helpers

### Nostr Tests

- Use realistic event fixtures that preserve actual tag structure
- Test tag parsing, filtering, and event ordering
- Mock relay connections for deterministic output
