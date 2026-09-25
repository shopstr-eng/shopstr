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

## HODL Escrow: Real LND Testing

Lightning escrow requires `HODL_INVOICE_PROVIDER=lnd`, PostgreSQL, a persistent
`HODL_ESCROW_ENCRYPTION_KEY`, LND TLS and invoice/payment macaroons, and matching
Nostr arbiter keys (see `.env.example`). Enable the checkout button with
`NEXT_PUBLIC_HODL_ESCROW_ENABLED=true`. Buyer, seller and arbiter must be distinct.
There is no runtime mock provider or fake-payment endpoint.

Use two connected, funded LND nodes on a private Bitcoin regtest network. The
seller's Lightning address must issue invoices from the receiving test node.

1. Pay a listing's Lightning escrow invoice with the buyer node. Verify LND reports
   `ACCEPTED`, the payer remains pending, and the order survives a server restart.
2. Confirm receipt as the buyer. Verify the hold settles, one seller invoice is
   paid, and repeated confirmation/collection does not produce another payment.
3. Raise a buyer dispute and resolve it as the configured arbiter in `/disputes`.
   Releasing to buyer must cancel the held payment without a seller payout.
4. Test stranger access, forged confirmation/ruling, unavailable relays, and a
   seller dispute before its four-hour waiting period. These must not release funds.
5. Interrupt the app after a seller payment, then restart. Recovery must track the
   recorded payment in LND and record success without creating another invoice.
6. Disconnect the invoice service. A settled order must retain the seller debt and
   recover when the service returns. The UI must distinguish release from payout.

Recovery runs on startup and every 30 seconds. Hosts that sleep need scheduled
`POST /api/lightning/sync-hodl-orders` with `Authorization: Bearer <CRON_SECRET>`.

The opt-in `utils/lightning/__tests__/hodl-regtest.test.ts` exercises real held
payments, cancellation, seller payout and reconciliation. Set `RUN_LND_REGTEST=1`,
`LND_REGTEST_PEER_CONTAINER`, and the connection variables above, then run:

```bash
npm test -- --runInBand utils/lightning/__tests__/hodl-regtest.test.ts
```

Invoice expiry is the time to **start** payment. Once accepted, LND's HTLC block
expiry determines how long funds remain held; a four-hour application timer does
not guarantee that lifetime. Backdating a test row checks the authorization gate
only. Test actual block expiry separately before enabling a fulfillment workflow.

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

### Durable HODL orders and payouts

Set `HODL_ESCROW_ENCRYPTION_KEY` to a persistent, secret 32-byte hex key before
registering escrow orders. Preimages and fulfillment snapshots are encrypted
with AES-256-GCM and bound to their order and purpose. Startup migrates legacy
plaintext preimages when the key is configured. Retain the key across deployments;
changing it without migrating existing rows prevents decryption and settlement.

The authenticated `/api/lightning/hodl-orders` endpoint recovers a party's orders
after closing checkout. A settled escrow remains a seller obligation until its
payout is confirmed. The LND server scans obligations every 30 seconds; hosts
that can sleep also need a scheduler calling `POST /api/lightning/sync-hodl-orders`
with `Authorization: Bearer <CRON_SECRET>`. Monitor unconfirmed and abandoned
rows in `hodl_escrow_payouts`. An abandoned payout needs manual reconciliation;
never discard its invoice or assume that a timeout proves it unpaid.

Run `npm run test:integration` for real PostgreSQL migrations, ciphertext
round trips, and concurrent payout locking. For real Lightning integration,
`utils/lightning/__tests__/hodl-regtest.test.ts` is opt-in via `RUN_LND_REGTEST=1`.
Use two funded, connected local regtest LND nodes and a disposable PostgreSQL
instance. Configure localhost `LND_HOST`, the escrow node's TLS certificate and
invoice macaroon, a payout macaroon restricted to SendPaymentV2/TrackPaymentV2,
`DATABASE_URL`, `ARBITER_NOSTR_PUBKEY`, `HODL_INVOICE_PROVIDER=lnd`, and
`SHOPSTR_DB_AUTO_INIT_IN_TESTS=1`. Set `LND_REGTEST_PEER_CONTAINER` to the payer
Docker container, whose `lncli --network=regtest` uses its own local credentials.
Run that test file with Jest `--runInBand`. It verifies accepted/settled/cancelled
HTLCs, real seller payment, and retry after a lost database acknowledgment.
Only disposable local test funds may be used.

### HODL launch and recovery checks

HODL runtime requires real LND, PostgreSQL, encrypted storage, matching arbiter
public/private keys, and an available signed seller profile with a usable Lightning
address. Checkout reads LND `GetInfo` and LNURL metadata before creating an invoice.
The invoice macaroon needs `GetInfo` in addition to the four invoice RPCs. This
preflight cannot guarantee future routing liquidity or seller-address availability.

The default policy offers pickup/contact only. `HODL_HOLD_CLTV_DELTA` defaults to
80 blocks (accepted range 48–144). `NEXT_PUBLIC_HODL_ALLOW_SHIPPING=true` explicitly
allows shipped orders, with deadline warnings. Unpaid invoices expire after one
hour; funded holds expire according to actual HTLC block heights. Resolve at least
18 blocks before expiry; neither block timing nor delivery duration is guaranteed.
Seller disputes retain their four-hour wait, measured from LND's last accepted
HTLC part. Orders with missing or near-expiry hold data cannot be marked shipped.

Buyer invoices can be resumed from Orders. Displayed creation and unpaid-expiry times are decoded
from BOLT11's timestamp and `x` tag (3600 seconds when absent), independent of
legacy database timestamp time zones. The expiry of an accepted hold is instead
determined by LND's HTLC block height.

Retrying the same checkout ID returns the original committed invoice; changing
its contents is rejected. Cart escrow
creates one separately priced order per product, including quantity, so partial
payment is recoverable. Shipping thresholds apply per independent order. Do not
pay funded cart lines again using another payment method.

Keep the Node recovery worker alive, or run authenticated POST
`/api/lightning/sync-hodl-orders` with `Authorization: Bearer <CRON_SECRET>` every
30 seconds on a host with enough execution time. It synchronizes LND status,
verifies and applies published confirmations/rulings, and reconciles seller payouts.
Unreachable relays do not authorize a release. A ruling published during a seller
waiting period is retried after eligibility, provided LND still holds the payment.

Sellers/arbiters can use **Check seller payout** on settled orders. It reconciles
against LND and the already recorded payout invoice; it never clears an uncertain
payment or changes its destination. Escalate abandoned payouts with the order hash.
An operator must establish the recorded payment's terminal outcome before any
manual compensation. Monitor pending/abandoned payouts, recovery failures, node
sync, channel liquidity, relay availability and remaining hold blocks. Back up the
PostgreSQL database together with the encryption key and arbiter identity securely.
