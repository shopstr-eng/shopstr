---
name: cashu-ts-migration
description: Migrate a TypeScript/JavaScript codebase from `@cashu/cashu-ts` v2 to v4. Use when bumping cashu-ts past 2.x to unlock v3+ Wallet ergonomics (rate-limit aware retries, `Amount` boundary type, `KeyChain`, BOLT-method-typed quote helpers). Covers import renames, deprecated method renames, removed constructor options, the `Amount` boundary, the new `getDecodedToken(token, keysetIds)` signature, runtime `loadMint()` requirement, and Jest mock updates.
---

# `@cashu/cashu-ts` v2 → v4 Migration

`cashu-ts` v3 was a hard breaking change: classes were renamed (`CashuMint`/`CashuWallet` → `Mint`/`Wallet`), keysets moved into a `KeyChain`, all amounts became an opaque `Amount` class, mint/melt quote helpers were split per-payment-method (Bolt11/Bolt12), and wallets must be explicitly initialized with `loadMint()`. v4 layered additional API hardening on top. The authoritative migration guide ships in the package itself: read `node_modules/@cashu/cashu-ts/migration-4.0.0.SKILL.md` before starting.

## Pre-flight (do once)

1. Read `node_modules/@cashu/cashu-ts/migration-4.0.0.SKILL.md` end-to-end.
2. Pin the new version in `package.json`, run `npm install`.
3. **Independent prerequisite — `@noble/hashes` ≥ v2**: v2 dropped implicit `.js` extension resolution from ESM subpath imports. Sed-rename every `from "@noble/hashes/utils"` to `from "@noble/hashes/utils.js"` (and any other subpath you import). Skip and you get cryptic Next.js/Vite/Webpack module resolution errors that look like a cashu-ts problem.
4. **`@cashu/crypto/modules/common` was dropped**: `hashToCurve` is re-exported from `@cashu/cashu-ts` itself. Replace `import { hashToCurve } from "@cashu/crypto/modules/common"` with `import { hashToCurve } from "@cashu/cashu-ts"`.

## Step 1 — Class rename: import aliasing keeps blast radius small

`CashuMint` and `CashuWallet` no longer exist. Use the new `Mint` / `Wallet` exports. Aliasing in the import line preserves every downstream call site:

```ts
// before
import { CashuMint, CashuWallet } from "@cashu/cashu-ts";

// after
import { Mint as CashuMint, Wallet as CashuWallet } from "@cashu/cashu-ts";
```

This pattern lets `new CashuMint(...)` / `new CashuWallet(...)` keep working everywhere. Apply across all production AND test files.

## Step 2 — Drop removed constructor options

The `Wallet` constructor no longer accepts `{ keys }` (or other preload options). Construct the wallet with just the mint, then call `loadMint()`:

```ts
// before
const wallet = new CashuWallet(mint, { keys: storedKeys });

// after
const wallet = new CashuWallet(mint);
await wallet.loadMint(); // hydrates mint info, keysets, keys
```

## Step 3 — Method renames (BOLT11 helpers)

All quote-related wallet methods were split per payment method. For Lightning (the common case), append `Bolt11`. A bulk sed pass works because the names are unambiguous within `wallet.X(`:

| v2/early-v3               | v3+ / v4                        |
| ------------------------- | ------------------------------- |
| `wallet.createMintQuote(` | `wallet.createMintQuoteBolt11(` |
| `wallet.checkMintQuote(`  | `wallet.checkMintQuoteBolt11(`  |
| `wallet.mintProofs(`      | `wallet.mintProofsBolt11(`      |
| `wallet.createMeltQuote(` | `wallet.createMeltQuoteBolt11(` |
| `wallet.meltProofs(`      | `wallet.meltProofsBolt11(`      |

```bash
for f in $(git ls-files '*.ts' '*.tsx'); do
  sed -i \
    -e 's/wallet\.createMintQuote(/wallet.createMintQuoteBolt11(/g' \
    -e 's/wallet\.checkMintQuote(/wallet.checkMintQuoteBolt11(/g' \
    -e 's/wallet\.mintProofs(/wallet.mintProofsBolt11(/g' \
    -e 's/wallet\.createMeltQuote(/wallet.createMeltQuoteBolt11(/g' \
    -e 's/wallet\.meltProofs(/wallet.meltProofsBolt11(/g' \
    -e 's/wallet?\.createMeltQuote(/wallet?.createMeltQuoteBolt11(/g' \
    "$f"
done
```

Be sure to handle optional-chain forms (`wallet?.createMeltQuote(`) explicitly.

## Step 4 — Keysets moved into `KeyChain`

`wallet.getKeySets()` is gone. Use `wallet.keyChain.getKeysets()` which returns `Keyset[]` (a domain class), **not** the raw API DTO `MintKeyset`.

```bash
sed -i 's/wallet\.getKeySets()/wallet.keyChain.getKeysets()/g' "$f"
```

If the codebase has type annotations using `MintKeyset` against the result, the cheapest fix is to alias `Keyset as MintKeyset` in the import — both classes expose `.id` so most call sites are unaffected:

```ts
import { Keyset as MintKeyset } from "@cashu/cashu-ts";
```

If your code reads more than `.id` (e.g. `active`), you'll need to switch to `Keyset` proper and adjust field accesses.

## Step 5 — The `Amount` boundary (CRITICAL)

`Amount` is a class. Every quote/proof/response now carries `Amount` where v2 had `number`. The migration guide presents two strategies:

- **Choice A**: refactor your domain types to `Amount` end-to-end.
- **Choice B (recommended for sat-denominated marketplaces below `MAX_SAFE_INTEGER`)**: keep internal types as `number`, convert at the cashu-ts boundary with `.toNumber()`.

Choice B was the right call for shopstr (sat-only marketplace, simpler diff). Apply systematically:

```ts
// arithmetic — both Amounts → both .toNumber()
const total = meltQuote.amount.toNumber() + meltQuote.fee_reserve.toNumber();

// reduce sums over Proofs (Proof.amount is Amount in v3+)
const total = proofs.reduce((acc, p) => acc + p.amount.toNumber(), 0);

// passing to functions that take number (e.g. UI formatters)
formatWithCommas(meltQuote.fee_reserve.toNumber(), "sats");

// re-extracting an Amount from a response
const meltAmount = meltResponse.quote.amount.toNumber();
```

A single sed pass catches the high-volume reduce patterns:

```bash
sed -i \
  -e 's/acc + token\.amount/acc + token.amount.toNumber()/g' \
  -e 's/acc + p\.amount/acc + p.amount.toNumber()/g' \
  -e 's/acc + current\.amount/acc + current.amount.toNumber()/g' \
  -e 's/meltQuote\.amount + meltQuote\.fee_reserve/meltQuote.amount.toNumber() + meltQuote.fee_reserve.toNumber()/g' \
  "$f"
```

Method **inputs** that accept `AmountLike` (e.g. `wallet.createMintQuoteBolt11(amount)`, `wallet.send(amount, proofs, ...)`) accept raw `number`. No conversion needed at input sites.

## Step 6 — `getDecodedToken` requires a second argument

```ts
getDecodedToken(token, keysetIds: string[])
```

The second argument is the list of keyset IDs the caller is willing to trust for V2 (Hashed) keysets. Pass `[]` if your application only handles standard hex (V1) keyset IDs (the universal default for current Cashu mints). For mints using v2 hashed keyset IDs you must obtain the IDs out-of-band first via `getTokenMetadata`.

```ts
// before
const decoded = getDecodedToken(token);

// after (safe for v1 hex keysets)
const decoded = getDecodedToken(token, []);
```

## Step 7 — `MintQuoteState` lives on the bolt11-specific response

`MintQuoteBaseResponse` is method-agnostic and does NOT carry `state`. Use the `Bolt11` variants (returned by `checkMintQuoteBolt11`) which extend the base with `state: MintQuoteState`. Same story for `fee_reserve` on melt — only present on `MeltQuoteBolt11Response`. Once you've completed Step 3 the typed return values flow correctly.

```ts
import { MintQuoteState } from "@cashu/cashu-ts";
const status = await wallet.checkMintQuoteBolt11(quote);
if (status.state === MintQuoteState.PAID) { ... }
```

## Step 8 — Add `await wallet.loadMint()` at every construction site

This is a runtime requirement TypeScript will not enforce. Audit every `new CashuWallet(...)` site and ensure `loadMint()` is awaited before any `keyChain.*`, `createMintQuoteBolt11`, `createMeltQuoteBolt11`, `checkProofsStates`, `receive`, `send`, etc. is called. Skip and the wallet's lazily-loaded mint info will be `undefined` and methods will throw.

```bash
# Find every construction site
grep -rn "new CashuWallet(" --include="*.ts" --include="*.tsx"
```

For wallets stored in React state via `setWallet` and only used later in handlers that already call `loadMint()`, the construction-site call may be skipped — but adding it is harmless and defensive.

## Step 9 — Update Jest mocks

Test mocks need three coordinated changes:

1. **Use the new export names** in `jest.mock` factories (`Mint`/`Wallet`, not `CashuMint`/`CashuWallet`).
2. **Rename method keys** to the `Bolt11` variants.
3. **Wrap keysets** as `keyChain: { getKeysets: ... }` (not `getKeySets:` at the top level).
4. **Add `loadMint`** to every mock wallet implementation, including per-test `mockImplementation` overrides.

```ts
// before
jest.mock("@cashu/cashu-ts", () => ({
  CashuMint: jest.fn().mockImplementation(() => ({})),
  CashuWallet: jest.fn().mockImplementation(() => ({
    createMeltQuote: mockCreateMeltQuote,
    getKeySets: mockGetKeySets,
    send: mockSend,
    meltProofs: mockMeltProofs,
  })),
}));

// after
jest.mock("@cashu/cashu-ts", () => ({
  Mint: jest.fn().mockImplementation(() => ({})),
  Wallet: jest.fn().mockImplementation(() => ({
    loadMint: jest.fn().mockResolvedValue(undefined),
    createMeltQuoteBolt11: mockCreateMeltQuote,
    keyChain: { getKeysets: mockGetKeySets },
    send: mockSend,
    meltProofsBolt11: mockMeltProofs,
  })),
}));
```

For tests that use auto-mocking (`jest.mock("@cashu/cashu-ts")` with no factory) plus `(CashuWallet as jest.Mock).mockImplementation(...)`, the alias trick from Step 1 means the local binding resolves to the auto-mock — only the method-name keys inside the implementation need updating.

### Number.prototype shim for Choice B test mocks

Test mocks return raw numbers for fields that are now `Amount`. Production code calls `.toNumber()` on them and explodes (`is not a function`). The cleanest fix is a one-line shim in `jest.setup.js` so raw numbers stay compatible:

```js
// jest.setup.js
if (!Number.prototype.toNumber) {
  Object.defineProperty(Number.prototype, "toNumber", {
    value: function () {
      return this.valueOf();
    },
    writable: true,
    configurable: true,
  });
}
```

This is test-scope only; production `Amount` objects bring their own `.toNumber()`. Without this shim you'd have to wrap every mock value in a fake `{ toNumber: () => N }`, which bloats fixtures.

## Step 10 — Validation order

1. `npx tsc --noEmit` — must reach exit 0 before running tests. Fix `Amount` boundary errors and method-rename leftovers first; these surface cleanly in tsc output.
2. `npx jest` — expect failures clustered in wallet UI tests if Step 9 wasn't applied. Compare pass count to your pre-migration baseline; the goal is zero new failures.
3. Restart the dev server and confirm the app compiles and serves a clean response. The dev server will catch missed `@noble/hashes` extension paths (Step 0) that tsc allows.

## What this migration does NOT cover

- Bolt12 helpers (`createMintQuoteBolt12`, `mintProofsBolt12`, etc.) — adopt as needed.
- Mint operation durability (timeouts, retries, failover, durable pending operations) — these are **enabled** by the v3+ rate-limit-aware retry primitives but require separate application-level work (typically a dedicated mint-retry-service).
- `OutputConfig` (4th arg to `wallet.send` / mint helpers) for advanced output shaping like P2PK locking — only needed if migrating away from the legacy `pubkey` config field.

## Quick reference: bulk sed bundle

For a typical mid-sized codebase the following sed bundle clears 80%+ of the breakage. Apply, then iterate on the residual tsc errors:

```bash
FILES=$(git ls-files '*.ts' '*.tsx')
for f in $FILES; do
  sed -i \
    -e 's|from "@noble/hashes/utils"|from "@noble/hashes/utils.js"|g' \
    -e 's|from "@cashu/crypto/modules/common"|from "@cashu/cashu-ts"|g' \
    -e 's/wallet\.createMintQuote(/wallet.createMintQuoteBolt11(/g' \
    -e 's/wallet\.checkMintQuote(/wallet.checkMintQuoteBolt11(/g' \
    -e 's/wallet\.mintProofs(/wallet.mintProofsBolt11(/g' \
    -e 's/wallet\.createMeltQuote(/wallet.createMeltQuoteBolt11(/g' \
    -e 's/wallet\.meltProofs(/wallet.meltProofsBolt11(/g' \
    -e 's/wallet?\.createMeltQuote(/wallet?.createMeltQuoteBolt11(/g' \
    -e 's/wallet\.getKeySets()/wallet.keyChain.getKeysets()/g' \
    -e 's/acc + p\.amount/acc + p.amount.toNumber()/g' \
    -e 's/acc + token\.amount/acc + token.amount.toNumber()/g' \
    -e 's/acc + current\.amount/acc + current.amount.toNumber()/g' \
    "$f"
done
```
