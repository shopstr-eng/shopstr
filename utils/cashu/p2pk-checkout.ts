import type { ProfileData } from "@/utils/types/types";

export type P2pkProfileSettings = NonNullable<ProfileData["content"]["p2pk"]>;

export function getBuyerReclaimKeys(
  buyerContent: ProfileData["content"] | undefined,
  payerPubkey: string
): string[] {
  const keys = buyerContent?.p2pk?.reclaimKeys;
  if (keys?.length) return keys;
  return [payerPubkey];
}

export function buildP2pkSwapOptions(
  sellerP2pk: P2pkProfileSettings | undefined,
  buyerReclaimKeys: string[]
): { pubkey: string; locktime: number; refundKeys: string[] } | undefined {
  if (!sellerP2pk?.enabled || !sellerP2pk.pubkey) return undefined;

  const days = sellerP2pk.refundDelayDays;
  if (!days || days <= 0) return undefined;

  return {
    pubkey: sellerP2pk.pubkey,
    locktime: Math.floor(Date.now() / 1000) + days * 24 * 60 * 60,
    refundKeys: buyerReclaimKeys, // cashu-ts / NUT-11 reclaim path
  };
}

export function buildP2pkOutputConfig(
  sellerP2pk: P2pkProfileSettings | undefined,
  buyerContent: ProfileData["content"] | undefined,
  payerPubkey: string
) {
  const reclaimKeys = getBuyerReclaimKeys(buyerContent, payerPubkey);
  const options = buildP2pkSwapOptions(sellerP2pk, reclaimKeys);
  if (!options) return undefined;

  return {
    send: {
      type: "p2pk" as const,
      options,
    },
  };
}

export function isSellerP2pkEscrowActive(
  sellerP2pk: P2pkProfileSettings | undefined
): boolean {
  return Boolean(
    sellerP2pk?.enabled &&
    sellerP2pk.pubkey &&
    sellerP2pk.refundDelayDays &&
    sellerP2pk.refundDelayDays > 0
  );
}
