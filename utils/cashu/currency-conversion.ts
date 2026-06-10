import { getSatoshiValue } from "@getalby/lightning-tools";
import { toCashuMintAmountSats } from "@/utils/cashu/payment-amount";

export async function convertCurrencyAmountToSats(
  amount: number,
  currency: string
): Promise<number> {
  if (!Number.isFinite(amount)) {
    throw new Error("Payment amount must be finite");
  }

  const normalizedCurrency = currency.toLowerCase();

  if (normalizedCurrency === "sats" || normalizedCurrency === "sat") {
    return toCashuMintAmountSats(amount);
  }

  if (normalizedCurrency === "btc") {
    return toCashuMintAmountSats(amount * 100_000_000);
  }

  const sats = await getSatoshiValue({
    amount,
    currency,
  });

  return toCashuMintAmountSats(sats);
}
