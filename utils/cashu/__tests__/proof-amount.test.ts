import {
  cashuAmountToNumber,
  sumProofAmounts,
} from "@/utils/cashu/proof-amount";

describe("proof-amount", () => {
  it("accepts cashu-ts Amount-like objects", () => {
    expect(cashuAmountToNumber({ toNumber: () => 21 })).toBe(21);
  });

  it("accepts JSON-restored numeric amounts", () => {
    expect(
      sumProofAmounts([
        { amount: 10 } as any,
        { amount: "20" } as any,
        { amount: { toNumber: () => 3 } } as any,
      ])
    ).toBe(33);
  });

  it("rejects invalid proof amounts", () => {
    expect(() => cashuAmountToNumber({})).toThrow("Invalid Cashu proof amount");
    expect(() => cashuAmountToNumber("not-a-number")).toThrow(
      "Invalid Cashu proof amount"
    );
  });
});
