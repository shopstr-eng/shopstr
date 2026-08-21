import { Proof } from "@cashu/cashu-ts";
import {
  getCachedCashuProofs,
  getLocalStorageData,
  setCachedCashuProofs,
} from "@/utils/nostr/nostr-helper-functions";

export function getUniqueProofsBySecret(proofs: Proof[]): Proof[] {
  const seenSecrets = new Set<string>();
  return proofs.filter((proof) => {
    if (seenSecrets.has(proof.secret)) return false;
    seenSecrets.add(proof.secret);
    return true;
  });
}

export function creditProofsToLocalWallet(
  proofs: Proof[],
  amount: number,
  historyType: number
): void {
  if (typeof window === "undefined") return;
  if (!proofs || proofs.length === 0) return;

  const { history } = getLocalStorageData();
  const proofArray = getUniqueProofsBySecret([
    ...getCachedCashuProofs(),
    ...proofs,
  ]);
  setCachedCashuProofs(proofArray);

  try {
    window.localStorage.setItem(
      "history",
      JSON.stringify([
        {
          type: historyType,
          amount,
          date: Math.floor(Date.now() / 1000),
        },
        ...history,
      ])
    );
  } catch (error) {
    console.warn("Failed to write Cashu wallet history entry:", error);
  }
}
