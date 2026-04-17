/**
 * @jest-environment jsdom
 */
import {
  getPendingMintQuotes,
  markMintQuoteClaimed,
  markMintQuotePaid,
  PAID_UNCLAIMED_MAX_AGE_MS,
  recordPendingMintQuote,
  recoverPendingMintQuotes,
  removePendingMintQuote,
  updatePendingMintQuote,
} from "../pending-mint-operations";

const STORAGE_KEY = "milkmarket.pendingMintQuotes";

beforeEach(() => {
  window.localStorage.clear();
});

describe("pending-mint-operations CRUD", () => {
  it("records and reads pending quotes", () => {
    recordPendingMintQuote({
      quoteId: "q1",
      mintUrl: "https://mint.example",
      amount: 100,
      invoice: "lnbc...",
    });
    const all = getPendingMintQuotes();
    expect(all).toHaveLength(1);
    expect(all[0]!.quoteId).toBe("q1");
    expect(all[0]!.status).toBe("awaiting_payment");
  });

  it("upserts an existing quote without resetting createdAt", () => {
    const first = recordPendingMintQuote({
      quoteId: "q1",
      mintUrl: "https://mint.example",
      amount: 100,
      invoice: "lnbc1",
    });
    const second = recordPendingMintQuote({
      quoteId: "q1",
      mintUrl: "https://mint.example",
      amount: 100,
      invoice: "lnbc1",
      status: "paid_unclaimed",
    });
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.status).toBe("paid_unclaimed");
    expect(getPendingMintQuotes()).toHaveLength(1);
  });

  it("marks paid and claimed", () => {
    recordPendingMintQuote({
      quoteId: "q1",
      mintUrl: "https://mint.example",
      amount: 100,
      invoice: "lnbc",
    });
    markMintQuotePaid("q1");
    expect(getPendingMintQuotes({ status: "paid_unclaimed" })).toHaveLength(1);
    markMintQuoteClaimed("q1");
    expect(getPendingMintQuotes()).toHaveLength(0);
  });

  it("removePendingMintQuote drops the record", () => {
    recordPendingMintQuote({
      quoteId: "q1",
      mintUrl: "https://m",
      amount: 1,
      invoice: "i",
    });
    removePendingMintQuote("q1");
    expect(getPendingMintQuotes()).toHaveLength(0);
  });

  it("updatePendingMintQuote merges patch", () => {
    recordPendingMintQuote({
      quoteId: "q1",
      mintUrl: "https://m",
      amount: 1,
      invoice: "i",
    });
    updatePendingMintQuote("q1", {
      attempts: 3,
      lastErrorMessage: "boom",
    });
    expect(getPendingMintQuotes()[0]!.attempts).toBe(3);
    expect(getPendingMintQuotes()[0]!.lastErrorMessage).toBe("boom");
  });

  it("filters by status and mintUrl", () => {
    recordPendingMintQuote({
      quoteId: "q1",
      mintUrl: "https://a",
      amount: 1,
      invoice: "i",
      status: "paid_unclaimed",
    });
    recordPendingMintQuote({
      quoteId: "q2",
      mintUrl: "https://b",
      amount: 1,
      invoice: "i",
    });
    expect(getPendingMintQuotes({ status: "paid_unclaimed" })).toHaveLength(1);
    expect(getPendingMintQuotes({ mintUrl: "https://b" })).toHaveLength(1);
  });

  it("survives corrupt localStorage payloads", () => {
    window.localStorage.setItem(STORAGE_KEY, "not-json{");
    expect(getPendingMintQuotes()).toEqual([]);
  });
});

describe("recoverPendingMintQuotes", () => {
  it("claims paid_unclaimed quotes", async () => {
    recordPendingMintQuote({
      quoteId: "q1",
      mintUrl: "https://m",
      amount: 100,
      invoice: "i",
      status: "paid_unclaimed",
    });
    const proofs = [{ id: "k", amount: 100, secret: "s", C: "c" }] as any;
    const wallet = {
      checkMintQuoteBolt11: jest.fn().mockResolvedValue({ state: "PAID" }),
      mintProofsBolt11: jest.fn().mockResolvedValue(proofs),
    } as any;
    const onProofsClaimed = jest.fn().mockResolvedValue(undefined);

    const result = await recoverPendingMintQuotes({
      buildWallet: async () => wallet,
      onProofsClaimed,
    });

    expect(result.recovered).toBe(1);
    expect(onProofsClaimed).toHaveBeenCalled();
    expect(getPendingMintQuotes()).toHaveLength(0);
  });

  it("counts UNPAID quotes as still pending", async () => {
    recordPendingMintQuote({
      quoteId: "q1",
      mintUrl: "https://m",
      amount: 100,
      invoice: "i",
    });
    const wallet = {
      checkMintQuoteBolt11: jest.fn().mockResolvedValue({ state: "UNPAID" }),
      mintProofsBolt11: jest.fn(),
    } as any;
    const result = await recoverPendingMintQuotes({
      buildWallet: async () => wallet,
      onProofsClaimed: jest.fn(),
    });
    expect(result.stillPending).toBe(1);
    expect(wallet.mintProofsBolt11).not.toHaveBeenCalled();
    expect(getPendingMintQuotes()).toHaveLength(1);
  });

  it("marks quote terminal when mint reports already-issued", async () => {
    recordPendingMintQuote({
      quoteId: "q1",
      mintUrl: "https://m",
      amount: 100,
      invoice: "i",
      status: "paid_unclaimed",
    });
    const wallet = {
      checkMintQuoteBolt11: jest.fn().mockResolvedValue({ state: "PAID" }),
      mintProofsBolt11: jest
        .fn()
        .mockRejectedValue(new Error("quote already issued")),
    } as any;
    const result = await recoverPendingMintQuotes({
      buildWallet: async () => wallet,
      onProofsClaimed: jest.fn(),
      logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } as any,
    });
    expect(result.abandoned).toBe(1);
    const remaining = getPendingMintQuotes();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.status).toBe("failed_terminal");
  });

  it("abandons quotes older than max age", async () => {
    recordPendingMintQuote({
      quoteId: "q1",
      mintUrl: "https://m",
      amount: 100,
      invoice: "i",
      status: "paid_unclaimed",
    });
    updatePendingMintQuote("q1", {
      createdAt: Date.now() - PAID_UNCLAIMED_MAX_AGE_MS - 1000,
    });
    const wallet = {
      checkMintQuoteBolt11: jest.fn(),
      mintProofsBolt11: jest.fn(),
    } as any;
    const result = await recoverPendingMintQuotes({
      buildWallet: async () => wallet,
      onProofsClaimed: jest.fn(),
    });
    expect(result.abandoned).toBe(1);
    expect(wallet.checkMintQuoteBolt11).not.toHaveBeenCalled();
  });

  it("preserves pending record when onProofsClaimed throws", async () => {
    recordPendingMintQuote({
      quoteId: "q1",
      mintUrl: "https://m",
      amount: 100,
      invoice: "i",
      status: "paid_unclaimed",
    });
    const proofs = [{ id: "k", amount: 100, secret: "s", C: "c" }] as any;
    const wallet = {
      checkMintQuoteBolt11: jest.fn().mockResolvedValue({ state: "PAID" }),
      mintProofsBolt11: jest.fn().mockResolvedValue(proofs),
    } as any;
    const result = await recoverPendingMintQuotes({
      buildWallet: async () => wallet,
      onProofsClaimed: jest
        .fn()
        .mockRejectedValue(new Error("nostr publish failed")),
      logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } as any,
    });
    expect(result.recovered).toBe(0);
    expect(result.failed).toBe(1);
    expect(getPendingMintQuotes()).toHaveLength(1);
  });

  it("returns zeroed result when no pending quotes", async () => {
    const result = await recoverPendingMintQuotes({
      buildWallet: jest.fn(),
      onProofsClaimed: jest.fn(),
    });
    expect(result).toEqual({
      total: 0,
      recovered: 0,
      failed: 0,
      stillPending: 0,
      abandoned: 0,
    });
  });
});
