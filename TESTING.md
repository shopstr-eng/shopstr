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

Transformed dependencies include: `dexie`, `nostr-tools`, `@noble/*`, `@scure/*`,
`@getalby/lightning-tools`, `@cashu/cashu-ts`, and `uuid`.

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
