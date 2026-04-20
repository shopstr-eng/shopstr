import { Proof } from "@cashu/cashu-ts";
import {
  recoverProofsToBuyerWallet,
  withDeadline,
  isTimeoutError,
} from "../wallet-recovery";

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  getLocalStorageData: jest.fn(() => ({ tokens: [], history: [] })),
  publishProofEvent: jest.fn(),
}));

const helpers = jest.requireMock("@/utils/nostr/nostr-helper-functions") as {
  getLocalStorageData: jest.Mock;
  publishProofEvent: jest.Mock;
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
    helpers.getLocalStorageData.mockReturnValue({ tokens: [], history: [] });
    helpers.publishProofEvent.mockResolvedValue(undefined);
  });

  it("appends proofs to localStorage tokens and writes a history entry", async () => {
    const proofs = [mkProof("s1", 4), mkProof("s2", 6)];
    await recoverProofsToBuyerWallet(
      {} as never,
      {} as never,
      "https://mint.example",
      proofs,
      10
    );

    const tokens = JSON.parse(window.localStorage.getItem("tokens") ?? "[]");
    expect(tokens).toHaveLength(2);
    expect(tokens.map((p: Proof) => p.secret)).toEqual(["s1", "s2"]);

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
    const tokens = JSON.parse(window.localStorage.getItem("tokens") ?? "[]");
    expect(tokens.map((p: Proof) => p.secret)).toEqual(["existing", "new"]);
  });

  it("does not throw when proof event publish fails", async () => {
    helpers.publishProofEvent.mockRejectedValueOnce(new Error("relay down"));
    await expect(
      recoverProofsToBuyerWallet(
        {} as never,
        {} as never,
        "https://mint.example",
        [mkProof("s1", 5)],
        5
      )
    ).resolves.toBeUndefined();
    const tokens = JSON.parse(window.localStorage.getItem("tokens") ?? "[]");
    expect(tokens).toHaveLength(1);
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
