const MAX_SAFE_SATS_AMOUNT = Number.MAX_SAFE_INTEGER;

export function toCashuMintAmountSats(amount: unknown): number {
  const numericAmount =
    typeof amount === "number"
      ? amount
      : typeof amount === "string" && amount.trim() !== ""
        ? Number(amount)
        : NaN;

  if (!Number.isFinite(numericAmount)) {
    throw new Error("Payment amount must be a finite number of sats");
  }

  if (numericAmount < 1) {
    throw new Error("Payment amount must be greater than 0 sats");
  }

  const satsAmount = Math.ceil(numericAmount);

  if (!Number.isSafeInteger(satsAmount)) {
    throw new Error("Payment amount is too large to invoice safely");
  }

  if (satsAmount > MAX_SAFE_SATS_AMOUNT) {
    throw new Error("Payment amount is too large to invoice safely");
  }

  return satsAmount;
}
