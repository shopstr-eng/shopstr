---
name: Cashu/wallet library API-drift guardrail
description: Why mocked Send/Mint tests can't catch @cashu/cashu-ts upgrades, and the contract test that does
---

The send-button/mint-button Jest suites mock `@cashu/cashu-ts` entirely, so a
library upgrade that renames or removes a Wallet method keeps those suites GREEN
while the real flows break at runtime (e.g. "loadMint is not a function" after
methods drifted to `loadMint` + the `*Bolt11` names). tsc does NOT catch this for
the mocks because mock objects are `jest.fn()` cast through `any`.

**Rule:** keep a contract test that imports the REAL library (no `jest.mock`) and
asserts every Wallet/Mint/KeyChain method + top-level export the Send/Mint flows
depend on still exists (prototype methods, `keyChain` getter, offline
constructability). It lives in `components/wallet/__tests__/cashu-api-contract.test.ts`.

**Why:** mocked behavioral tests verify our logic but are blind to upstream API
drift; the contract test is the only thing that fails fast on a bad upgrade.

**How to apply:** on any `@cashu/cashu-ts` (or wallet-lib) bump, run the contract
test. If it goes red, update the wallet component/util to the new API AND update
the mocks in send-button.test.tsx / mint-button.test.tsx in the same change. If a
Send/Mint flow starts calling a new library method, add it to the contract test.
The methods currently guarded: loadMint, send, checkProofsStates,
createMintQuoteBolt11, checkMintQuoteBolt11, mintProofsBolt11, the keyChain
getter, KeyChain.getKeysets, and getEncodedToken.
