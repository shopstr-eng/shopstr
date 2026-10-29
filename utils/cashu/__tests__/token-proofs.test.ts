import { getDecodedToken, getEncodedToken, type Proof } from "@cashu/cashu-ts";
import { sumProofAmounts } from "@/utils/cashu/proof-amount";
import { decodeTokenProofs } from "../token-proofs";

const V1_KEYSET_ID = "00" + "a".repeat(14);
const V2_KEYSET_ID = "01" + "b".repeat(64);
const MINT = "https://mint.example.com";

const proof = (id: string, amount: number, n: number) =>
  ({
    id,
    amount,
    secret: `secret-${n}`.padEnd(64, "0"),
    C: "02" + String(n).repeat(64).slice(0, 64),
  }) as unknown as Proof;

describe("decodeTokenProofs", () => {
  it("reads a token that uses a v1 keyset id", () => {
    const token = getEncodedToken({
      mint: MINT,
      proofs: [proof(V1_KEYSET_ID, 8, 1)],
    });

    const proofs = decodeTokenProofs(token);

    expect(proofs).toHaveLength(1);
    expect(proofs![0]!.secret).toBe(proof(V1_KEYSET_ID, 8, 1).secret);
  });

  it("reads a token that uses a v2 keyset id", () => {
    const token = getEncodedToken({
      mint: MINT,
      proofs: [proof(V2_KEYSET_ID, 8, 1), proof(V2_KEYSET_ID, 2, 2)],
    });

    // This is the call the escrow routes used to make.
    expect(() => getDecodedToken(token, [])).toThrow(/short keyset ID/i);

    const proofs = decodeTokenProofs(token);

    expect(proofs).toHaveLength(2);
    expect(sumProofAmounts(proofs!)).toBe(10);
  });

  it("sums amounts as numbers for a token with many proofs", () => {
    const token = getEncodedToken({
      mint: MINT,
      proofs: [64, 32, 16, 8, 4, 2, 1].map((amount, i) =>
        proof(V2_KEYSET_ID, amount, i + 1)
      ),
    });

    expect(sumProofAmounts(decodeTokenProofs(token)!)).toBe(127);
  });

  it.each(["", "garbage", "cashuB!!!", "cashuBpGFteCJo"])(
    "returns null for the malformed token %p",
    (token) => {
      expect(decodeTokenProofs(token)).toBeNull();
    }
  );
});
