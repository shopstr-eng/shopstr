import { getFiatValue } from "@getalby/lightning-tools";

export const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

export const isCrypto = (cur: string): boolean => {
  const c = cur.toLowerCase();
  return c === "sats" || c === "sat" || c === "btc";
};

export const toSmallestUnit = (amount: number, cur: string): number => {
  return ZERO_DECIMAL_CURRENCIES.has(cur.toLowerCase())
    ? Math.round(amount)
    : Math.round(amount * 100);
};

export const satsToUSD = async (sats: number): Promise<number> => {
  const usdAmount = await getFiatValue({
    satoshi: sats,
    currency: "usd",
  });
  return usdAmount;
};

export const convertToSmallestUnit = async (
  amount: number,
  currency: string
): Promise<{ amountSmallest: number; stripeCurrency: string }> => {
  if (isCrypto(currency)) {
    const sats = currency.toLowerCase() === "btc" ? amount * 100000000 : amount;
    const usdAmount = await satsToUSD(sats);
    return {
      amountSmallest: Math.round(usdAmount * 100),
      stripeCurrency: "usd",
    };
  }
  return {
    amountSmallest: toSmallestUnit(amount, currency),
    stripeCurrency: currency.toLowerCase(),
  };
};
