/**
 * @jest-environment node
 */
import {
  Amount,
  MeltQuoteBolt11Response,
  Proof,
  Wallet as CashuWallet,
} from "@cashu/cashu-ts";
import { safeMeltProofs } from "../melt-retry-service";

type MeltWalletMock = Pick<
  CashuWallet,
  "meltProofsBolt11" | "checkMeltQuoteBolt11"
>;

const makeProof = (secret: string, amount = 100): Proof => ({
  id: "k",
  amount: Amount.from(amount),
  secret,
  C: "c",
});

const baseQuote: MeltQuoteBolt11Response = {
  quote: "q1",
  amount: Amount.from(100),
  fee_reserve: Amount.from(1),
  unit: "sat",
  payment_preimage: null,
  state: "UNPAID",
  expiry: 0,
  request: "lnbc...",
};

const proofs = [makeProof("s")];

describe("safeMeltProofs", () => {
  it("returns paid when meltProofsBolt11 succeeds first try", async () => {
    const change = [makeProof("s2", 1)];
    const wallet: MeltWalletMock = {
      meltProofsBolt11: jest
        .fn()
        .mockResolvedValue({ change, quote: baseQuote }),
      checkMeltQuoteBolt11: jest.fn(),
    };

    const outcome = await safeMeltProofs(wallet, baseQuote, proofs, {
      meltRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 100,
        baseDelayMs: 1,
        jitter: false,
      },
      checkRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 100,
        baseDelayMs: 1,
        jitter: false,
      },
    });

    expect(outcome.status).toBe("paid");
    expect(outcome.changeProofs).toEqual(change);
    expect(wallet.checkMeltQuoteBolt11).not.toHaveBeenCalled();
  });

  it("verifies via checkMeltQuoteBolt11 when melt fails ambiguously, returns paid when mint reports PAID", async () => {
    const wallet: MeltWalletMock = {
      meltProofsBolt11: jest.fn().mockRejectedValue(new Error("Timeout")),
      checkMeltQuoteBolt11: jest
        .fn()
        .mockResolvedValue({ ...baseQuote, state: "PAID", change: [] }),
    };

    const outcome = await safeMeltProofs(wallet, baseQuote, proofs, {
      meltRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 100,
        baseDelayMs: 1,
        jitter: false,
      },
      checkRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 100,
        baseDelayMs: 1,
        jitter: false,
      },
    });

    expect(outcome.status).toBe("paid");
    expect(outcome.errorMessage).toMatch(/quote is PAID/);
    expect(wallet.checkMeltQuoteBolt11).toHaveBeenCalledWith("q1");
  });

  it("returns unpaid when post-failure check reports UNPAID", async () => {
    const wallet: MeltWalletMock = {
      meltProofsBolt11: jest.fn().mockRejectedValue(new Error("fetch failed")),
      checkMeltQuoteBolt11: jest
        .fn()
        .mockResolvedValue({ ...baseQuote, state: "UNPAID" }),
    };

    const outcome = await safeMeltProofs(wallet, baseQuote, proofs, {
      meltRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 100,
        baseDelayMs: 1,
        jitter: false,
      },
      checkRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 100,
        baseDelayMs: 1,
        jitter: false,
      },
    });

    expect(outcome.status).toBe("unpaid");
    expect(outcome.changeProofs).toEqual([]);
  });

  it("returns pending when post-failure check reports PENDING", async () => {
    const wallet: MeltWalletMock = {
      meltProofsBolt11: jest.fn().mockRejectedValue(new Error("Timeout")),
      checkMeltQuoteBolt11: jest
        .fn()
        .mockResolvedValue({ ...baseQuote, state: "PENDING" }),
    };

    const outcome = await safeMeltProofs(wallet, baseQuote, proofs, {
      meltRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 100,
        baseDelayMs: 1,
        jitter: false,
      },
      checkRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 100,
        baseDelayMs: 1,
        jitter: false,
      },
    });

    expect(outcome.status).toBe("pending");
  });

  it("returns unknown when both melt and check fail", async () => {
    const wallet: MeltWalletMock = {
      meltProofsBolt11: jest.fn().mockRejectedValue(new Error("Timeout")),
      checkMeltQuoteBolt11: jest.fn().mockRejectedValue(new Error("Timeout")),
    };

    const outcome = await safeMeltProofs(wallet, baseQuote, proofs, {
      meltRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 100,
        baseDelayMs: 1,
        jitter: false,
      },
      checkRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 100,
        baseDelayMs: 1,
        jitter: false,
      },
    });

    expect(outcome.status).toBe("unknown");
    expect(outcome.errorMessage).toMatch(/Proofs may be spent/);
  });

  it("short-circuits to unpaid on terminal error messages without contacting the mint", async () => {
    const wallet: MeltWalletMock = {
      meltProofsBolt11: jest
        .fn()
        .mockRejectedValue(new Error("insufficient funds")),
      checkMeltQuoteBolt11: jest.fn(),
    };

    const outcome = await safeMeltProofs(wallet, baseQuote, proofs, {
      meltRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 100,
        baseDelayMs: 1,
        jitter: false,
      },
      checkRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 100,
        baseDelayMs: 1,
        jitter: false,
      },
    });

    expect(outcome.status).toBe("unpaid");
    expect(wallet.checkMeltQuoteBolt11).not.toHaveBeenCalled();
  });
});
