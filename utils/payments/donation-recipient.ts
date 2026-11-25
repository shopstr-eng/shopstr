import { isHexPubkey } from "@/utils/nostr/pubkey";

/**
 * Nostr pubkey (64-char hex) that receives sale-donation tokens at checkout.
 * Configured via NEXT_PUBLIC_DONATION_NOSTR_PUBKEY.
 *
 * Returns null when unset or invalid — checkouts then skip the donation step
 * (the full amount goes to the seller) instead of sending to a stale or
 * malformed address.
 */
export function getDonationRecipientPubkey(): string | null {
  const configured = process.env.NEXT_PUBLIC_DONATION_NOSTR_PUBKEY?.trim();
  if (!configured) return null;
  const normalized = configured.toLowerCase();
  if (!isHexPubkey(normalized)) return null;
  return normalized;
}
