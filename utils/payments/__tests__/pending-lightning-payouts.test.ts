/**
 * @jest-environment jsdom
 */
import {
  getPendingSellerLightningPayouts,
  isUnresolvedSellerLightningPayoutError,
  recordPendingSellerLightningPayout,
  removePendingSellerLightningPayout,
} from "../pending-lightning-payouts";

const recoverableProof = {
  id: "keyset-1",
  amount: 17,
  secret: "recoverable-secret",
  C: "recoverable-C",
} as any;
const quarantinedProof = {
  id: "keyset-1",
  amount: 983,
  secret: "quarantined-secret",
  C: "quarantined-C",
} as any;

beforeEach(() => {
  window.localStorage.clear();
});

describe("pending seller Lightning payouts", () => {
  it("preserves the safe recovery boundary even when durable storage fails", () => {
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementationOnce(() => {
        throw new Error("storage unavailable");
      });

    try {
      recordPendingSellerLightningPayout({
        orderId: "order-1",
        mintUrl: "https://mint.example",
        sellerPubkey: "seller-pubkey",
        buyerPubkey: "buyer-pubkey",
        lnurl: "seller@example.com",
        sellerAmount: 1000,
        status: "unknown",
        meltQuoteId: "melt-quote-1",
        recoverableProofs: [recoverableProof],
        quarantinedProofs: [quarantinedProof],
        errorMessage: "unknown",
      });
      throw new Error("expected storage failure");
    } catch (error) {
      expect(isUnresolvedSellerLightningPayoutError(error)).toBe(true);
      if (isUnresolvedSellerLightningPayoutError(error)) {
        expect(error.recoverableProofs).toEqual([recoverableProof]);
        expect(error.message).toMatch(/could not be saved/i);
      }
    } finally {
      setItem.mockRestore();
    }
  });

  it("removes only the matching record when a pending payout is resolved", () => {
    const base = {
      orderId: "order-1",
      mintUrl: "https://mint.example",
      sellerPubkey: "seller-pubkey",
      buyerPubkey: "buyer-pubkey",
      lnurl: "seller@example.com",
      sellerAmount: 1000,
      status: "pending" as const,
      recoverableProofs: [recoverableProof],
      quarantinedProofs: [quarantinedProof],
      errorMessage: "pending",
    };
    recordPendingSellerLightningPayout({ ...base, meltQuoteId: "quote-a" });
    recordPendingSellerLightningPayout({
      ...base,
      orderId: "order-2",
      meltQuoteId: "quote-b",
    });

    removePendingSellerLightningPayout("quote-a");

    const remaining = getPendingSellerLightningPayouts();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.meltQuoteId).toBe("quote-b");

    // Removing an unknown id is a no-op.
    removePendingSellerLightningPayout("quote-that-does-not-exist");
    expect(getPendingSellerLightningPayouts()).toHaveLength(1);
  });

  it("refuses to write a record without a buyer identity", () => {
    expect(() =>
      recordPendingSellerLightningPayout({
        orderId: "order-1",
        mintUrl: "https://mint.example",
        sellerPubkey: "seller-pubkey",
        buyerPubkey: "",
        lnurl: "seller@example.com",
        sellerAmount: 1000,
        status: "pending",
        meltQuoteId: "quote-a",
        recoverableProofs: [],
        quarantinedProofs: [],
        errorMessage: "pending",
      })
    ).toThrow(/buyer identity/);
    expect(getPendingSellerLightningPayouts()).toHaveLength(0);
  });
});
