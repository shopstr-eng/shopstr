import {
  buildP2pkOutputConfig,
  checkMintP2pkSupport,
  getArbiterPubkey,
  getBuyerReclaimKeys,
  getP2pkCheckoutPolicyError,
  isP2pkMintAllowlistConfigured,
  isP2pkMintAllowed,
  mintInfoSupportsP2pk,
  mintKeysetsHaveZeroInputFees,
  parseP2PK,
  parseP2PKProofSet,
  pubkeysEqual,
  resolveP2pkCheckoutOutputConfig,
} from "../p2pk-checkout";
import * as p2pkCheckout from "../p2pk-checkout";

const BUYER_CASHU_PUBKEY = "a".repeat(64);
const BUYER_EXTRA_RECLAIM_KEY = `03${"b".repeat(64)}`;
const NORMALIZED_BUYER_EXTRA_RECLAIM_KEY = "b".repeat(64);
const BUYER_NOSTR_PUBKEY = "c".repeat(64);
const SELLER_CASHU_PUBKEY = `02${"d".repeat(64)}`;
const NORMALIZED_SELLER_CASHU_PUBKEY = "d".repeat(64);
const ARBITER_CASHU_PUBKEY = `03${"f".repeat(64)}`;
const NORMALIZED_ARBITER_CASHU_PUBKEY = "f".repeat(64);

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
  pubkeys,
  nSigs,
  shopstrOrderId,
  id = "proof-id",
}: {
  pubkey?: string;
  locktime?: number;
  refundKeys?: string[];
  pubkeys?: string[];
  nSigs?: number;
  shopstrOrderId?: string;
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
          ...(pubkeys ? [["pubkeys", ...pubkeys]] : []),
          ...(nSigs !== undefined ? [["n_sigs", nSigs.toString()]] : []),
          ...(shopstrOrderId ? [["shopstr_order", shopstrOrderId]] : []),
        ],
      },
    ]),
  }) as any;

describe("p2pk-checkout", () => {
  const envBackup = process.env;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = {
      ...envBackup,
      NEXT_PUBLIC_ARBITER_PUBKEY: ARBITER_CASHU_PUBKEY,
    };
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

    it("returns undefined when the arbiter pubkey is not configured", () => {
      delete process.env.NEXT_PUBLIC_ARBITER_PUBKEY;

      expect(
        buildP2pkOutputConfig(sellerP2pk, undefined, BUYER_CASHU_PUBKEY)
      ).toBeUndefined();
    });

    it("uses the seller profile pubkey as the primary locked redeem path", () => {
      const outputConfig = buildP2pkOutputConfig(
        sellerP2pk,
        undefined,
        BUYER_CASHU_PUBKEY
      );

      expect(outputConfig?.send.options.pubkey[0]).toBe(
        NORMALIZED_SELLER_CASHU_PUBKEY
      );
    });

    it("builds cashu-ts 2-of-3 lock options for seller, buyer, and arbiter", () => {
      const outputConfig = buildP2pkOutputConfig(
        sellerP2pk,
        undefined,
        BUYER_CASHU_PUBKEY
      );

      expect(outputConfig?.send.options.pubkey).toEqual([
        NORMALIZED_SELLER_CASHU_PUBKEY,
        BUYER_CASHU_PUBKEY,
        NORMALIZED_ARBITER_CASHU_PUBKEY,
      ]);
      expect(outputConfig?.send.options.requiredSignatures).toBe(2);
    });

    it("binds new escrow proofs to the checkout order id", () => {
      const outputConfig = buildP2pkOutputConfig(
        sellerP2pk,
        undefined,
        BUYER_CASHU_PUBKEY,
        "order-1"
      );

      expect(outputConfig?.send.options.additionalTags).toEqual([
        ["shopstr_order", "order-1"],
      ]);
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

    it("allows P2PK mints by default when no allowlist is configured", () => {
      expect(isP2pkMintAllowlistConfigured()).toBe(false);
      expect(isP2pkMintAllowed("https://mint.example")).toBe(true);
    });

    it("restricts P2PK mints when an allowlist is configured", () => {
      process.env.NEXT_PUBLIC_P2PK_ESCROW_ALLOWED_MINTS =
        "https://cashu.example.com, https://mint.example/path/";

      expect(isP2pkMintAllowlistConfigured()).toBe(true);
      expect(isP2pkMintAllowed("https://cashu.example.com/")).toBe(true);
      expect(isP2pkMintAllowed("https://mint.example/path")).toBe(true);
      expect(isP2pkMintAllowed("https://other.example")).toBe(false);
    });

    it("fails closed when the P2PK mint allowlist is configured but invalid", () => {
      process.env.NEXT_PUBLIC_P2PK_ESCROW_ALLOWED_MINTS = "not-a-url";

      expect(isP2pkMintAllowed("https://cashu.example.com")).toBe(false);
    });

    it("detects nonzero input fees from mint keysets", () => {
      expect(
        mintKeysetsHaveZeroInputFees({
          keysets: [
            { id: "00", unit: "sat", active: true, input_fee_ppk: 0 },
            { id: "01", unit: "sat", active: true },
          ],
        })
      ).toBe(true);

      expect(
        mintKeysetsHaveZeroInputFees({
          keysets: [
            { id: "00", unit: "sat", active: true, input_fee_ppk: 0 },
            { id: "01", unit: "sat", active: true, input_fee_ppk: 100 },
          ],
        })
      ).toBe(false);
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

    it("fails closed when keysets cannot be checked for input fees", async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            nuts: {
              "10": { supported: true },
              "11": { supported: true },
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({}),
        });

      await expect(
        checkMintP2pkSupport("https://mint.example", fetchImpl)
      ).resolves.toEqual({
        supported: false,
        reason: "Could not verify mint input fees.",
      });
    });

    it("blocks P2PK escrow on mints with nonzero input fees", async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            nuts: {
              "10": { supported: true },
              "11": { supported: true },
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            keysets: [
              { id: "00", unit: "sat", active: true, input_fee_ppk: 100 },
            ],
          }),
        });

      await expect(
        checkMintP2pkSupport("https://mint.example", fetchImpl)
      ).resolves.toEqual({
        supported: false,
        reason:
          "This mint charges input fees, so P2PK escrow checkout is blocked for now.",
      });
    });

    it("allows mints that advertise both required NUTs", async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            nuts: {
              "10": { supported: true },
              "11": { supported: true },
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            keysets: [
              { id: "00", unit: "sat", active: true, input_fee_ppk: 0 },
            ],
          }),
        });

      await expect(
        checkMintP2pkSupport("https://mint.example", fetchImpl)
      ).resolves.toEqual({
        supported: true,
      });
    });
  });

  describe("resolveP2pkCheckoutOutputConfig", () => {
    const goodMintFetch = () =>
      jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            nuts: {
              "10": { supported: true },
              "11": { supported: true },
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            keysets: [
              { id: "00", unit: "sat", active: true, input_fee_ppk: 0 },
            ],
          }),
        });

    it("returns undefined when the seller has not enabled escrow", async () => {
      await expect(
        resolveP2pkCheckoutOutputConfig({
          sellerP2pk: undefined,
          amountSats: 10,
          mintUrl: "https://mint.example",
          buyerContent: undefined,
          buyerCashuPubkey: BUYER_CASHU_PUBKEY,
        })
      ).resolves.toBeUndefined();
    });

    it("throws when the feature flag is disabled", async () => {
      await expect(
        resolveP2pkCheckoutOutputConfig({
          sellerP2pk,
          amountSats: 10,
          mintUrl: "https://mint.example",
          buyerContent: undefined,
          buyerCashuPubkey: BUYER_CASHU_PUBKEY,
        })
      ).rejects.toThrow(
        "P2PK escrow checkout is not enabled for this deployment."
      );
    });

    it("enforces the amount cap before touching the mint", async () => {
      process.env.NEXT_PUBLIC_P2PK_ESCROW_ENABLED = "true";
      const fetchImpl = jest.fn();

      await expect(
        resolveP2pkCheckoutOutputConfig({
          sellerP2pk,
          amountSats: 101,
          mintUrl: "https://mint.example",
          buyerContent: undefined,
          buyerCashuPubkey: BUYER_CASHU_PUBKEY,
          fetchImpl,
        })
      ).rejects.toThrow("P2PK escrow test checkout is limited to 100 sats.");
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("requires a mint when escrow is active", async () => {
      process.env.NEXT_PUBLIC_P2PK_ESCROW_ENABLED = "true";

      await expect(
        resolveP2pkCheckoutOutputConfig({
          sellerP2pk,
          amountSats: 10,
          mintUrl: undefined,
          buyerContent: undefined,
          buyerCashuPubkey: BUYER_CASHU_PUBKEY,
        })
      ).rejects.toThrow("A Cashu mint is required for escrow checkout.");
    });

    it("propagates the mint-support failure reason", async () => {
      process.env.NEXT_PUBLIC_P2PK_ESCROW_ENABLED = "true";
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ nuts: { "10": { supported: true } } }),
      });

      await expect(
        resolveP2pkCheckoutOutputConfig({
          sellerP2pk,
          amountSats: 10,
          mintUrl: "https://mint.example",
          buyerContent: undefined,
          buyerCashuPubkey: BUYER_CASHU_PUBKEY,
          fetchImpl,
        })
      ).rejects.toThrow(
        "This mint does not advertise NUT-10 and NUT-11 support, so escrow checkout is blocked."
      );
    });

    it("requires the buyer's Cashu wallet identity", async () => {
      process.env.NEXT_PUBLIC_P2PK_ESCROW_ENABLED = "true";

      await expect(
        resolveP2pkCheckoutOutputConfig({
          sellerP2pk,
          amountSats: 10,
          mintUrl: "https://mint.example",
          buyerContent: undefined,
          buyerCashuPubkey: undefined,
          fetchImpl: goodMintFetch(),
        })
      ).rejects.toThrow(
        "A Cashu wallet identity is required to pay for an escrow listing. Please wait for your wallet to finish loading and try again."
      );
    });

    it("returns the P2PK output config when every gate passes", async () => {
      process.env.NEXT_PUBLIC_P2PK_ESCROW_ENABLED = "true";

      await expect(
        resolveP2pkCheckoutOutputConfig({
          sellerP2pk,
          amountSats: 10,
          mintUrl: "https://mint.example",
          buyerContent: undefined,
          buyerCashuPubkey: BUYER_CASHU_PUBKEY,
          fetchImpl: goodMintFetch(),
        })
      ).resolves.toEqual({
        send: {
          type: "p2pk",
          options: expect.objectContaining({
            pubkey: [
              NORMALIZED_SELLER_CASHU_PUBKEY,
              BUYER_CASHU_PUBKEY,
              NORMALIZED_ARBITER_CASHU_PUBKEY,
            ],
            requiredSignatures: 2,
            refundKeys: [BUYER_CASHU_PUBKEY],
          }),
        },
      });
    });

    it("fails with an explicit arbiter-not-configured error when escrow is active but the arbiter pubkey is not configured", async () => {
      process.env.NEXT_PUBLIC_P2PK_ESCROW_ENABLED = "true";
      delete process.env.NEXT_PUBLIC_ARBITER_PUBKEY;

      await expect(
        resolveP2pkCheckoutOutputConfig({
          sellerP2pk,
          amountSats: 10,
          mintUrl: "https://mint.example",
          buyerContent: undefined,
          buyerCashuPubkey: BUYER_CASHU_PUBKEY,
          fetchImpl: goodMintFetch(),
        })
      ).rejects.toThrow(
        "Escrow checkout is unavailable: the dispute arbiter is not configured on this server. Please contact the marketplace operator."
      );
    });
  });

  describe("resolveSellerCheckoutProfile", () => {
    it("loads the seller profile at payment time when the in-memory profile map missed it", async () => {
      const fetchedProfile = {
        pubkey: BUYER_NOSTR_PUBKEY,
        content: {
          payment_preference: "ecash",
          p2pk: sellerP2pk,
        },
        created_at: 123,
      };
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ profile: fetchedProfile }),
      });

      const resolveSellerCheckoutProfile = (
        p2pkCheckout as unknown as {
          resolveSellerCheckoutProfile: (params: {
            sellerPubkey: string;
            cachedProfile?: unknown;
            fetchImpl: typeof fetch;
          }) => Promise<unknown>;
        }
      ).resolveSellerCheckoutProfile;

      await expect(
        resolveSellerCheckoutProfile({
          sellerPubkey: BUYER_NOSTR_PUBKEY,
          cachedProfile: undefined,
          fetchImpl,
        })
      ).resolves.toEqual(fetchedProfile);
      expect(fetchImpl).toHaveBeenCalledWith(
        `/api/db/fetch-profile?pubkey=${BUYER_NOSTR_PUBKEY}`
      );
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

    it("leaves pubkeys and nSigs undefined for legacy single-key proofs", () => {
      const parsed = parseP2PK(buildP2pkProof());

      expect(parsed?.pubkeys).toBeUndefined();
      expect(parsed?.nSigs).toBeUndefined();
    });

    it("parses the pubkeys and n_sigs tags from a 2-of-3 multisig proof", () => {
      const parsed = parseP2PK(
        buildP2pkProof({
          pubkeys: [BUYER_CASHU_PUBKEY, ARBITER_CASHU_PUBKEY],
          nSigs: 2,
        })
      );

      expect(parsed?.pubkey).toBe(NORMALIZED_SELLER_CASHU_PUBKEY);
      expect(parsed?.pubkeys).toEqual([
        BUYER_CASHU_PUBKEY,
        NORMALIZED_ARBITER_CASHU_PUBKEY,
      ]);
      expect(parsed?.nSigs).toBe(2);
    });

    it("parses the Shopstr order binding tag from P2PK proofs", () => {
      const parsed = parseP2PK(buildP2pkProof({ shopstrOrderId: "order-1" }));

      expect(parsed?.shopstrOrderId).toBe("order-1");
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

    it("rejects proof sets that mix different Shopstr order bindings", () => {
      const locktime = Math.floor(Date.now() / 1000) + 60;
      const result = parseP2PKProofSet([
        buildP2pkProof({ id: "one", locktime, shopstrOrderId: "order-1" }),
        buildP2pkProof({ id: "two", locktime, shopstrOrderId: "order-2" }),
      ]);

      expect(result).toEqual({
        p2pk: null,
        invalidReason: "Token contains inconsistent P2PK proof locks.",
      });
    });

    it("parses a consistent 2-of-3 multisig proof set", () => {
      const locktime = Math.floor(Date.now() / 1000) + 60;
      const multisigProof = (id: string) =>
        buildP2pkProof({
          id,
          locktime,
          pubkeys: [BUYER_CASHU_PUBKEY, ARBITER_CASHU_PUBKEY],
          nSigs: 2,
        });

      const result = parseP2PKProofSet([
        multisigProof("one"),
        multisigProof("two"),
      ]);

      expect(result.invalidReason).toBeUndefined();
      expect(result.p2pk?.pubkeys).toEqual([
        BUYER_CASHU_PUBKEY,
        NORMALIZED_ARBITER_CASHU_PUBKEY,
      ]);
      expect(result.p2pk?.nSigs).toBe(2);
      expect(result.p2pk?.proofCount).toBe(2);
    });

    it("rejects proof sets with mismatched nSigs thresholds", () => {
      const locktime = Math.floor(Date.now() / 1000) + 60;
      const pubkeys = [BUYER_CASHU_PUBKEY, ARBITER_CASHU_PUBKEY];

      const result = parseP2PKProofSet([
        buildP2pkProof({ id: "one", locktime, pubkeys, nSigs: 2 }),
        buildP2pkProof({ id: "two", locktime, pubkeys, nSigs: 3 }),
      ]);

      expect(result).toEqual({
        p2pk: null,
        invalidReason: "Token contains inconsistent P2PK proof locks.",
      });
    });

    it("rejects malformed P2PK proofs with duplicate spending-condition tags", () => {
      const proof = buildP2pkProof({
        pubkeys: [BUYER_CASHU_PUBKEY, ARBITER_CASHU_PUBKEY],
        nSigs: 2,
      });
      const [, secret] = JSON.parse(proof.secret);
      secret.tags.push(["n_sigs", "1"]);
      proof.secret = JSON.stringify(["P2PK", secret]);

      expect(parseP2PK(proof)).toBeNull();
    });

    it("rejects malformed P2PK proofs whose n_sigs exceeds available locktime keys", () => {
      const proof = buildP2pkProof({
        pubkeys: [BUYER_CASHU_PUBKEY],
        nSigs: 3,
      });

      expect(parseP2PK(proof)).toBeNull();
    });

    it("rejects duplicate keys in either NUT-11 signature pathway", () => {
      expect(
        parseP2PK(
          buildP2pkProof({
            pubkeys: [SELLER_CASHU_PUBKEY, ARBITER_CASHU_PUBKEY],
            nSigs: 2,
          })
        )
      ).toBeNull();
      expect(
        parseP2PK(
          buildP2pkProof({
            refundKeys: [BUYER_CASHU_PUBKEY, `02${BUYER_CASHU_PUBKEY}`],
          })
        )
      ).toBeNull();
    });

    it("rejects an unknown NUT-11 signature flag", () => {
      const proof = buildP2pkProof();
      const [, secret] = JSON.parse(proof.secret);
      secret.tags.push(["sigflag", "SIG_UNKNOWN"]);
      proof.secret = JSON.stringify(["P2PK", secret]);

      expect(parseP2PK(proof)).toBeNull();
    });
  });

  describe("getArbiterPubkey", () => {
    it("normalizes a configured arbiter pubkey", () => {
      expect(getArbiterPubkey()).toBe(NORMALIZED_ARBITER_CASHU_PUBKEY);
    });

    it("returns null when the arbiter pubkey is not configured", () => {
      delete process.env.NEXT_PUBLIC_ARBITER_PUBKEY;

      expect(getArbiterPubkey()).toBeNull();
    });
  });

  describe("seller escalation timing", () => {
    const hour = 60 * 60 * 1000;
    const requestSentAtMs = 1_000_000;

    it("uses the normal 48 hour grace period when the refund locktime is far away", () => {
      expect(
        (p2pkCheckout as any).getSellerEscalationAtMs({
          requestSentAtMs,
          locktimeSeconds: Math.floor((requestSentAtMs + 7 * 24 * hour) / 1000),
        })
      ).toBe(requestSentAtMs + 48 * hour);
    });

    it("shortens the grace period to preserve a full day before refund unlock", () => {
      expect(
        (p2pkCheckout as any).getSellerEscalationAtMs({
          requestSentAtMs,
          locktimeSeconds: Math.floor((requestSentAtMs + 36 * hour) / 1000),
        })
      ).toBe(requestSentAtMs + 12 * hour);
    });

    it("allows immediate escalation when less than the safety window remains", () => {
      expect(
        (p2pkCheckout as any).getSellerEscalationAtMs({
          requestSentAtMs,
          locktimeSeconds: Math.floor((requestSentAtMs + 12 * hour) / 1000),
        })
      ).toBe(requestSentAtMs);
    });
  });
});
