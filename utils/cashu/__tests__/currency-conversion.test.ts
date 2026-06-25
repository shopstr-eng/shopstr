const getSatoshiValueMock = jest.fn();

jest.mock("@getalby/lightning-tools", () => ({
  getSatoshiValue: (...args: unknown[]) => getSatoshiValueMock(...args),
}));

import { convertCurrencyAmountToSats } from "@/utils/cashu/currency-conversion";

describe("convertCurrencyAmountToSats", () => {
  beforeEach(() => {
    getSatoshiValueMock.mockReset();
  });

  it("keeps sat-denominated amounts as sats", async () => {
    await expect(convertCurrencyAmountToSats(12, "sats")).resolves.toBe(12);
    expect(getSatoshiValueMock).not.toHaveBeenCalled();
  });

  it("converts bitcoin amounts to sats without an external rate lookup", async () => {
    await expect(convertCurrencyAmountToSats(0.00000012, "btc")).resolves.toBe(
      12
    );
    expect(getSatoshiValueMock).not.toHaveBeenCalled();
  });

  it("rounds fiat conversions up through the exchange-rate helper", async () => {
    getSatoshiValueMock.mockResolvedValue(123.4);

    await expect(convertCurrencyAmountToSats(5, "USD")).resolves.toBe(124);
    expect(getSatoshiValueMock).toHaveBeenCalledWith({
      amount: 5,
      currency: "USD",
    });
  });

  it("rejects fiat conversions that round to zero sats", async () => {
    getSatoshiValueMock.mockResolvedValue(0.4);

    await expect(convertCurrencyAmountToSats(0.01, "USD")).rejects.toThrow(
      "Payment amount must be greater than 0 sats"
    );
  });
});
