/** CLTV counts blocks, never a guaranteed number of wall-clock hours. */
export function getHodlPolicy() {
  const cltvDelta = Number(process.env.HODL_HOLD_CLTV_DELTA ?? 80);
  if (!Number.isSafeInteger(cltvDelta) || cltvDelta < 48 || cltvDelta > 144)
    throw new Error("HODL_HOLD_CLTV_DELTA must be 48–144 blocks");
  return {
    cltvDelta,
    safetyBlocks: 18,
    invoiceExpirySeconds: 3600,
    sellerWaitSeconds: 4 * 3600,
    allowShipping: process.env.NEXT_PUBLIC_HODL_ALLOW_SHIPPING === "true",
  };
}
export function holdTiming(
  htlcs: Array<{
    state?: string;
    expiry_height?: number;
    accept_time?: string | number;
  }>
) {
  const active = htlcs.filter(
    (h) => h.state === "ACCEPTED" || h.state === "SETTLED"
  );
  if (!active.length) return {};
  const heights = active.map((h) => Number(h.expiry_height));
  const times = active.map((h) => Number(h.accept_time));
  if (
    heights.some((n) => !Number.isSafeInteger(n) || n <= 0) ||
    times.some((n) => !Number.isSafeInteger(n) || n <= 0)
  )
    throw new Error("Invalid HTLC timing from LND");
  return {
    holdExpiryHeight: Math.min(...heights),
    acceptedAt: Math.max(...times),
  };
}
