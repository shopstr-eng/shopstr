import { getTokenMetadata, type Proof } from "@cashu/cashu-ts";

export type TokenProof = Omit<Proof, "id">;

// Reads the proofs of an encoded token without the mint's keysets. Tokens from
// v2 keyset mints use short keyset ids, and `getDecodedToken(token, [])` throws
// on them. Callers that only need secrets and amounts don't need the ids.
export function decodeTokenProofs(token: string): TokenProof[] | null {
  try {
    const { incompleteProofs } = getTokenMetadata(token);
    return Array.isArray(incompleteProofs) ? incompleteProofs : null;
  } catch {
    return null;
  }
}
