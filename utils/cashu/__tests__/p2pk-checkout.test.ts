import {
  buildP2pkOutputConfig,
  checkMintP2pkSupport,
  getBuyerReclaimKeys,
  getP2pkCheckoutPolicyError,
  mintInfoSupportsP2pk,
  parseP2PK,
  parseP2PKProofSet,
  pubkeysEqual,
} from "../p2pk-checkout";

const BUYER_CASHU_PUBKEY = "a".repeat(64);
const BUYER_EXTRA_RECLAIM_KEY = `03${"b".repeat(64)}`;
const NORMALIZED_BUYER_EXTRA_RECLAIM_KEY = "b".repeat(64);
const BUYER_NOSTR_PUBKEY = "c".repeat(64);
const SELLER_CASHU_PUBKEY = `02${"d".repeat(64)}`;
const NORMALIZED_SELLER_CASHU_PUBKEY = "d".repeat(64);

const buyerContent = (reclaimKeys?: string[]) =>
  ({
    p2pk: reclaimKeys ? { enabled: false, reclaimKeys } : undefined,
  }) as any;

const sellerP2pk = {
  enabled: true,
  pubkey: SELLER_CASHU_PUBKEY,
  refundDelayDays: 7,
};

const buildP2pkProof = ({
  pubkey = SELLER_CASHU_PUBKEY,
  locktime = Math.floor(Date.now() / 1000) + 60,
  refundKeys = [BUYER_CASHU_PUBKEY],
  id = "proof-id",
}: {
  pubkey?: string;
  locktime?: number;
  refundKeys?: string[];
  id?: string;
} = {}) =>
  ({
    id,
    amount: 1,
    C: `02${"e".repeat(64)}`,
    secret: JSON.stringify([
      "P2PK",
      {
        nonce: id,
        data: pubkey,
        tags: [
          ["locktime", locktime.toString()],
          ["refund", ...refundKeys],
        ],
      },
    ]),
  }) as any;

describe("p2pk-checkout", () => {
  const envBackup = process.env;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...envBackup };
  });

  afterAll(() => {
    process.env = envBackup;
  });

  describe("getBuyerReclaimKeys", () => {
    it("defaults to the buyer Cashu pubkey when no profile reclaim keys are set", () => {
      expect(getBuyerReclaimKeys(undefined, BUYER_CASHU_PUBKEY)).toEqual([
        BUYER_CASHU_PUBKEY,
      ]);
    });

    it("adds the buyer Cashu pubkey to profile reclaim keys when missing", () => {
      expect(
        getBuyerReclaimKeys(
          buyerContent([BUYER_EXTRA_RECLAIM_KEY]),
          BUYER_CASHU_PUBKEY
        )
      ).toEqual([NORMALIZED_BUYER_EXTRA_RECLAIM_KEY, BUYER_CASHU_PUBKEY]);
    });

    it("preserves profile reclaim keys when they already include the buyer Cashu pubkey", () => {
      const reclaimKeys = [BUYER_EXTRA_RECLAIM_KEY, BUYER_CASHU_PUBKEY];

      expect(
        getBuyerReclaimKeys(buyerContent(reclaimKeys), BUYER_CASHU_PUBKEY)
      ).toEqual([NORMALIZED_BUYER_EXTRA_RECLAIM_KEY, BUYER_CASHU_PUBKEY]);
    });

    it("fails safely when the buyer Cashu pubkey is missing", () => {
      expect(getBuyerReclaimKeys(buyerContent([BUYER_EXTRA_RECLAIM_KEY]))).toBe(
        null
      );
    });

    it("fails safely when an advanced reclaim key is not Cashu-compatible", () => {
      expect(
        getBuyerReclaimKeys(buyerContent(["not-a-key"]), BUYER_CASHU_PUBKEY)
      ).toBe(null);
    });
  });

  describe("buildP2pkOutputConfig", () => {
    it("returns undefined when seller escrow is active but the buyer Cashu pubkey is missing", () => {
      expect(buildP2pkOutputConfig(sellerP2pk, undefined)).toBeUndefined();
    });

    it("uses the seller profile pubkey as the locked redeem path", () => {
      const outputConfig = buildP2pkOutputConfig(
        sellerP2pk,
        undefined,
        BUYER_CASHU_PUBKEY
      );

      expect(outputConfig?.send.options.pubkey).toBe(
        NORMALIZED_SELLER_CASHU_PUBKEY
      );
    });

    it("sets refundKeys from profile reclaim keys plus the buyer Cashu pubkey", () => {
      const outputConfig = buildP2pkOutputConfig(
        sellerP2pk,
        buyerContent([BUYER_EXTRA_RECLAIM_KEY]),
        BUYER_CASHU_PUBKEY
      );

      expect(outputConfig?.send.options.refundKeys).toEqual([
        NORMALIZED_BUYER_EXTRA_RECLAIM_KEY,
        BUYER_CASHU_PUBKEY,
      ]);
    });

    it("does not fall back to the buyer Nostr pubkey", () => {
      const outputConfig = buildP2pkOutputConfig(
        sellerP2pk,
        buyerContent(),
        BUYER_CASHU_PUBKEY
      );

      expect(outputConfig?.send.options.refundKeys).toEqual([
        BUYER_CASHU_PUBKEY,
      ]);
      expect(outputConfig?.send.options.refundKeys).not.toContain(
        BUYER_NOSTR_PUBKEY
      );
    });
  });

  describe("checkout policy and mint support", () => {
    it("blocks escrow checkout unless the feature flag is enabled", () => {
      expect(getP2pkCheckoutPolicyError(sellerP2pk, 10)).toBe(
        "P2PK escrow checkout is not enabled for this deployment."
      );
    });

    it("enforces the real-money test cap when enabled", () => {
      process.env.NEXT_PUBLIC_P2PK_ESCROW_ENABLED = "true";

      expect(getP2pkCheckoutPolicyError(sellerP2pk, 100)).toBeNull();
      expect(getP2pkCheckoutPolicyError(sellerP2pk, 101)).toBe(
        "P2PK escrow test checkout is limited to 100 sats."
      );
    });

    it("detects NUT-10 and NUT-11 support from NUT-06 mint info", () => {
      expect(
        mintInfoSupportsP2pk({
          nuts: {
            "10": { supported: true },
            "11": { supported: true },
          },
        })
      ).toBe(true);

      expect(
        mintInfoSupportsP2pk({ nuts: { "10": { supported: true } } })
      ).toBe(false);
      expect(mintInfoSupportsP2pk({})).toBe(false);
    });

    it("fails closed for unreachable mint info", async () => {
      const fetchImpl = jest.fn().mockRejectedValue(new Error("offline"));

      await expect(
        checkMintP2pkSupport("https://mint.example", fetchImpl)
      ).resolves.toEqual({
        supported: false,
        reason: "Could not verify mint P2PK support.",
      });
    });

    it("fails closed for malformed or unsupported mint info", async () => {
      const malformedFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ nuts: { "10": { supported: true } } }),
      });

      await expect(
        checkMintP2pkSupport("https://mint.example/", malformedFetch)
      ).resolves.toEqual({
        supported: false,
        reason:
          "This mint does not advertise NUT-10 and NUT-11 support, so escrow checkout is blocked.",
      });
      expect(malformedFetch).toHaveBeenCalledWith(
        "https://mint.example/v1/info"
      );
    });

    it("allows mints that advertise both required NUTs", async () => {
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          nuts: {
            "10": { supported: true },
            "11": { supported: true },
          },
        }),
      });

      await expect(
        checkMintP2pkSupport("https://mint.example", fetchImpl)
      ).resolves.toEqual({
        supported: true,
      });
    });
  });

  describe("P2PK parsing", () => {
    it("parses every refund value in a refund tag and normalizes keys", () => {
      const parsed = parseP2PK(
        buildP2pkProof({
          refundKeys: [BUYER_EXTRA_RECLAIM_KEY, BUYER_CASHU_PUBKEY],
        })
      );

      expect(parsed?.pubkey).toBe(NORMALIZED_SELLER_CASHU_PUBKEY);
      expect(parsed?.refundKeys).toEqual([
        NORMALIZED_BUYER_EXTRA_RECLAIM_KEY,
        BUYER_CASHU_PUBKEY,
      ]);
    });

    it("compares x-only and compressed pubkeys consistently", () => {
      expect(
        pubkeysEqual(
          BUYER_EXTRA_RECLAIM_KEY,
          NORMALIZED_BUYER_EXTRA_RECLAIM_KEY
        )
      ).toBe(true);
    });

    it("parses a consistent all-P2PK proof set", () => {
      const locktime = Math.floor(Date.now() / 1000) + 60;
      const result = parseP2PKProofSet([
        buildP2pkProof({ id: "one", locktime }),
        buildP2pkProof({ id: "two", locktime }),
      ]);

      expect(result.invalidReason).toBeUndefined();
      expect(result.p2pk?.proofCount).toBe(2);
    });

    it("rejects mixed P2PK and plain proof sets", () => {
      const result = parseP2PKProofSet([
        buildP2pkProof(),
        { id: "plain", amount: 1, secret: "plain-secret", C: "C" } as any,
      ]);

      expect(result).toEqual({
        p2pk: null,
        invalidReason: "Token mixes P2PK and non-P2PK proofs.",
      });
    });

    it("rejects inconsistent P2PK proof sets", () => {
      const result = parseP2PKProofSet([
        buildP2pkProof({ locktime: 100 }),
        buildP2pkProof({ locktime: 200, id: "second" }),
      ]);

      expect(result).toEqual({
        p2pk: null,
        invalidReason: "Token contains inconsistent P2PK proof locks.",
      });
    });
  });
});
