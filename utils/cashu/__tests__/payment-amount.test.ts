import { toCashuMintAmountSats } from "@/utils/cashu/payment-amount";

describe("toCashuMintAmountSats", () => {
  it("rounds fractional positive sat amounts up", () => {
    expect(toCashuMintAmountSats(1.1)).toBe(2);
    expect(toCashuMintAmountSats("10")).toBe(10);
  });

  it("rejects zero, non-finite, and unsafe amounts", () => {
    expect(() => toCashuMintAmountSats(0)).toThrow(
      "Payment amount must be greater than 0 sats"
    );
    expect(() => toCashuMintAmountSats(Number.NaN)).toThrow(
      "Payment amount must be a finite number of sats"
    );
    expect(() => toCashuMintAmountSats(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      "Payment amount is too large to invoice safely"
    );
  });
});
