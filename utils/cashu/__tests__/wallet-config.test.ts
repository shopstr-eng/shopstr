import {
  addParsedMints,
  applyWalletConfigContent,
  buildWalletConfigV1,
  deriveCashuPubkey,
  extractMintsFromLegacy,
  generateCashuWalletKeypair,
  isLegacyWalletConfig,
  isWalletConfigV1,
  parseWalletConfigContent,
  updateLatestWalletKeypair,
} from "../wallet-config";

const CASHU_PRIVKEY = "1".repeat(64);
const CASHU_PUBKEY = deriveCashuPubkey(CASHU_PRIVKEY)!;
const OLD_CASHU_PRIVKEY = "2".repeat(64);
const OLD_CASHU_PUBKEY = deriveCashuPubkey(OLD_CASHU_PRIVKEY)!;
const NEW_CASHU_PRIVKEY = "3".repeat(64);
const NEW_CASHU_PUBKEY = deriveCashuPubkey(NEW_CASHU_PRIVKEY)!;

describe("wallet-config", () => {
  describe("isLegacyWalletConfig", () => {
    it("returns true for arrays", () => {
      expect(isLegacyWalletConfig([["mint", "https://a"]])).toBe(true);
    });

    it("returns false for v1 objects", () => {
      expect(
        isLegacyWalletConfig({
          version: 1,
          cashuPubkey: CASHU_PUBKEY,
          cashuPrivkey: CASHU_PRIVKEY,
          mints: [],
        })
      ).toBe(false);
    });
  });

  describe("isWalletConfigV1", () => {
    it("returns true when version is 1", () => {
      expect(
        isWalletConfigV1({
          version: 1,
          cashuPubkey: CASHU_PUBKEY,
          cashuPrivkey: CASHU_PRIVKEY,
          mints: [],
        })
      ).toBe(true);
    });

    it("returns false for legacy arrays", () => {
      expect(isWalletConfigV1([["mint", "https://a"]])).toBe(false);
    });
  });

  describe("extractMintsFromLegacy", () => {
    it("extracts mint URLs from mint tags", () => {
      expect(
        extractMintsFromLegacy([
          ["mint", "https://a"],
          ["mint", "https://b"],
          ["relay", "wss://relay.example"],
        ])
      ).toEqual(["https://a", "https://b"]);
    });

    it("ignores entries without a mint URL", () => {
      expect(extractMintsFromLegacy([["mint"], ["mint", ""]])).toEqual([""]);
    });
  });

  describe("parseWalletConfigContent", () => {
    it("parses legacy wallet config", () => {
      expect(
        parseWalletConfigContent([
          ["privkey", CASHU_PRIVKEY],
          ["mint", "https://a"],
          ["mint", "https://b"],
        ])
      ).toEqual({
        mints: ["https://a", "https://b"],
        cashuPrivkey: CASHU_PRIVKEY,
        cashuPubkey: CASHU_PUBKEY,
      });
    });

    it("parses v1 wallet config", () => {
      expect(
        parseWalletConfigContent({
          version: 1,
          cashuPubkey: CASHU_PUBKEY,
          cashuPrivkey: CASHU_PRIVKEY,
          mints: ["https://mint.example"],
        })
      ).toEqual({
        mints: ["https://mint.example"],
        cashuPubkey: CASHU_PUBKEY,
        cashuPrivkey: CASHU_PRIVKEY,
      });
    });

    it("derives a Cashu pubkey from official NIP-60 tuple content", () => {
      expect(
        parseWalletConfigContent([
          ["privkey", CASHU_PRIVKEY],
          ["mint", "https://mint.example"],
        ])
      ).toEqual({
        mints: ["https://mint.example"],
        cashuPrivkey: CASHU_PRIVKEY,
        cashuPubkey: CASHU_PUBKEY,
      });
    });

    it("returns empty mints for legacy config without mint tags", () => {
      expect(
        parseWalletConfigContent([["relay", "wss://relay.example"]])
      ).toEqual({ mints: [] });
    });

    it("returns keys with empty mints for v1 config", () => {
      expect(
        parseWalletConfigContent({
          version: 1,
          cashuPubkey: CASHU_PUBKEY,
          cashuPrivkey: CASHU_PRIVKEY,
          mints: [],
        })
      ).toEqual({
        mints: [],
        cashuPubkey: CASHU_PUBKEY,
        cashuPrivkey: CASHU_PRIVKEY,
      });
    });

    it("returns empty mints for unknown shapes", () => {
      expect(parseWalletConfigContent(null)).toEqual({ mints: [] });
      expect(parseWalletConfigContent({ version: 2 })).toEqual({ mints: [] });
    });
  });

  describe("addParsedMints", () => {
    it("dedupes and preserves order", () => {
      const mintSet = new Set<string>();
      const mints: string[] = [];

      addParsedMints({ mints: ["https://a", "https://b"] }, mintSet, mints);
      addParsedMints({ mints: ["https://b", "https://c"] }, mintSet, mints);

      expect(mints).toEqual(["https://a", "https://b", "https://c"]);
    });
  });

  describe("updateLatestWalletKeypair", () => {
    it("selects keypair from newest v1 event by created_at", () => {
      const older = updateLatestWalletKeypair(null, 100, {
        mints: ["https://old"],
        cashuPubkey: OLD_CASHU_PUBKEY,
        cashuPrivkey: OLD_CASHU_PRIVKEY,
      });
      const newer = updateLatestWalletKeypair(older, 200, {
        mints: ["https://new"],
        cashuPubkey: NEW_CASHU_PUBKEY,
        cashuPrivkey: NEW_CASHU_PRIVKEY,
      });
      const ignored = updateLatestWalletKeypair(newer, 150, {
        mints: ["https://ignored"],
        cashuPubkey: CASHU_PUBKEY,
        cashuPrivkey: CASHU_PRIVKEY,
      });

      expect(ignored).toEqual({
        createdAt: 200,
        cashuPubkey: NEW_CASHU_PUBKEY,
        cashuPrivkey: NEW_CASHU_PRIVKEY,
      });
    });

    it("ignores configs without a cashuPubkey", () => {
      expect(
        updateLatestWalletKeypair(null, 100, {
          mints: ["https://a"],
        })
      ).toBeNull();
    });
  });

  describe("applyWalletConfigContent", () => {
    it("merges mints and tracks newest v1 keypair", () => {
      const mintSet = new Set<string>();
      const mints: string[] = [];
      let latest = applyWalletConfigContent(
        JSON.stringify([["mint", "https://legacy"]]),
        50,
        mintSet,
        mints,
        null
      );
      latest = applyWalletConfigContent(
        JSON.stringify({
          version: 1,
          cashuPubkey: OLD_CASHU_PUBKEY,
          cashuPrivkey: OLD_CASHU_PRIVKEY,
          mints: ["https://old"],
        }),
        100,
        mintSet,
        mints,
        latest
      );
      latest = applyWalletConfigContent(
        JSON.stringify({
          version: 1,
          cashuPubkey: NEW_CASHU_PUBKEY,
          cashuPrivkey: NEW_CASHU_PRIVKEY,
          mints: ["https://new", "https://legacy"],
        }),
        200,
        mintSet,
        mints,
        latest
      );

      expect(mints).toEqual(["https://legacy", "https://old", "https://new"]);
      expect(latest).toEqual({
        createdAt: 200,
        cashuPubkey: NEW_CASHU_PUBKEY,
        cashuPrivkey: NEW_CASHU_PRIVKEY,
      });
    });
  });

  describe("generateCashuWalletKeypair", () => {
    it("derives a public key and hex private key from a fresh secret", () => {
      const { cashuPubkey, cashuPrivkey } = generateCashuWalletKeypair();

      expect(typeof cashuPubkey).toBe("string");
      expect(cashuPubkey).toMatch(/^[0-9a-f]{64}$/);
      expect(cashuPrivkey).toMatch(/^[0-9a-f]{64}$/);
    });

    it("generates a distinct keypair on each call", () => {
      const first = generateCashuWalletKeypair();
      const second = generateCashuWalletKeypair();

      expect(first.cashuPrivkey).not.toBe(second.cashuPrivkey);
      expect(first.cashuPubkey).not.toBe(second.cashuPubkey);
    });
  });

  describe("buildWalletConfigV1", () => {
    it("builds an official NIP-60 tuple wallet config payload", () => {
      expect(
        buildWalletConfigV1(CASHU_PRIVKEY, ["https://mint.example"])
      ).toEqual([
        ["privkey", CASHU_PRIVKEY],
        ["mint", "https://mint.example"],
      ]);
    });
  });
});
