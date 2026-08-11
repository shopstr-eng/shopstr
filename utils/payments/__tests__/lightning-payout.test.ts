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

  it("returns { status: 'no-quote' } without touching swap/melt when the mint can't produce a melt quote", async () => {
    const createMeltQuoteBolt11 = jest.fn().mockResolvedValue(null);
    const wallet = makeWallet(createMeltQuoteBolt11);

    const result = await executeSellerLightningPayout(
      wallet,
      "seller@getalby.com",
      1000,
      [makeProof(1000)]
    );

    expect(result).toEqual({ status: "no-quote" });
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

  it("throws when the pre-melt swap doesn't complete, surfacing the swap's errorMessage", async () => {
    const meltQuote = makeMeltQuote(978, 5);
    const createMeltQuoteBolt11 = jest.fn().mockResolvedValue(meltQuote);
    const wallet = makeWallet(createMeltQuoteBolt11);
    jest.mocked(safeSwap).mockResolvedValue({
      status: "unswapped",
      keep: [],
      send: [],
      errorMessage: "mint unreachable",
    });

    await expect(
      executeSellerLightningPayout(wallet, "seller@getalby.com", 1000, [
        makeProof(1000),
      ])
    ).rejects.toThrow("mint unreachable");
    expect(safeMeltProofs).not.toHaveBeenCalled();
  });

  it("falls back to a status-derived message when the swap failure has no errorMessage", async () => {
    const meltQuote = makeMeltQuote(978, 5);
    const createMeltQuoteBolt11 = jest.fn().mockResolvedValue(meltQuote);
    const wallet = makeWallet(createMeltQuoteBolt11);
    jest.mocked(safeSwap).mockResolvedValue({
      status: "unknown",
      keep: [],
      send: [],
    });

    await expect(
      executeSellerLightningPayout(wallet, "seller@getalby.com", 1000, [
        makeProof(1000),
      ])
    ).rejects.toThrow("Pre-melt swap did not complete (unknown)");
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

  it("throws when the melt doesn't complete, surfacing the melt's errorMessage", async () => {
    const meltQuote = makeMeltQuote(978, 5);
    const createMeltQuoteBolt11 = jest.fn().mockResolvedValue(meltQuote);
    const wallet = makeWallet(createMeltQuoteBolt11);
    jest.mocked(safeSwap).mockResolvedValue({
      status: "swapped",
      keep: [],
      send: [makeProof(983)],
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
    ).rejects.toThrow("mint still processing");
  });

  it("falls back to a status-derived message when the melt failure has no errorMessage", async () => {
    const meltQuote = makeMeltQuote(978, 5);
    const createMeltQuoteBolt11 = jest.fn().mockResolvedValue(meltQuote);
    const wallet = makeWallet(createMeltQuoteBolt11);
    jest.mocked(safeSwap).mockResolvedValue({
      status: "swapped",
      keep: [],
      send: [makeProof(983)],
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
    ).rejects.toThrow("Melt did not complete (unknown)");
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
});
