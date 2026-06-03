import { buildP2pkOutputConfig, getBuyerReclaimKeys } from "../p2pk-checkout";

const BUYER_CASHU_PUBKEY =
  "02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BUYER_EXTRA_RECLAIM_KEY =
  "03bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const BUYER_NOSTR_PUBKEY =
  "04cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const SELLER_CASHU_PUBKEY =
  "05dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

const buyerContent = (reclaimKeys?: string[]) =>
  ({
    p2pk: reclaimKeys ? { enabled: false, reclaimKeys } : undefined,
  }) as any;

const sellerP2pk = {
  enabled: true,
  pubkey: SELLER_CASHU_PUBKEY,
  refundDelayDays: 7,
};

describe("p2pk-checkout", () => {
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
      ).toEqual([BUYER_EXTRA_RECLAIM_KEY, BUYER_CASHU_PUBKEY]);
    });

    it("preserves profile reclaim keys when they already include the buyer Cashu pubkey", () => {
      const reclaimKeys = [BUYER_EXTRA_RECLAIM_KEY, BUYER_CASHU_PUBKEY];

      expect(
        getBuyerReclaimKeys(buyerContent(reclaimKeys), BUYER_CASHU_PUBKEY)
      ).toEqual(reclaimKeys);
    });

    it("fails safely when the buyer Cashu pubkey is missing", () => {
      expect(getBuyerReclaimKeys(buyerContent([BUYER_EXTRA_RECLAIM_KEY]))).toBe(
        null
      );
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

      expect(outputConfig?.send.options.pubkey).toBe(SELLER_CASHU_PUBKEY);
    });

    it("sets refundKeys from profile reclaim keys plus the buyer Cashu pubkey", () => {
      const outputConfig = buildP2pkOutputConfig(
        sellerP2pk,
        buyerContent([BUYER_EXTRA_RECLAIM_KEY]),
        BUYER_CASHU_PUBKEY
      );

      expect(outputConfig?.send.options.refundKeys).toEqual([
        BUYER_EXTRA_RECLAIM_KEY,
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
});
