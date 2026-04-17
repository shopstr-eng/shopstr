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

export const isSatsCurrency = (cur: string): boolean => {
  const c = cur.toLowerCase();
  return c === "sats" || c === "sat" || c === "satoshi";
};

/**
 * Stripe enforces a minimum charge of $0.50 USD (or its smallest-unit
 * equivalent) on every PaymentIntent. We mirror that floor in the UI so the
 * displayed price always matches what Stripe will actually charge.
 */
export const STRIPE_MINIMUM_CHARGE_USD = 0.5;
export const STRIPE_MINIMUM_CHARGE_CENTS = 50;

export const applyStripeFloor = (amount: number, currency: string): number => {
  if (!isFinite(amount) || amount <= 0) return STRIPE_MINIMUM_CHARGE_USD;
  const c = currency.toLowerCase();
  if (isSatsCurrency(c) || c === "btc") {
    // For crypto-denominated displays we keep the original amount; the floor
    // is surfaced via the USD-equivalent line which is computed separately.
    return amount;
  }
  if (ZERO_DECIMAL_CURRENCIES.has(c)) {
    return Math.max(STRIPE_MINIMUM_CHARGE_CENTS, Math.ceil(amount));
  }
  // Standard fiat — round up to the nearest cent, then enforce the floor.
  return Math.max(STRIPE_MINIMUM_CHARGE_USD, Math.ceil(amount * 100) / 100);
};

/** True when the displayed amount is being raised by the Stripe floor. */
export const isAtStripeFloor = (amount: number, currency: string): boolean => {
  if (!isFinite(amount) || amount <= 0) return true;
  const c = currency.toLowerCase();
  if (isSatsCurrency(c) || c === "btc") return false;
  if (ZERO_DECIMAL_CURRENCIES.has(c)) {
    return Math.ceil(amount) < STRIPE_MINIMUM_CHARGE_CENTS;
  }
  return Math.ceil(amount * 100) / 100 < STRIPE_MINIMUM_CHARGE_USD;
};

/**
 * Round a price UP to its smallest displayable unit for the given currency.
 * - Sats / zero-decimal fiat → ceil to the nearest whole unit
 * - All other fiat → ceil to the nearest cent
 * BTC is treated as 8-decimal precision (1 satoshi).
 */
export const roundUpPrice = (amount: number, currency: string): number => {
  if (!isFinite(amount) || amount <= 0) return 0;
  const c = currency.toLowerCase();
  if (isSatsCurrency(c) || ZERO_DECIMAL_CURRENCIES.has(c)) {
    return Math.ceil(amount);
  }
  if (c === "btc") {
    return Math.ceil(amount * 100000000) / 100000000;
  }
  return Math.ceil(amount * 100) / 100;
};

export const toSmallestUnit = (amount: number, cur: string): number => {
  return ZERO_DECIMAL_CURRENCIES.has(cur.toLowerCase())
    ? Math.ceil(amount)
    : Math.ceil(amount * 100);
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
      amountSmallest: Math.ceil(usdAmount * 100),
      stripeCurrency: "usd",
    };
  }
  return {
    amountSmallest: toSmallestUnit(amount, currency),
    stripeCurrency: currency.toLowerCase(),
  };
};
