const SATS_PER_BTC = 100_000_000;
const RATE_CACHE_TTL_MS = 60_000;

const rateCache = new Map<string, { satsPerUnit: number; expiresAt: number }>();

function normalizeCurrency(currency: string): string {
  return currency.trim().toLowerCase();
}

async function fetchSatsPerUnit(currency: string): Promise<number> {
  const normalizedCurrency = normalizeCurrency(currency);
  const cached = rateCache.get(normalizedCurrency);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.satsPerUnit;
  }

  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${encodeURIComponent(
      normalizedCurrency
    )}`
  );
  if (!response.ok) {
    throw new Error(`Rate lookup failed for ${currency}`);
  }

  const data = (await response.json()) as {
    bitcoin?: Record<string, number>;
  };
  const btcPrice = data.bitcoin?.[normalizedCurrency];
  if (!btcPrice || btcPrice <= 0) {
    throw new Error(`Unsupported currency conversion for ${currency}`);
  }

  const satsPerUnit = SATS_PER_BTC / btcPrice;
  rateCache.set(normalizedCurrency, {
    satsPerUnit,
    expiresAt: Date.now() + RATE_CACHE_TTL_MS,
  });
  return satsPerUnit;
}

export async function getSatsForAmount(input: {
  amount: number;
  currency: string;
}): Promise<number> {
  const amount = Number(input.amount ?? 0);
  const currency = normalizeCurrency(input.currency || "sats");

  if (!Number.isFinite(amount)) {
    throw new Error("Amount must be a finite number");
  }

  if (currency === "sats" || currency === "sat" || currency === "satoshi") {
    return amount;
  }

  if (currency === "btc" || currency === "bitcoin") {
    return amount * SATS_PER_BTC;
  }

  const satsPerUnit = await fetchSatsPerUnit(currency);
  return amount * satsPerUnit;
}

export async function getProofSecretFingerprint(
  secret: string
): Promise<string> {
  const encoded = new TextEncoder().encode(secret);

  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  const { createHash } = await import("crypto");
  return createHash("sha256").update(encoded).digest("hex");
}
