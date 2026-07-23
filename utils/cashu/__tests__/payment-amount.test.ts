import { toCashuMintAmountSats } from "../payment-amount";

describe("toCashuMintAmountSats", () => {
  it("accepts positive integer sat amounts", () => {
    expect(toCashuMintAmountSats(21)).toBe(21);
  });

  it("rounds fractional sat amounts up at the Cashu quote boundary", () => {
    expect(toCashuMintAmountSats(21.1)).toBe(22);
  });

  it("rejects non-finite amounts", () => {
    expect(() => toCashuMintAmountSats(Number.NaN)).toThrow(
      "finite number of sats"
    );
    expect(() => toCashuMintAmountSats(Number.POSITIVE_INFINITY)).toThrow(
      "finite number of sats"
    );
  });

  it("rejects zero and negative amounts", () => {
    expect(() => toCashuMintAmountSats(0)).toThrow("greater than 0 sats");
    expect(() => toCashuMintAmountSats(-1)).toThrow("greater than 0 sats");
  });

  it("rejects amounts above the safe integer range", () => {
    expect(() => toCashuMintAmountSats(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      "too large"
    );
  });
});
