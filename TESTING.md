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

## HODL Escrow Dev Runbook

Hold-invoice escrow is a second, independent escrow system: the buyer pays a
Lightning hold invoice, the sats stay locked at the node, and the invoice is
either settled (seller paid) or cancelled (buyer refunded). Unlike the P2PK
runbook above, this one moves no real money — it runs entirely against the
in-memory mock provider, which is installed automatically whenever
`NODE_ENV !== "production"`.

Environment (`.env.local`):

- **`DATABASE_URL`** — escrow commitments live in Postgres.
- **`NEXT_PUBLIC_HODL_ESCROW_ENABLED=true`** — shows the "Pay with Lightning
  Escrow" checkout button. Everything else stays wired with it off.
- **`NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY`** / **`ARBITER_NOSTR_PRIVKEY`** — the
  dispute arbiter. Without these, registration fails with a 500.
- **`CRON_SECRET`** — bearer token for `POST /api/lightning/sync-hodl-orders`.
- Leave **`HODL_INVOICE_PROVIDER`** unset. Setting it to anything but `mock`
  in dev requires a real Lightning backend.

Three distinct keys are needed: the register route rejects any buyer / seller /
arbiter overlap. The mock provider is a module-level in-memory singleton, so
its invoices live only as long as the dev-server process — restarting
`npm run dev` orphans any open order.

1. **Checkout.** As the buyer, pay a listing with "Pay with Lightning Escrow".
   An `lnmock1…` string and QR render. The invoice is deliberately unpayable by
   any wallet; the DB row is `open` and the checkout begins polling.
2. **Pay it.** `curl -X POST localhost:5000/api/lightning/dev-pay-hodl-invoice
-H 'Content-Type: application/json' -d '{"paymentHash":"…"}'`. The row moves
   to `accepted` with `accepted_at` stamped, the poll notices, and the order DMs
   go out to both parties. This route 404s in a production build.
3. **Collect too early.** As the seller, press **Collect** before the buyer has
   confirmed. It must report that the buyer has not confirmed yet — settle
   authorizes off the buyer's signed kind-30408 event on relays, never off the
   requester, so an unconfirmed collect is refused with `no_confirmation`.
4. **Happy path.** As the buyer, press **Confirm Receipt**. A kind 30408 is
   published to relays, then settle returns `{"status":"settled"}`. The seller's
   Collect now succeeds too (settle is idempotent).
5. **Dispute path.** On a second order, the buyer presses **Raise Dispute** —
   kind 30410, tagging the arbiter. Logged in as the arbiter, `/disputes` (an
   unlisted URL, no nav link) lists it under "Lightning Escrow Disputes".
   **Release to Buyer** publishes kind 30409 and cancels the invoice.
6. **Seller dispute timeout.** A _seller_-raised dispute is not actionable until
   four hours after `accepted_at`. Ruling on one shows a countdown rather than
   an error. To exercise the actionable branch without waiting, backdate the
   row's `accepted_at`.
7. **Sweep.** `curl -X POST localhost:5000/api/lightning/sync-hodl-orders
-H "Authorization: Bearer $CRON_SECRET"` returns counts only. This is the
   path for orders nobody is watching; an order with an open checkout tab is
   already synced inline by the status route.
8. **Restart mid-flow once.** Orphaned in-memory invoices should fail visibly
   rather than hang.

Never record preimages. The preimage is what settles the invoice and it never
leaves the server by design.

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
