import { Proof } from "@cashu/cashu-ts";
import {
  recoverProofsToBuyerWallet,
  withDeadline,
  isTimeoutError,
} from "../wallet-recovery";

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  clearPendingIncomingProofs: jest.fn(),
  getLocalStorageData: jest.fn(() => ({ tokens: [], history: [] })),
  publishProofEvent: jest.fn(),
  setLocalCashuTokens: jest.fn(),
  stagePendingIncomingProofs: jest.fn().mockResolvedValue("pending-proof-id"),
}));

const helpers = jest.requireMock("@/utils/nostr/nostr-helper-functions") as {
  clearPendingIncomingProofs: jest.Mock;
  getLocalStorageData: jest.Mock;
  publishProofEvent: jest.Mock;
  setLocalCashuTokens: jest.Mock;
  stagePendingIncomingProofs: jest.Mock;
};

const mkProof = (secret: string, amount = 10): Proof =>
  ({
    id: "00d0a1b24d1c1a53",
    amount,
    secret,
    C: "C",
  }) as unknown as Proof;

describe("recoverProofsToBuyerWallet", () => {
  beforeEach(() => {
    window.localStorage.clear();
    helpers.getLocalStorageData.mockReset();
    helpers.publishProofEvent.mockReset();
    helpers.setLocalCashuTokens.mockReset();
    helpers.stagePendingIncomingProofs.mockReset();
    helpers.clearPendingIncomingProofs.mockReset();
    helpers.getLocalStorageData.mockReturnValue({ tokens: [], history: [] });
    helpers.publishProofEvent.mockResolvedValue(true);
    helpers.stagePendingIncomingProofs.mockResolvedValue("pending-proof-id");
  });

  it("appends proofs to the active wallet and writes a history entry", async () => {
    const proofs = [mkProof("s1", 4), mkProof("s2", 6)];
    await recoverProofsToBuyerWallet(
      {} as never,
      {} as never,
      "https://mint.example",
      proofs,
      10
    );

    expect(helpers.setLocalCashuTokens).toHaveBeenCalledWith(proofs);
    expect(helpers.clearPendingIncomingProofs).toHaveBeenCalledWith([
      "pending-proof-id",
    ]);
    expect(window.localStorage.getItem("tokens")).toBeNull();

    const history = JSON.parse(window.localStorage.getItem("history") ?? "[]");
    expect(history[0]).toMatchObject({ type: 3, amount: 10 });
  });

  it("preserves existing wallet contents", async () => {
    helpers.getLocalStorageData.mockReturnValue({
      tokens: [mkProof("existing", 1)],
      history: [{ type: 3, amount: 1, date: 1 }],
    });
    await recoverProofsToBuyerWallet(
      {} as never,
      {} as never,
      "https://mint.example",
      [mkProof("new", 2)],
      2
    );
    expect(helpers.setLocalCashuTokens).toHaveBeenCalledWith([
      mkProof("existing", 1),
      mkProof("new", 2),
    ]);
  });

  it("does not throw when proof event publish fails", async () => {
    helpers.publishProofEvent.mockResolvedValueOnce(false);
    await expect(
      recoverProofsToBuyerWallet(
        {} as never,
        {} as never,
        "https://mint.example",
        [mkProof("s1", 5)],
        5
      )
    ).resolves.toBeUndefined();
    expect(helpers.setLocalCashuTokens).toHaveBeenCalledWith([mkProof("s1", 5)]);
    expect(helpers.clearPendingIncomingProofs).not.toHaveBeenCalled();
  });

  it("no-ops on empty proof array", async () => {
    await recoverProofsToBuyerWallet(
      {} as never,
      {} as never,
      "https://mint.example",
      [],
      0
    );
    expect(window.localStorage.getItem("tokens")).toBeNull();
    expect(helpers.publishProofEvent).not.toHaveBeenCalled();
    expect(helpers.setLocalCashuTokens).not.toHaveBeenCalled();
  });
});

describe("withDeadline", () => {
  it("resolves when work finishes before the deadline", async () => {
    await expect(
      withDeadline(() => Promise.resolve("ok"), 100, "test")
    ).resolves.toBe("ok");
  });

  it("rejects with a tagged TimeoutError when work hangs past the deadline", async () => {
    const hang = new Promise<never>(() => {});
    let caught: unknown;
    try {
      await withDeadline(() => hang, 25, "hangwork");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(isTimeoutError(caught)).toBe(true);
    expect((caught as Error).message).toContain("hangwork");
  });

  it("propagates non-timeout rejections unchanged", async () => {
    const boom = new Error("boom");
    await expect(
      withDeadline(() => Promise.reject(boom), 100, "test")
    ).rejects.toBe(boom);
  });
});
