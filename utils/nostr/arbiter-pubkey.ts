/**
 * Server-side resolution of the arbiter's Nostr identity.
 *
 * Escrow records that name an arbiter must take the key from here and nowhere
 * else. It is the one party on a commitment that is neither authenticated
 * (like the buyer, via NIP-98) nor signed for (like the seller, via their
 * listing event), so a caller-supplied value would be an unverifiable claim
 * about who is allowed to rule on the order.
 */

const NOSTR_PUBKEY_HEX = /^[0-9a-f]{64}$/i;

/**
 * The configured arbiter pubkey as 64 lowercase hex characters, or null if it
 * is unset or malformed.
 *
 * `ARBITER_NOSTR_PUBKEY` (server-only) wins over the `NEXT_PUBLIC_` copy —
 * the same precedence `pages/api/arbiter/rule.ts` uses — so an operator can
 * keep a server-side value without the browser bundle disagreeing.
 *
 * A value that is not 32 bytes of hex counts as unconfigured rather than
 * being passed through: the `.env.example` placeholder is a non-hex string,
 * and writing it into a commitment row would name an arbiter that nobody can
 * ever sign as.
 */
export function getConfiguredArbiterNostrPubkey(): string | null {
  const configured = (
    process.env.ARBITER_NOSTR_PUBKEY ||
    process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY ||
    ""
  ).trim();

  if (!NOSTR_PUBKEY_HEX.test(configured)) return null;
  return configured.toLowerCase();
}
