import {
  addParsedMints,
  applyWalletConfigContent,
  buildWalletConfigV1,
  extractMintsFromLegacy,
  generateCashuWalletKeypair,
  isLegacyWalletConfig,
  isWalletConfigV1,
  parseWalletConfigContent,
  updateLatestWalletKeypair,
} from "../wallet-config";

describe("wallet-config", () => {
  describe("isLegacyWalletConfig", () => {
    it("returns true for arrays", () => {
      expect(isLegacyWalletConfig([["mint", "https://a"]])).toBe(true);
    });

    it("returns false for v1 objects", () => {
      expect(
        isLegacyWalletConfig({
          version: 1,
          cashuPubkey: "pk",
          cashuPrivkey: "sk",
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
          cashuPubkey: "pk",
          cashuPrivkey: "sk",
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
          ["mint", "https://a"],
          ["mint", "https://b"],
        ])
      ).toEqual({
        mints: ["https://a", "https://b"],
      });
    });

    it("parses v1 wallet config", () => {
      expect(
        parseWalletConfigContent({
          version: 1,
          cashuPubkey: "02abc",
          cashuPrivkey: "deadbeef",
          mints: ["https://mint.example"],
        })
      ).toEqual({
        mints: ["https://mint.example"],
        cashuPubkey: "02abc",
        cashuPrivkey: "deadbeef",
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
          cashuPubkey: "02abc",
          cashuPrivkey: "deadbeef",
          mints: [],
        })
      ).toEqual({
        mints: [],
        cashuPubkey: "02abc",
        cashuPrivkey: "deadbeef",
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
        cashuPubkey: "old-pk",
        cashuPrivkey: "old-sk",
      });
      const newer = updateLatestWalletKeypair(older, 200, {
        mints: ["https://new"],
        cashuPubkey: "new-pk",
        cashuPrivkey: "new-sk",
      });
      const ignored = updateLatestWalletKeypair(newer, 150, {
        mints: ["https://ignored"],
        cashuPubkey: "ignored-pk",
        cashuPrivkey: "ignored-sk",
      });

      expect(ignored).toEqual({
        createdAt: 200,
        cashuPubkey: "new-pk",
        cashuPrivkey: "new-sk",
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
          cashuPubkey: "old-pk",
          cashuPrivkey: "old-sk",
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
          cashuPubkey: "new-pk",
          cashuPrivkey: "new-sk",
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
        cashuPubkey: "new-pk",
        cashuPrivkey: "new-sk",
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
    it("builds a versioned wallet config payload", () => {
      expect(
        buildWalletConfigV1("02abc", "deadbeef", ["https://mint.example"])
      ).toEqual({
        version: 1,
        cashuPubkey: "02abc",
        cashuPrivkey: "deadbeef",
        mints: ["https://mint.example"],
      });
    });
  });
});
