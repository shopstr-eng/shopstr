import type { Proof } from "@cashu/cashu-ts";

export function proofAmountToNumber(p: Pick<Proof, "amount">): number {
  const a = p?.amount as unknown;
  if (typeof a === "number") return Number.isFinite(a) ? a : 0;
  if (a && typeof (a as { toNumber?: () => number }).toNumber === "function") {
    const n = (a as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(a);
  return Number.isFinite(n) ? n : 0;
}

export function sumProofAmounts(proofs: Array<Pick<Proof, "amount">>): number {
  if (!Array.isArray(proofs) || proofs.length === 0) return 0;
  return proofs.reduce((acc, p) => acc + proofAmountToNumber(p), 0);
}
