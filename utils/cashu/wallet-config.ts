import { generateSecretKey, getPublicKey } from "nostr-tools";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { WalletConfig } from "@/utils/types/types";

export type LegacyWalletConfig = string[][];

export type ParsedWalletConfig = {
  mints: string[];
  cashuPubkey?: string;
  cashuPrivkey?: string;
};

export function isLegacyWalletConfig(
  data: unknown
): data is LegacyWalletConfig {
  return Array.isArray(data);
}

export function isWalletConfigV1(data: unknown): data is WalletConfig {
  return (
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    (data as WalletConfig).version === 1
  );
}

export function extractMintsFromLegacy(data: LegacyWalletConfig): string[] {
  const mints: string[] = [];
  for (const entry of data) {
    if (entry[0] === "mint" && typeof entry[1] === "string") {
      mints.push(entry[1]);
    }
  }
  return mints;
}

export function parseWalletConfigContent(data: unknown): ParsedWalletConfig {
  if (isLegacyWalletConfig(data)) {
    return { mints: extractMintsFromLegacy(data) };
  }

  if (isWalletConfigV1(data)) {
    const mints = Array.isArray(data.mints)
      ? data.mints.filter((mint): mint is string => typeof mint === "string")
      : [];

    return {
      mints,
      cashuPubkey:
        typeof data.cashuPubkey === "string" ? data.cashuPubkey : undefined,
      cashuPrivkey:
        typeof data.cashuPrivkey === "string" ? data.cashuPrivkey : undefined,
    };
  }

  return { mints: [] };
}

export function addParsedMints(
  parsed: ParsedWalletConfig,
  mintSet: Set<string>,
  mints: string[]
): void {
  for (const mint of parsed.mints) {
    if (mint && !mintSet.has(mint)) {
      mintSet.add(mint);
      mints.push(mint);
    }
  }
}

export type LatestWalletKeypair = {
  createdAt: number;
  cashuPubkey?: string;
  cashuPrivkey?: string;
};

export function updateLatestWalletKeypair(
  current: LatestWalletKeypair | null,
  eventCreatedAt: number,
  parsed: ParsedWalletConfig
): LatestWalletKeypair | null {
  if (parsed.cashuPubkey === undefined) {
    return current;
  }

  if (!current || eventCreatedAt > current.createdAt) {
    return {
      createdAt: eventCreatedAt,
      cashuPubkey: parsed.cashuPubkey,
      cashuPrivkey: parsed.cashuPrivkey,
    };
  }

  return current;
}

export function applyWalletConfigContent(
  decrypted: string,
  eventCreatedAt: number,
  mintSet: Set<string>,
  mints: string[],
  latestKeypair: LatestWalletKeypair | null
): LatestWalletKeypair | null {
  const data = JSON.parse(decrypted);
  const parsed = parseWalletConfigContent(data);
  addParsedMints(parsed, mintSet, mints);
  return updateLatestWalletKeypair(latestKeypair, eventCreatedAt, parsed);
}

export function generateCashuWalletKeypair(): {
  cashuPubkey: string;
  cashuPrivkey: string;
} {
  const secretKey = generateSecretKey();
  return {
    cashuPubkey: getPublicKey(secretKey),
    cashuPrivkey: bytesToHex(secretKey),
  };
}

export function buildWalletConfigV1(
  cashuPubkey: string,
  cashuPrivkey: string,
  mints: string[]
): WalletConfig {
  return {
    version: 1,
    cashuPubkey,
    cashuPrivkey,
    mints,
  };
}
