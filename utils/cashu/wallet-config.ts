import { generateSecretKey, getPublicKey } from "nostr-tools";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import type {
  TemporaryWalletConfigV1,
  WalletConfig,
} from "@/utils/types/types";

export type Nip60WalletConfig = WalletConfig;

export type ParsedWalletConfig = {
  mints: string[];
  cashuPubkey?: string;
  cashuPrivkey?: string;
};

export function isLegacyWalletConfig(data: unknown): data is Nip60WalletConfig {
  return Array.isArray(data);
}

export function isWalletConfigV1(
  data: unknown
): data is TemporaryWalletConfigV1 {
  return (
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    (data as TemporaryWalletConfigV1).version === 1
  );
}

export function extractMintsFromLegacy(data: Nip60WalletConfig): string[] {
  const mints: string[] = [];
  for (const entry of data) {
    if (entry[0] === "mint" && typeof entry[1] === "string") {
      mints.push(entry[1]);
    }
  }
  return mints;
}

export function extractPrivkeyFromNip60(
  data: Nip60WalletConfig
): string | undefined {
  const privkey = data.find(
    (entry) => entry[0] === "privkey" && typeof entry[1] === "string"
  )?.[1];

  return normalizeCashuPrivkey(privkey);
}

export function normalizeCashuPrivkey(privkey?: string): string | undefined {
  const normalized = privkey?.trim().toLowerCase();
  return normalized && /^[0-9a-f]{64}$/.test(normalized)
    ? normalized
    : undefined;
}

export function deriveCashuPubkey(cashuPrivkey?: string): string | undefined {
  const normalizedPrivkey = normalizeCashuPrivkey(cashuPrivkey);
  if (!normalizedPrivkey) return undefined;

  try {
    return getPublicKey(hexToBytes(normalizedPrivkey));
  } catch {
    return undefined;
  }
}

export function parseWalletConfigContent(data: unknown): ParsedWalletConfig {
  if (isLegacyWalletConfig(data)) {
    const cashuPrivkey = extractPrivkeyFromNip60(data);
    const cashuPubkey = deriveCashuPubkey(cashuPrivkey);
    const parsed: ParsedWalletConfig = {
      mints: extractMintsFromLegacy(data),
    };
    if (cashuPrivkey && cashuPubkey) {
      parsed.cashuPrivkey = cashuPrivkey;
      parsed.cashuPubkey = cashuPubkey;
    }
    return {
      ...parsed,
    };
  }

  if (isWalletConfigV1(data)) {
    const mints = Array.isArray(data.mints)
      ? data.mints.filter((mint): mint is string => typeof mint === "string")
      : [];

    const cashuPrivkey = normalizeCashuPrivkey(data.cashuPrivkey);
    const cashuPubkey = cashuPrivkey
      ? deriveCashuPubkey(cashuPrivkey)
      : typeof data.cashuPubkey === "string"
        ? data.cashuPubkey
        : undefined;
    const parsed: ParsedWalletConfig = {
      mints,
    };
    if (cashuPrivkey) parsed.cashuPrivkey = cashuPrivkey;
    if (cashuPubkey) parsed.cashuPubkey = cashuPubkey;
    return parsed;
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
  if (parsed.cashuPubkey === undefined || parsed.cashuPrivkey === undefined) {
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
  cashuPrivkey: string,
  mints: string[]
): WalletConfig {
  return [
    ["privkey", normalizeCashuPrivkey(cashuPrivkey) ?? cashuPrivkey],
    ...mints.filter(Boolean).map((mint) => ["mint", mint]),
  ];
}
