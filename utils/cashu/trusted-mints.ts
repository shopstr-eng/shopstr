const DEFAULT_TRUSTED_MINT_URL = "https://mint.minibits.cash/Bitcoin";

function normalizeMintUrl(mintUrl: string): string {
  const parsed = new URL(mintUrl);

  if (parsed.protocol !== "https:") {
    throw new Error("Trusted mint URLs must use HTTPS");
  }

  return parsed.toString().replace(/\/$/, "");
}

export function getTrustedMintUrl(): string {
  const configuredMint = process.env.SHOPSTR_TRUSTED_MINT_URL?.trim();
  return normalizeMintUrl(configuredMint || DEFAULT_TRUSTED_MINT_URL);
}
