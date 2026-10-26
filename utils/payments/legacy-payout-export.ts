import { getEncodedToken, type Proof } from "@cashu/cashu-ts";
import { storage, STORAGE_KEYS } from "@/utils/storage";
import type { PendingSellerLightningPayout } from "./pending-lightning-payouts";

/**
 * Build a Cashu token containing a legacy (pre-binding) pending payout's
 * proofs so the buyer can redeem them in any Cashu wallet that supports the
 * record's mint.
 *
 * This is the sanctioned recovery path for records written before
 * buyerPubkey binding existed. It is safe because it only reveals bearer
 * data already stored in this browser — it never moves funds between
 * accounts. For that reason it MUST refuse bound records: a record with a
 * buyerPubkey belongs to that account and goes through the owner-checked
 * resolver, never through export.
 *
 * Proofs already present in the local token store are excluded so the
 * exported token cannot double-claim funds the wallet already holds, and
 * proofs are deduped by secret at mutation time (quarantined/recoverable
 * lists can overlap across re-recorded attempts).
 */
export function buildLegacyPayoutExportToken(
  record: PendingSellerLightningPayout
): string {
  if (record.buyerPubkey) {
    throw new Error(
      "This payout is bound to an account. Use check & recover instead of exporting it."
    );
  }

  const walletSecrets = new Set(
    storage
      .getJson<Proof[]>(STORAGE_KEYS.TOKENS, [])
      .map((token) => token.secret)
  );

  const seen = new Set<string>();
  const exportable: Proof[] = [];
  for (const proof of [
    ...record.quarantinedProofs,
    ...record.recoverableProofs,
  ]) {
    if (seen.has(proof.secret)) continue;
    seen.add(proof.secret);
    if (walletSecrets.has(proof.secret)) continue;
    exportable.push(proof);
  }

  if (exportable.length === 0) {
    throw new Error(
      "All of this record's proofs are already in your wallet — there is nothing to export."
    );
  }

  return getEncodedToken({
    mint: record.mintUrl,
    proofs: exportable,
    memo: `Shopstr pending payout recovery (order ${record.orderId})`,
  });
}
