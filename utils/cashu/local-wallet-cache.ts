import { Proof } from "@cashu/cashu-ts";
import { getLocalStorageData } from "@/utils/nostr/nostr-helper-functions";

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

  const { tokens, history } = getLocalStorageData();
  const proofArray = getUniqueProofsBySecret([...tokens, ...proofs]);
  window.localStorage.setItem("tokens", JSON.stringify(proofArray));
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
}
