/**
 * Cashu library API contract test for the wallet Send / Mint flows.
 *
 * WHY THIS EXISTS
 * The send-button and mint-button behavioral tests mock `@cashu/cashu-ts`
 * entirely, so they keep passing even when a library upgrade renames or
 * removes a method the real flows call. That is exactly how the
 * `loadMint` / `createMintQuoteBolt11` / `checkMintQuoteBolt11` /
 * `mintProofsBolt11` drift slipped through to runtime ("loadMint is not a
 * function") instead of being caught by the suite.
 *
 * This file imports the REAL library (no jest.mock) and asserts that every
 * method the Send and Mint flows depend on still exists with the expected
 * shape. If a future `@cashu/cashu-ts` upgrade changes the API, this test
 * turns red before users hit a broken Send/Mint button.
 *
 * It does NOT hit the network: it only inspects constructors and prototypes.
 * When this test fails, update the corresponding wallet component/util to the
 * new API AND update the mocks in send-button.test.tsx / mint-button.test.tsx.
 */
import {
  Mint as CashuMint,
  Wallet as CashuWallet,
  KeyChain,
  getEncodedToken,
} from "@cashu/cashu-ts";

const isFunction = (value: unknown): boolean => typeof value === "function";

const hasPrototypeMethod = (ctor: unknown, name: string): boolean =>
  isFunction(ctor) &&
  isFunction(
    (ctor as { prototype: Record<string, unknown> }).prototype?.[name]
  );

describe("@cashu/cashu-ts API contract (wallet Send/Mint flows)", () => {
  it("exports the constructors and helpers the wallet flows import", () => {
    // send-button.tsx + mint-button.tsx: `new CashuMint(url)` / `new CashuWallet(mint)`.
    expect(isFunction(CashuMint)).toBe(true);
    expect(isFunction(CashuWallet)).toBe(true);
    // send-button.tsx: encodes the outgoing token with `getEncodedToken(...)`.
    expect(isFunction(getEncodedToken)).toBe(true);
    // send-button.tsx reads `wallet.keyChain.getKeysets()` — KeyChain is the
    // type behind that getter.
    expect(isFunction(KeyChain)).toBe(true);
  });

  it("Mint and Wallet can be constructed offline (constructor signature)", () => {
    // Catches a constructor-signature change. Construction must not require a
    // network round-trip — only `loadMint()` does.
    const mintUrl = "https://mint.example.test";
    const mint = new CashuMint(mintUrl);
    expect(mint).toBeInstanceOf(CashuMint);
    const wallet = new CashuWallet(mint);
    expect(wallet).toBeInstanceOf(CashuWallet);
  });

  describe("Wallet methods the Send flow depends on", () => {
    // send-button.tsx (directly) + utils/cashu/swap-retry-service.ts (safeSwap).
    it.each([
      ["loadMint", "send-button: await wallet.loadMint()"],
      ["send", "safeSwap: wallet.send(...) — the swap that funds the token"],
      [
        "checkProofsStates",
        "safeSwap recovery: wallet.checkProofsStates(...) after a failed swap",
      ],
    ])("Wallet.prototype.%s exists (%s)", (method) => {
      expect(hasPrototypeMethod(CashuWallet, method)).toBe(true);
    });

    it("Wallet exposes the `keyChain` accessor used to read keysets", () => {
      // send-button.tsx: `wallet.keyChain.getKeysets()`.
      const descriptor = Object.getOwnPropertyDescriptor(
        CashuWallet.prototype,
        "keyChain"
      );
      expect(descriptor).toBeDefined();
      expect(isFunction(descriptor?.get)).toBe(true);
    });

    it("KeyChain.prototype.getKeysets exists", () => {
      // send-button.tsx: `wallet.keyChain.getKeysets()` returns the keysets it
      // filters owned proofs against.
      expect(hasPrototypeMethod(KeyChain, "getKeysets")).toBe(true);
    });
  });

  describe("Wallet methods the Mint flow depends on", () => {
    // mint-button.tsx invoiceHasBeenPaid + handleMint.
    it.each([
      ["loadMint", "mint-button: await wallet.loadMint()"],
      ["createMintQuoteBolt11", "mint-button: create the Lightning invoice"],
      ["checkMintQuoteBolt11", "mint-button: poll the invoice payment state"],
      ["mintProofsBolt11", "mint-button: claim the proofs once paid"],
    ])("Wallet.prototype.%s exists (%s)", (method) => {
      expect(hasPrototypeMethod(CashuWallet, method)).toBe(true);
    });
  });
});
