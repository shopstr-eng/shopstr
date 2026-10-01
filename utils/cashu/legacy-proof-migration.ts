import {
  Mint as CashuMint,
  Wallet as CashuWallet,
  Proof,
} from "@cashu/cashu-ts";
import {
  getCachedCashuProofs,
  getLocalStorageData,
  getStoredLegacyCashuProofs,
  publishProofEvent,
  removeStoredLegacyCashuProofs,
  setCachedCashuProofs,
} from "@/utils/nostr/nostr-helper-functions";

type Nostr = Parameters<typeof publishProofEvent>[0];
type Signer = Parameters<typeof publishProofEvent>[1];

export interface LegacyCashuProofMigrationResult {
  total: number;
  alreadyPersisted: number;
  migrated: number;
  remaining: number;
  failedMints: string[];
}

export interface LegacyCashuProofMigrationOptions {
  persistedProofs?: Proof[];
  loadMintKeysetIds?: (mintUrl: string) => Promise<string[]>;
}

const getProofKey = (proof: Partial<Proof>): string | undefined => {
  if (typeof proof.secret === "string" && proof.secret.length > 0) {
    return `secret:${proof.secret}`;
  }
  if (typeof proof.C === "string" && proof.C.length > 0) {
    return `C:${proof.C}`;
  }
  return undefined;
};

const getUniqueProofs = (proofs: Proof[]): Proof[] => {
  const seenProofs = new Set<string>();
  const uniqueProofs: Proof[] = [];

  for (const proof of proofs) {
    const proofKey = getProofKey(proof);
    if (!proofKey || seenProofs.has(proofKey)) continue;
    seenProofs.add(proofKey);
    uniqueProofs.push(proof);
  }

  return uniqueProofs;
};

const proofAmountToNumber = (proof: Proof): number => {
  const amount = proof.amount as unknown;

  if (typeof amount === "number") return amount;
  if (
    amount &&
    typeof amount === "object" &&
    "toNumber" in amount &&
    typeof amount.toNumber === "function"
  ) {
    return amount.toNumber();
  }

  return Number(amount) || 0;
};

const defaultLoadMintKeysetIds = async (mintUrl: string): Promise<string[]> => {
  const wallet = new CashuWallet(new CashuMint(mintUrl));
  await wallet.loadMint();
  const keysets = await wallet.keyChain.getKeysets();
  return keysets.map((keyset) => keyset.id);
};

export async function migrateLegacyCashuProofsToWallet(
  nostr: Nostr,
  signer: Signer,
  options: LegacyCashuProofMigrationOptions = {}
): Promise<LegacyCashuProofMigrationResult> {
  const legacyProofs = getStoredLegacyCashuProofs();
  const result: LegacyCashuProofMigrationResult = {
    total: legacyProofs.length,
    alreadyPersisted: 0,
    migrated: 0,
    remaining: legacyProofs.length,
    failedMints: [],
  };

  if (legacyProofs.length === 0) return result;

  const persistedProofKeys = new Set(
    (options.persistedProofs ?? []).map(getProofKey).filter(Boolean)
  );
  const alreadyPersistedProofs = legacyProofs.filter((proof) => {
    const proofKey = getProofKey(proof);
    return proofKey ? persistedProofKeys.has(proofKey) : false;
  });

  if (alreadyPersistedProofs.length > 0) {
    setCachedCashuProofs(
      getUniqueProofs([...getCachedCashuProofs(), ...alreadyPersistedProofs])
    );
    removeStoredLegacyCashuProofs(alreadyPersistedProofs);
    result.alreadyPersisted = alreadyPersistedProofs.length;
  }

  let remainingProofs = getStoredLegacyCashuProofs();
  const { mints } = getLocalStorageData();
  const loadMintKeysetIds =
    options.loadMintKeysetIds ?? defaultLoadMintKeysetIds;

  for (const mint of mints) {
    if (remainingProofs.length === 0) break;

    try {
      const mintKeysetIds = new Set(await loadMintKeysetIds(mint));
      const mintProofs = remainingProofs.filter((proof) =>
        mintKeysetIds.has(proof.id)
      );
      if (mintProofs.length === 0) continue;

      const amount = mintProofs
        .reduce((total, proof) => total + proofAmountToNumber(proof), 0)
        .toString();

      await publishProofEvent(nostr, signer, mint, mintProofs, "in", amount);
      setCachedCashuProofs(
        getUniqueProofs([...getCachedCashuProofs(), ...mintProofs])
      );
      removeStoredLegacyCashuProofs(mintProofs);
      result.migrated += mintProofs.length;

      const migratedProofKeys = new Set(
        mintProofs.map(getProofKey).filter(Boolean)
      );
      remainingProofs = remainingProofs.filter((proof) => {
        const proofKey = getProofKey(proof);
        return !proofKey || !migratedProofKeys.has(proofKey);
      });
    } catch (error) {
      result.failedMints.push(mint);
      console.warn(
        `[cashu-migration] failed to migrate legacy proofs for ${mint}:`,
        error
      );
    }
  }

  result.remaining = getStoredLegacyCashuProofs().length;
  return result;
}
