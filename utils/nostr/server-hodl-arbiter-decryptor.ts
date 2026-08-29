import { nip19, nip44 } from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils.js";
import type { GiftWrapDecryptor } from "@/utils/nostr/hodl-escrow-gift-wrap";

/**
 * Server-side NIP-44 decryption with the arbiter's own Nostr key.
 *
 * Gift-wrapped hodl disputes are addressed to the arbiter, so the arbiter's
 * browser can read them with its signer. The resolve endpoint has to read
 * the same events — requireActionableDispute cannot check that a dispute
 * exists without seeing one — and it does that with the server-only
 * ARBITER_NOSTR_PRIVKEY the arbiter API already depends on for outgoing
 * escrow DMs (see server-gift-wrap.ts).
 *
 * Server-only: this module reads a private key out of the environment.
 * Nothing in a browser bundle may import it.
 *
 * Reading these events is emphatically not permission to act on them. The
 * key gets the server as far as "somebody signed a dispute rumor"; whether
 * that somebody is a party to the order is decided afterwards, unchanged, by
 * evaluateHodlDisputeActionability against the commitment row.
 */

export type HodlArbiterKeyFailureReason = "arbiter_key_unavailable";

/**
 * Raised when the arbiter's private key is not configured.
 *
 * Thrown rather than returned as null for the reason that runs through the
 * whole escrow path: a caller that forgets to check a returned value goes on
 * to an empty dispute list and answers "nobody disputed this order", which
 * is a verdict about a question nobody could ask. A throw forces the
 * endpoint to answer "we could not check" instead.
 */
export class HodlArbiterKeyUnavailableError extends Error {
  readonly reason: HodlArbiterKeyFailureReason;

  constructor(message: string) {
    super(message);
    this.name = "HodlArbiterKeyUnavailableError";
    this.reason = "arbiter_key_unavailable";
  }
}

const HEX_32_BYTE = /^[0-9a-f]{64}$/i;

function toPrivkeyBytes(nsecOrHex: string): Uint8Array {
  if (nsecOrHex.startsWith("nsec")) {
    let decoded;
    try {
      decoded = nip19.decode(nsecOrHex);
    } catch {
      // nip19's bech32 errors quote the offending characters of the input.
      // Swallowed rather than chained on: the input here is a private key,
      // and this message reaches server logs.
      throw new HodlArbiterKeyUnavailableError(
        "ARBITER_NOSTR_PRIVKEY is not a valid nsec"
      );
    }
    if (decoded.type !== "nsec") {
      throw new HodlArbiterKeyUnavailableError(
        "ARBITER_NOSTR_PRIVKEY is not a valid nsec"
      );
    }
    return decoded.data as Uint8Array;
  }
  if (!HEX_32_BYTE.test(nsecOrHex)) {
    throw new HodlArbiterKeyUnavailableError(
      "ARBITER_NOSTR_PRIVKEY must be 32 bytes of hex, or an nsec"
    );
  }
  return hexToBytes(nsecOrHex);
}

/**
 * Wraps a raw private key as a {@link GiftWrapDecryptor}.
 *
 * The key never leaves this closure: the returned object exposes only
 * `decrypt`, so an unwrap pass gets the ability to read a payload and no
 * ability to sign anything with the arbiter's identity.
 */
export function createArbiterGiftWrapDecryptor(
  privkeyHexOrNsec: string
): GiftWrapDecryptor {
  const privkeyBytes = toPrivkeyBytes(privkeyHexOrNsec.trim());

  return {
    async decrypt(senderPubkey: string, ciphertext: string): Promise<string> {
      const conversationKey = nip44.getConversationKey(
        privkeyBytes,
        senderPubkey
      );
      return nip44.decrypt(ciphertext, conversationKey);
    },
  };
}

/**
 * Builds the decryptor from the environment.
 *
 * @throws {HodlArbiterKeyUnavailableError} when ARBITER_NOSTR_PRIVKEY is
 * unset or malformed. The message names the variable and never its value.
 */
export function getServerArbiterGiftWrapDecryptor(): GiftWrapDecryptor {
  const configured = process.env.ARBITER_NOSTR_PRIVKEY;
  if (typeof configured !== "string" || configured.trim().length === 0) {
    throw new HodlArbiterKeyUnavailableError(
      "ARBITER_NOSTR_PRIVKEY is not configured, so gift-wrapped disputes cannot be read"
    );
  }
  return createArbiterGiftWrapDecryptor(configured);
}
