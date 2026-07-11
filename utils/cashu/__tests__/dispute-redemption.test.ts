import { Proof } from "@cashu/cashu-ts";

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  publishProofEvent: jest.fn().mockResolvedValue(undefined),
}));

const mockDecodeToken = jest.fn();
const mockLoadMint = jest.fn().mockResolvedValue(undefined);
const mockReceive = jest.fn();

jest.mock("@cashu/cashu-ts", () => ({
  ...jest.requireActual("@cashu/cashu-ts"),
  getTokenMetadata: jest.fn().mockReturnValue({
    mint: "https://mint.example",
    unit: "sat",
  }),
  signP2PKProof: jest.fn((proof: any, privkey: string) => ({
    ...proof,
    witness: { signatures: [`sig-from-${privkey}-for-${proof.secret}`] },
  })),
  Mint: jest.fn().mockImplementation(() => ({})),
  Wallet: jest.fn().mockImplementation(() => ({
    loadMint: mockLoadMint,
    decodeToken: mockDecodeToken,
    receive: mockReceive,
  })),
}));

import { publishProofEvent } from "@/utils/nostr/nostr-helper-functions";
import {
  createPartialRedemption,
  combineAndRedeem,
} from "../dispute-redemption";

const mkProof = (secret: string, amount = 10): Proof =>
  ({
    id: "00d0a1b24d1c1a53",
    amount,
    secret,
    C: `C-${secret}`,
  }) as unknown as Proof;

describe("createPartialRedemption", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("decodes the token and returns one signature per original, undecorated proof", async () => {
    const proofs = [mkProof("secret-a"), mkProof("secret-b")];
    mockDecodeToken.mockReturnValue({ mint: "https://mint.example", proofs });

    const result = await createPartialRedemption(
      "cashuAtoken",
      "buyer-privkey"
    );

    expect(result.proofs).toBe(proofs);
    expect(result.proofs.every((p) => p.witness === undefined)).toBe(true);
    expect(result.partialSigs).toEqual([
      "sig-from-buyer-privkey-for-secret-a",
      "sig-from-buyer-privkey-for-secret-b",
    ]);
  });
});

describe("combineAndRedeem", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it("combines two signature sets into each proof's witness and calls wallet.receive with no privkey option", async () => {
    const proofs = [mkProof("secret-a"), mkProof("secret-b")];
    const freshProofs = [mkProof("fresh-a"), mkProof("fresh-b")];
    mockReceive.mockResolvedValue(freshProofs);

    const nostr = {} as any;
    const signer = {} as any;

    const result = await combineAndRedeem({
      proofs,
      sig1: ["buyer-sig-a", "buyer-sig-b"],
      sig2: ["seller-sig-a", "seller-sig-b"],
      tokenMint: "https://mint.example",
      tokenAmount: 20,
      nostr,
      signer,
      mints: [],
      tokens: [],
      history: [],
    });

    expect(result).toEqual({ success: true });

    expect(mockReceive).toHaveBeenCalledTimes(1);
    const [receivedProofs, receivedOptions] = mockReceive.mock.calls[0]!;
    expect(receivedOptions).toBeUndefined();
    expect(receivedProofs).toEqual([
      {
        ...proofs[0],
        witness: JSON.stringify({
          signatures: ["buyer-sig-a", "seller-sig-a"],
        }),
      },
      {
        ...proofs[1],
        witness: JSON.stringify({
          signatures: ["buyer-sig-b", "seller-sig-b"],
        }),
      },
    ]);

    expect(JSON.parse(localStorage.getItem("tokens")!)).toEqual(freshProofs);
    expect(JSON.parse(localStorage.getItem("mints")!)).toEqual([
      "https://mint.example",
    ]);
    expect(publishProofEvent).toHaveBeenCalledWith(
      nostr,
      signer,
      "https://mint.example",
      freshProofs,
      "in",
      "20"
    );
  });

  it("returns a non-throwing error result when signature counts mismatch", async () => {
    const result = await combineAndRedeem({
      proofs: [mkProof("secret-a")],
      sig1: ["only-one"],
      sig2: [],
      tokenMint: "https://mint.example",
      tokenAmount: 10,
      nostr: {} as any,
      signer: {} as any,
      mints: [],
      tokens: [],
      history: [],
    });

    expect(result.success).toBe(false);
    expect(mockReceive).not.toHaveBeenCalled();
  });

  it("returns a non-throwing error result when the mint rejects the swap", async () => {
    mockReceive.mockRejectedValue(new Error("threshold not met"));

    const result = await combineAndRedeem({
      proofs: [mkProof("secret-a")],
      sig1: ["a"],
      sig2: ["b"],
      tokenMint: "https://mint.example",
      tokenAmount: 10,
      nostr: {} as any,
      signer: {} as any,
      mints: [],
      tokens: [],
      history: [],
    });

    expect(result).toEqual({ success: false, error: "threshold not met" });
  });
});
