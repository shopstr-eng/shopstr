import { safeSwap } from "@/utils/cashu/swap-retry-service";
import { safeMeltProofs } from "@/utils/cashu/melt-retry-service";
import { executeSellerLightningPayout } from "../lightning-payout";

jest.mock("@/utils/cashu/swap-retry-service", () => ({
  safeSwap: jest.fn(),
}));
jest.mock("@/utils/cashu/melt-retry-service", () => ({
  safeMeltProofs: jest.fn(),
}));

const mockRequestInvoice = jest.fn();
const mockFetch = jest.fn();
jest.mock("@getalby/lightning-tools", () => ({
  LightningAddress: jest.fn().mockImplementation(() => ({
    fetch: mockFetch,
    requestInvoice: mockRequestInvoice,
  })),
}));

function makeProof(amount: number) {
  return { amount, secret: `secret-${amount}`, C: "C", id: "keyset-1" } as any;
}

function makeMeltQuote(amount: number, feeReserve: number) {
  return {
    amount: { toNumber: () => amount },
    fee_reserve: { toNumber: () => feeReserve },
    quote: "quote-id",
  } as any;
}

function makeWallet(createMeltQuoteBolt11: jest.Mock) {
  return {
    loadMint: jest.fn().mockResolvedValue(undefined),
    createMeltQuoteBolt11,
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue(undefined);
  mockRequestInvoice.mockResolvedValue({
    paymentRequest: "lnbc5000n1mockinvoice",
  });
});

describe("executeSellerLightningPayout", () => {
  it("requests an invoice for 98% of sellerAmount minus a 2 sat fee reserve", async () => {
    const createMeltQuoteBolt11 = jest.fn().mockResolvedValue(null);
    const wallet = makeWallet(createMeltQuoteBolt11);

    await executeSellerLightningPayout(wallet, "seller@getalby.com", 1000, [
      makeProof(1000),
    ]);

    // floor(1000 * 0.98 - 2) = floor(978) = 978
    expect(mockRequestInvoice).toHaveBeenCalledWith({ satoshi: 978 });
  });

  it("returns the original seller proofs for ecash fallback when the mint can't produce a melt quote", async () => {
    const createMeltQuoteBolt11 = jest.fn().mockResolvedValue(null);
    const wallet = makeWallet(createMeltQuoteBolt11);
    const sellerProofs = [makeProof(1000)];

    const result = await executeSellerLightningPayout(
      wallet,
      "seller@getalby.com",
      1000,
      sellerProofs
    );

    expect(result).toEqual({
      status: "fallback",
      reason: "no-quote",
      fallbackProofs: sellerProofs,
      fallbackAmount: 1000,
    });
    expect(safeSwap).not.toHaveBeenCalled();
    expect(safeMeltProofs).not.toHaveBeenCalled();
  });

  it("swaps for the melt quote's amount + fee_reserve, not the seller's full proof amount", async () => {
    const meltQuote = makeMeltQuote(978, 5);
    const createMeltQuoteBolt11 = jest.fn().mockResolvedValue(meltQuote);
    const wallet = makeWallet(createMeltQuoteBolt11);
    jest.mocked(safeSwap).mockResolvedValue({
      status: "swapped",
      keep: [],
      send: [makeProof(983)],
    });
    jest.mocked(safeMeltProofs).mockResolvedValue({
      status: "paid",
      meltQuote,
      changeProofs: [],
    });

    await executeSellerLightningPayout(wallet, "seller@getalby.com", 1000, [
      makeProof(1000),
    ]);

    expect(safeSwap).toHaveBeenCalledWith(wallet, 983, [makeProof(1000)], {
      sendConfig: { includeFees: true },
    });
  });

  it("falls back to the original seller proofs when the pre-melt swap is confirmed unswapped", async () => {
    const meltQuote = makeMeltQuote(978, 5);
    const createMeltQuoteBolt11 = jest.fn().mockResolvedValue(meltQuote);
    const wallet = makeWallet(createMeltQuoteBolt11);
    jest.mocked(safeSwap).mockResolvedValue({
      status: "unswapped",
      keep: [],
      send: [],
      errorMessage: "mint unreachable",
    });

    const sellerProofs = [makeProof(1000)];
    await expect(
      executeSellerLightningPayout(
        wallet,
        "seller@getalby.com",
        1000,
        sellerProofs
      )
    ).resolves.toEqual({
      status: "fallback",
      reason: "swap-unswapped",
      fallbackProofs: sellerProofs,
      fallbackAmount: 1000,
      errorMessage: "mint unreachable",
    });
    expect(safeMeltProofs).not.toHaveBeenCalled();
  });

  it("quarantines the original seller proofs when the pre-melt swap outcome is unknown", async () => {
    const meltQuote = makeMeltQuote(978, 5);
    const createMeltQuoteBolt11 = jest.fn().mockResolvedValue(meltQuote);
    const wallet = makeWallet(createMeltQuoteBolt11);
    jest.mocked(safeSwap).mockResolvedValue({
      status: "unknown",
      keep: [],
      send: [],
    });

    const sellerProofs = [makeProof(1000)];
    await expect(
      executeSellerLightningPayout(
        wallet,
        "seller@getalby.com",
        1000,
        sellerProofs
      )
    ).resolves.toEqual({
      status: "unknown",
      meltQuoteId: "quote-id",
      recoverableProofs: [],
      quarantinedProofs: sellerProofs,
      errorMessage: "Pre-melt swap did not complete (unknown)",
    });
    expect(safeMeltProofs).not.toHaveBeenCalled();
  });

  it("melts the swap's `send` output, not the original sellerProofs", async () => {
    const meltQuote = makeMeltQuote(978, 5);
    const createMeltQuoteBolt11 = jest.fn().mockResolvedValue(meltQuote);
    const wallet = makeWallet(createMeltQuoteBolt11);
    const swappedSend = [makeProof(983)];
    jest.mocked(safeSwap).mockResolvedValue({
      status: "swapped",
      keep: [makeProof(17)],
      send: swappedSend,
    });
    jest.mocked(safeMeltProofs).mockResolvedValue({
      status: "paid",
      meltQuote,
      changeProofs: [],
    });

    await executeSellerLightningPayout(wallet, "seller@getalby.com", 1000, [
      makeProof(1000),
    ]);

    expect(safeMeltProofs).toHaveBeenCalledWith(wallet, meltQuote, swappedSend);
  });

  it("keeps swap change recoverable and quarantines melt proofs while the melt is pending", async () => {
    const meltQuote = makeMeltQuote(978, 5);
    const createMeltQuoteBolt11 = jest.fn().mockResolvedValue(meltQuote);
    const wallet = makeWallet(createMeltQuoteBolt11);
    const keepProof = makeProof(17);
    const sendProof = makeProof(983);
    jest.mocked(safeSwap).mockResolvedValue({
      status: "swapped",
      keep: [keepProof],
      send: [sendProof],
    });
    jest.mocked(safeMeltProofs).mockResolvedValue({
      status: "pending",
      meltQuote,
      changeProofs: [],
      errorMessage: "mint still processing",
    });

    await expect(
      executeSellerLightningPayout(wallet, "seller@getalby.com", 1000, [
        makeProof(1000),
      ])
    ).resolves.toEqual({
      status: "pending",
      meltQuoteId: "quote-id",
      recoverableProofs: [keepProof],
      quarantinedProofs: [sendProof],
      errorMessage: "mint still processing",
    });
  });

  it("preserves proof ownership when the melt outcome is unknown", async () => {
    const meltQuote = makeMeltQuote(978, 5);
    const createMeltQuoteBolt11 = jest.fn().mockResolvedValue(meltQuote);
    const wallet = makeWallet(createMeltQuoteBolt11);
    const keepProof = makeProof(17);
    const sendProof = makeProof(983);
    jest.mocked(safeSwap).mockResolvedValue({
      status: "swapped",
      keep: [keepProof],
      send: [sendProof],
    });
    jest.mocked(safeMeltProofs).mockResolvedValue({
      status: "unknown",
      meltQuote,
      changeProofs: [],
    });

    await expect(
      executeSellerLightningPayout(wallet, "seller@getalby.com", 1000, [
        makeProof(1000),
      ])
    ).resolves.toEqual({
      status: "unknown",
      meltQuoteId: "quote-id",
      recoverableProofs: [keepProof],
      quarantinedProofs: [sendProof],
      errorMessage: "Melt did not complete (unknown)",
    });
  });

  it("falls back to all unspent swap outputs when the mint confirms the melt is unpaid", async () => {
    const meltQuote = makeMeltQuote(978, 5);
    const createMeltQuoteBolt11 = jest.fn().mockResolvedValue(meltQuote);
    const wallet = makeWallet(createMeltQuoteBolt11);
    const keepProof = makeProof(17);
    const sendProof = makeProof(983);
    jest.mocked(safeSwap).mockResolvedValue({
      status: "swapped",
      keep: [keepProof],
      send: [sendProof],
    });
    jest.mocked(safeMeltProofs).mockResolvedValue({
      status: "unpaid",
      meltQuote,
      changeProofs: [],
      errorMessage: "invoice expired",
    });

    await expect(
      executeSellerLightningPayout(wallet, "seller@getalby.com", 1000, [
        makeProof(1000),
      ])
    ).resolves.toEqual({
      status: "fallback",
      reason: "melt-unpaid",
      fallbackProofs: [keepProof, sendProof],
      fallbackAmount: 1000,
      errorMessage: "invoice expired",
    });
  });

  it("on success, returns meltAmount from the outcome's meltQuote and combines swap-keep with melt change into changeProofs/changeAmount", async () => {
    const meltQuote = makeMeltQuote(978, 5);
    const createMeltQuoteBolt11 = jest.fn().mockResolvedValue(meltQuote);
    const wallet = makeWallet(createMeltQuoteBolt11);
    const keepProof = makeProof(17);
    const meltChangeProof = makeProof(3);
    jest.mocked(safeSwap).mockResolvedValue({
      status: "swapped",
      keep: [keepProof],
      send: [makeProof(983)],
    });
    jest.mocked(safeMeltProofs).mockResolvedValue({
      status: "paid",
      meltQuote: makeMeltQuote(978, 0),
      changeProofs: [meltChangeProof],
    });

    const result = await executeSellerLightningPayout(
      wallet,
      "seller@getalby.com",
      1000,
      [makeProof(1000)]
    );

    expect(result).toEqual({
      status: "completed",
      meltAmount: 978,
      changeProofs: [keepProof, meltChangeProof],
      changeAmount: 20,
    });
  });

  it("reports changeAmount 0 when there is no swap-keep and no melt change", async () => {
    const meltQuote = makeMeltQuote(978, 5);
    const createMeltQuoteBolt11 = jest.fn().mockResolvedValue(meltQuote);
    const wallet = makeWallet(createMeltQuoteBolt11);
    jest.mocked(safeSwap).mockResolvedValue({
      status: "swapped",
      keep: [],
      send: [makeProof(983)],
    });
    jest.mocked(safeMeltProofs).mockResolvedValue({
      status: "paid",
      meltQuote,
      changeProofs: [],
    });

    const result = await executeSellerLightningPayout(
      wallet,
      "seller@getalby.com",
      1000,
      [makeProof(1000)]
    );

    expect(result).toEqual({
      status: "completed",
      meltAmount: 978,
      changeProofs: [],
      changeAmount: 0,
    });
  });

  describe("error handling and ecash fallback resilience", () => {
    it.each(["", "   "])(
      "falls back to ecash when lnurl is blank ('%s')",
      async (emptyLnurl) => {
        const wallet = makeWallet(jest.fn());
        const sellerProofs = [makeProof(1000)];

        const result = await executeSellerLightningPayout(
          wallet,
          emptyLnurl,
          1000,
          sellerProofs
        );

        expect(result).toEqual({
          status: "fallback",
          reason: "no-quote",
          fallbackProofs: sellerProofs,
          fallbackAmount: 1000,
          errorMessage: "No valid Lightning address provided",
        });
        expect(mockFetch).not.toHaveBeenCalled();
        expect(mockRequestInvoice).not.toHaveBeenCalled();
      }
    );

    it.each([
      [2, -1],
      [3, 0],
    ])(
      "falls back to ecash when sellerAmount (%i) results in non-positive payout (%i sats)",
      async (sellerAmount, calculatedAmount) => {
        const wallet = makeWallet(jest.fn());
        const sellerProofs = [makeProof(sellerAmount)];

        const result = await executeSellerLightningPayout(
          wallet,
          "seller@getalby.com",
          sellerAmount,
          sellerProofs
        );

        expect(result).toEqual({
          status: "fallback",
          reason: "no-quote",
          fallbackProofs: sellerProofs,
          fallbackAmount: sellerAmount,
          errorMessage: `Seller payout amount after fee deduction is too low for Lightning payout (${calculatedAmount} sats)`,
        });
        expect(mockFetch).not.toHaveBeenCalled();
        expect(mockRequestInvoice).not.toHaveBeenCalled();
      }
    );

    it("falls back to ecash when LightningAddress fetch fails (e.g. 400 Bad Request or network error)", async () => {
      mockFetch.mockRejectedValueOnce(
        new Error("Failed to fetch lnurl info: 400 Bad Request")
      );
      const wallet = makeWallet(jest.fn());
      const sellerProofs = [makeProof(1000)];

      const result = await executeSellerLightningPayout(
        wallet,
        "seller@invalid.com",
        1000,
        sellerProofs
      );

      expect(result).toEqual({
        status: "fallback",
        reason: "no-quote",
        fallbackProofs: sellerProofs,
        fallbackAmount: 1000,
        errorMessage: "Failed to fetch lnurl info: 400 Bad Request",
      });
      expect(mockRequestInvoice).not.toHaveBeenCalled();
    });

    it("falls back to ecash when requestInvoice throws (e.g. amount below minimum)", async () => {
      mockRequestInvoice.mockRejectedValueOnce(
        new Error("Amount is below minimum limit of 1000 sats")
      );
      const wallet = makeWallet(jest.fn());
      const sellerProofs = [makeProof(500)];

      const result = await executeSellerLightningPayout(
        wallet,
        "seller@getalby.com",
        500,
        sellerProofs
      );

      expect(result).toEqual({
        status: "fallback",
        reason: "no-quote",
        fallbackProofs: sellerProofs,
        fallbackAmount: 500,
        errorMessage: "Amount is below minimum limit of 1000 sats",
      });
    });

    it("falls back to ecash when requestInvoice returns an empty paymentRequest", async () => {
      mockRequestInvoice.mockResolvedValueOnce({ paymentRequest: "" });
      const wallet = makeWallet(jest.fn());
      const sellerProofs = [makeProof(1000)];

      const result = await executeSellerLightningPayout(
        wallet,
        "seller@getalby.com",
        1000,
        sellerProofs
      );

      expect(result).toEqual({
        status: "fallback",
        reason: "no-quote",
        fallbackProofs: sellerProofs,
        fallbackAmount: 1000,
        errorMessage: "Lightning address returned an empty invoice",
      });
    });

    it("falls back to ecash when wallet.loadMint throws", async () => {
      const wallet = makeWallet(jest.fn());
      wallet.loadMint.mockRejectedValueOnce(new Error("Mint offline"));
      const sellerProofs = [makeProof(1000)];

      const result = await executeSellerLightningPayout(
        wallet,
        "seller@getalby.com",
        1000,
        sellerProofs
      );

      expect(result).toEqual({
        status: "fallback",
        reason: "no-quote",
        fallbackProofs: sellerProofs,
        fallbackAmount: 1000,
        errorMessage: "Mint offline",
      });
      expect(mockRequestInvoice).not.toHaveBeenCalled();
    });

    it("falls back to ecash when createMeltQuoteBolt11 throws (e.g. no route found)", async () => {
      const createMeltQuoteBolt11 = jest
        .fn()
        .mockRejectedValueOnce(
          new Error("No route found to lightning destination")
        );
      const wallet = makeWallet(createMeltQuoteBolt11);
      const sellerProofs = [makeProof(1000)];

      const result = await executeSellerLightningPayout(
        wallet,
        "seller@getalby.com",
        1000,
        sellerProofs
      );

      expect(result).toEqual({
        status: "fallback",
        reason: "no-quote",
        fallbackProofs: sellerProofs,
        fallbackAmount: 1000,
        errorMessage: "No route found to lightning destination",
      });
    });

    it("falls back to ecash when meltQuote has non-positive or invalid total", async () => {
      const createMeltQuoteBolt11 = jest.fn().mockResolvedValue({
        amount: { toNumber: () => 0 },
        fee_reserve: { toNumber: () => 0 },
        quote: "quote-id",
      });
      const wallet = makeWallet(createMeltQuoteBolt11);
      const sellerProofs = [makeProof(1000)];

      const result = await executeSellerLightningPayout(
        wallet,
        "seller@getalby.com",
        1000,
        sellerProofs
      );

      expect(result).toEqual({
        status: "fallback",
        reason: "no-quote",
        fallbackProofs: sellerProofs,
        fallbackAmount: 1000,
        errorMessage: "Invalid melt quote total amount",
      });
      expect(safeSwap).not.toHaveBeenCalled();
    });

    it("handles meltQuote and meltOutcome with primitive numbers (non-Amount objects)", async () => {
      const meltQuote = {
        amount: 978,
        fee_reserve: 5,
        quote: "quote-id",
      } as any;
      const createMeltQuoteBolt11 = jest.fn().mockResolvedValue(meltQuote);
      const wallet = makeWallet(createMeltQuoteBolt11);
      const keepProof = makeProof(17);
      const meltChangeProof = makeProof(3);
      jest.mocked(safeSwap).mockResolvedValue({
        status: "swapped",
        keep: [keepProof],
        send: [makeProof(983)],
      });
      jest.mocked(safeMeltProofs).mockResolvedValue({
        status: "paid",
        meltQuote: {
          amount: 978,
          fee_reserve: 0,
          quote: "quote-id",
        } as any,
        changeProofs: [meltChangeProof],
      });

      const result = await executeSellerLightningPayout(
        wallet,
        "seller@getalby.com",
        1000,
        [makeProof(1000)]
      );

      expect(result).toEqual({
        status: "completed",
        meltAmount: 978,
        changeProofs: [keepProof, meltChangeProof],
        changeAmount: 20,
      });
    });
  });
});
