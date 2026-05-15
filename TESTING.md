# Testing

Shopstr uses Jest for unit and integration-style tests around UI components,
Nostr helpers, parser logic, API handlers, and Cashu wallet flows.

## Local Commands

```bash
npm test
npm run test:ci
npm run test:coverage
```

- `npm test` runs the suite in the default local mode.
- `npm run test:ci` runs Jest serially for deterministic CI output.
- `npm run test:coverage` runs the CI suite with coverage collection and the
  configured threshold in `jest.config.cjs`.

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
