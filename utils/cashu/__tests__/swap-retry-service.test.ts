import { Proof } from "@cashu/cashu-ts";
import { safeSwap } from "../swap-retry-service";

const mkProof = (secret: string, amount = 10): Proof =>
  ({
    id: "00d0a1b24d1c1a53",
    amount,
    secret,
    C: "C",
  }) as unknown as Proof;

describe("safeSwap", () => {
  it("returns swapped on success", async () => {
    const wallet = {
      send: jest.fn().mockResolvedValue({
        keep: [mkProof("k1", 5)],
        send: [mkProof("s1", 10)],
      }),
      checkProofsStates: jest.fn(),
    } as any;
    const out = await safeSwap(wallet, 10, [mkProof("a"), mkProof("b")], {
      swapRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 1000,
        totalTimeoutMs: 2000,
      },
    });
    expect(out.status).toBe("swapped");
    expect(out.keep.map((p) => p.secret)).toEqual(["k1"]);
    expect(out.send.map((p) => p.secret)).toEqual(["s1"]);
    expect(wallet.checkProofsStates).not.toHaveBeenCalled();
  });

  it("returns unswapped on terminal client errors without contacting mint", async () => {
    const wallet = {
      send: jest.fn().mockRejectedValue(new Error("insufficient funds")),
      checkProofsStates: jest.fn(),
    } as any;
    const out = await safeSwap(wallet, 100, [mkProof("a")], {
      swapRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 500,
        totalTimeoutMs: 1000,
      },
    });
    expect(out.status).toBe("unswapped");
    expect(wallet.checkProofsStates).not.toHaveBeenCalled();
  });

  it("returns unswapped when mint confirms inputs all UNSPENT after ambiguous failure", async () => {
    const wallet = {
      send: jest.fn().mockRejectedValue(new Error("network blip")),
      checkProofsStates: jest
        .fn()
        .mockResolvedValue([{ state: "UNSPENT" }, { state: "UNSPENT" }]),
    } as any;
    const out = await safeSwap(wallet, 10, [mkProof("a"), mkProof("b")], {
      swapRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 500,
        totalTimeoutMs: 1000,
      },
      checkRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 500,
        totalTimeoutMs: 1000,
      },
    });
    expect(out.status).toBe("unswapped");
    expect(wallet.checkProofsStates).toHaveBeenCalledTimes(1);
  });

  it("returns unknown when inputs are SPENT but outputs were lost", async () => {
    const wallet = {
      send: jest.fn().mockRejectedValue(new Error("network blip")),
      checkProofsStates: jest
        .fn()
        .mockResolvedValue([{ state: "SPENT" }, { state: "SPENT" }]),
    } as any;
    const out = await safeSwap(wallet, 10, [mkProof("a"), mkProof("b")], {
      swapRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 500,
        totalTimeoutMs: 1000,
      },
      checkRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 500,
        totalTimeoutMs: 1000,
      },
    });
    expect(out.status).toBe("unknown");
    expect(out.errorMessage).toMatch(/SPENT/);
  });

  it("returns unknown when state check itself fails", async () => {
    const wallet = {
      send: jest.fn().mockRejectedValue(new Error("network blip")),
      checkProofsStates: jest
        .fn()
        .mockRejectedValue(new Error("network blip 2")),
    } as any;
    const out = await safeSwap(wallet, 10, [mkProof("a")], {
      swapRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 500,
        totalTimeoutMs: 1000,
      },
      checkRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 500,
        totalTimeoutMs: 1000,
      },
    });
    expect(out.status).toBe("unknown");
    expect(out.errorMessage).toMatch(/follow-up state check also failed/);
  });

  it("returns unknown when inputs are mixed (some SPENT, some UNSPENT)", async () => {
    const wallet = {
      send: jest.fn().mockRejectedValue(new Error("network blip")),
      checkProofsStates: jest
        .fn()
        .mockResolvedValue([{ state: "SPENT" }, { state: "UNSPENT" }]),
    } as any;
    const out = await safeSwap(wallet, 10, [mkProof("a"), mkProof("b")], {
      swapRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 500,
        totalTimeoutMs: 1000,
      },
      checkRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 500,
        totalTimeoutMs: 1000,
      },
    });
    expect(out.status).toBe("unknown");
  });

  it("forwards sendConfig and outputConfig positionally", async () => {
    const wallet = {
      send: jest.fn().mockResolvedValue({ keep: [], send: [] }),
      checkProofsStates: jest.fn(),
    } as any;
    const sendConfig = { includeFees: true };
    const outputConfig = { keysetId: "abc" };
    await safeSwap(wallet, 10, [mkProof("a")], {
      sendConfig: sendConfig as any,
      outputConfig: outputConfig as any,
      swapRetry: {
        maxAttempts: 1,
        perAttemptTimeoutMs: 500,
        totalTimeoutMs: 1000,
      },
    });
    expect(wallet.send).toHaveBeenCalledWith(
      10,
      [mkProof("a")],
      sendConfig,
      outputConfig
    );
  });
});
