/**
 * @jest-environment jsdom
 */
import {
  isUnresolvedSellerLightningPayoutError,
  recordPendingSellerLightningPayout,
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
});
