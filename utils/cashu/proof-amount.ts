import type { Proof } from "@cashu/cashu-ts";

export function cashuAmountToNumber(amount: unknown): number {
  let value: number;

  if (
    typeof amount === "object" &&
    amount !== null &&
    "toNumber" in amount &&
    typeof amount.toNumber === "function"
  ) {
    value = amount.toNumber();
  } else if (typeof amount === "number" || typeof amount === "string") {
    value = Number(amount);
  } else {
    throw new Error("Invalid Cashu proof amount");
  }

  if (!Number.isFinite(value)) {
    throw new Error("Invalid Cashu proof amount");
  }

  return value;
}

export function proofAmountToNumber(proof: Pick<Proof, "amount">): number {
  return cashuAmountToNumber(proof.amount);
}

export function sumProofAmounts(proofs: Array<Pick<Proof, "amount">>): number {
  return proofs.reduce((sum, proof) => sum + proofAmountToNumber(proof), 0);
}
