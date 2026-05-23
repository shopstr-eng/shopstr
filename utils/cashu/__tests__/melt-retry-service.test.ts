/**
 * @jest-environment node
 */
import { safeMeltProofs } from "../melt-retry-service";

const baseQuote = {
  quote: "q1",
  amount: 100,
  fee_reserve: 1,
  state: "UNPAID",
  expiry: 0,
  request: "lnbc...",
} as any;

const proofs = [{ id: "k", amount: 100, secret: "s", C: "c" }] as any;

describe("safeMeltProofs", () => {
  it("returns paid when meltProofsBolt11 succeeds first try", async () => {
    const change = [{ id: "k", amount: 1, secret: "s2", C: "c2" }];
    const wallet = {
      meltProofsBolt11: jest
        .fn()
        .mockResolvedValue({ change, quote: baseQuote }),
      checkMeltQuoteBolt11: jest.fn(),
    } as any;

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
    const wallet = {
      meltProofsBolt11: jest.fn().mockRejectedValue(new Error("Timeout")),
      checkMeltQuoteBolt11: jest
        .fn()
        .mockResolvedValue({ ...baseQuote, state: "PAID", change: [] }),
    } as any;

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
    const wallet = {
      meltProofsBolt11: jest.fn().mockRejectedValue(new Error("fetch failed")),
      checkMeltQuoteBolt11: jest
        .fn()
        .mockResolvedValue({ ...baseQuote, state: "UNPAID" }),
    } as any;

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
    const wallet = {
      meltProofsBolt11: jest.fn().mockRejectedValue(new Error("Timeout")),
      checkMeltQuoteBolt11: jest
        .fn()
        .mockResolvedValue({ ...baseQuote, state: "PENDING" }),
    } as any;

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
    const wallet = {
      meltProofsBolt11: jest.fn().mockRejectedValue(new Error("Timeout")),
      checkMeltQuoteBolt11: jest.fn().mockRejectedValue(new Error("Timeout")),
    } as any;

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
    const wallet = {
      meltProofsBolt11: jest
        .fn()
        .mockRejectedValue(new Error("insufficient funds")),
      checkMeltQuoteBolt11: jest.fn(),
    } as any;

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
