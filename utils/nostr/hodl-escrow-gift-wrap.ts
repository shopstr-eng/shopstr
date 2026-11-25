import { getEventHash, verifyEvent, type UnsignedEvent } from "nostr-tools";
import type { EventTemplate } from "nostr-tools";
import type { NostrEvent } from "@/utils/nostr/nostr-manager";
import { createGiftWrapEvent } from "@/utils/nostr/gift-wrap";

/**
 * NIP-59 transport for hodl escrow events.
 *
 * This module owns the wrap/unwrap mechanics only. It knows nothing about
 * payment hashes, buyers, sellers or arbiters, and it decides nothing about
 * who is allowed to do what: the one thing it guarantees is that the
 * `pubkey` on a rumor it returns is a key that actually signed the seal the
 * rumor came out of. Turning that key into "this is the order's buyer" is
 * server-hodl-escrow-authorization.ts's job and nothing here substitutes for
 * it. Decryption is not authorization.
 *
 * Why gift wrap a hodl escrow event at all. A signed kind 30410 on a public
 * relay is a permanent, world-readable statement that some pubkey is in a
 * dispute over a specific hold invoice: the `d` tag is the payment hash the
 * buyer and seller both hold, the `p` tag names the arbiter, and the author
 * pubkey names the disputing party. Anyone can read the whole triple, and
 * the free-text reason on top of it. Wrapping the event moves all four
 * behind NIP-44, leaving relays with a kind 1059 from a throwaway key.
 */

export const HODL_ESCROW_GIFT_WRAP_KIND = 1059;
const SEAL_KIND = 13;

/**
 * The minimum a caller must supply to read gift wraps addressed to a key.
 *
 * A browser passes its `NostrSigner` directly — the shape is deliberately
 * the same `decrypt(pubkey, ciphertext)` NIP-07/NIP-46 already expose — and
 * a server passes an adapter over the arbiter's own key (see
 * server-hodl-arbiter-decryptor.ts). Both then run the identical verification
 * pipeline below, so there is only ever one implementation of the checks
 * that decide whether an unwrapped rumor is trustworthy.
 */
export type GiftWrapDecryptor = {
  decrypt(senderPubkey: string, ciphertext: string): Promise<string>;
};

/** The signer shape {@link wrapHodlEscrowRumor} needs; `NostrSigner` satisfies it. */
export type GiftWrapAuthor = {
  encrypt(pubkey: string, plainText: string): Promise<string>;
  sign(event: EventTemplate): Promise<NostrEvent>;
};

/**
 * How many candidate wraps an unwrap pass will attempt to decrypt.
 *
 * A `#p` filter on a pubkey is open to the world: anyone can address a kind
 * 1059 to the arbiter, and each one costs a NIP-44 decrypt attempt. The cap
 * bounds the work a stranger can force per request. Candidates are sorted
 * newest-first before the cap applies, so filling the queue with old junk
 * cannot push a real dispute out of the window.
 */
export const MAX_GIFT_WRAP_CANDIDATES = 500;

/**
 * Builds the unsigned NIP-59 rumor for an escrow event template.
 *
 * The rumor is the real event, minus the signature: same kind, same tags,
 * same content the public event used to carry. It is deliberately never
 * signed — a signed inner event could be lifted out of its wrap and
 * republished in the clear by whoever decrypts it, which is exactly the
 * leak the wrap exists to prevent. Authorship is carried by the seal
 * instead.
 */
export function buildHodlEscrowRumor(
  template: EventTemplate,
  authorPubkey: string
): NostrEvent {
  const bare = {
    pubkey: authorPubkey,
    created_at: template.created_at,
    kind: template.kind,
    tags: template.tags,
    content: template.content,
  };

  return {
    ...bare,
    id: getEventHash(bare as UnsignedEvent),
  } as unknown as NostrEvent;
}

/**
 * Seals a rumor to its author's identity and gift wraps it for one recipient.
 *
 * Delegates to createGiftWrapEvent, the gift-wrap helper this codebase
 * already ships, rather than re-deriving NIP-59: the seal is signed by the
 * caller's real Nostr key (so the recipient can tell who sent it), the wrap
 * is signed by a fresh throwaway key, and both timestamps are randomized
 * into the past to blunt timing correlation on relays.
 */
export async function wrapHodlEscrowRumor(params: {
  template: EventTemplate;
  authorPubkey: string;
  recipientPubkey: string;
  signer: GiftWrapAuthor;
}): Promise<NostrEvent> {
  const { template, authorPubkey, recipientPubkey, signer } = params;

  const rumor = buildHodlEscrowRumor(template, authorPubkey);

  return createGiftWrapEvent(JSON.stringify(rumor), recipientPubkey, {
    signer,
  });
}

function hasRecipientTag(event: NostrEvent, recipientPubkey: string): boolean {
  return (
    Array.isArray(event.tags) &&
    event.tags.some((tag) => tag[0] === "p" && tag[1] === recipientPubkey)
  );
}

/**
 * Unwraps every gift wrap in `events` that this decryptor can open.
 *
 * The checks, and why each one is load-bearing:
 *
 *  1. `verifyEvent(wrap)` — a relay may return anything; an unsigned or
 *     tampered wrap is not worth a decrypt attempt.
 *  2. The wrap carries a `p` tag for `recipientPubkey`. Cosmetic on its own
 *     (the NIP-44 decrypt is the real gate), but it skips the work for wraps
 *     that were never addressed here.
 *  3. The seal is kind 13 with no tags. NIP-59 seals carry no tags at all;
 *     anything else is not a seal and its `pubkey` means nothing.
 *  4. `verifyEvent(seal)` — THE identity check. The seal is signed by the
 *     sender's real key, so this, and only this, is what makes the pubkey
 *     that comes back a claim anyone can rely on. It is the exact
 *     replacement for the `verifyEvent` a public signed event used to get.
 *  5. `rumor.pubkey === seal.pubkey` — the rumor is unsigned, so without
 *     this a sender could seal a rumor attributed to somebody else and have
 *     it come back wearing that pubkey.
 *
 * Anything that fails is skipped rather than thrown on: a `#p` filter
 * returns whatever strangers have addressed to this key, so garbage and
 * forgeries are the expected case and must not take the legitimate events
 * down with them.
 */
export async function unwrapHodlEscrowRumors(params: {
  events: NostrEvent[];
  recipientPubkey: string;
  decryptor: GiftWrapDecryptor;
  maxCandidates?: number;
}): Promise<NostrEvent[]> {
  const {
    events,
    recipientPubkey,
    decryptor,
    maxCandidates = MAX_GIFT_WRAP_CANDIDATES,
  } = params;

  if (typeof recipientPubkey !== "string" || recipientPubkey.length === 0) {
    return [];
  }

  const candidates = [...events]
    .filter(
      (event) =>
        !!event &&
        event.kind === HODL_ESCROW_GIFT_WRAP_KIND &&
        hasRecipientTag(event, recipientPubkey)
    )
    .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
    .slice(0, maxCandidates);

  const rumors: NostrEvent[] = [];

  for (const wrap of candidates) {
    try {
      if (!verifyEvent(wrap as never)) continue;

      const sealJson = await decryptor.decrypt(wrap.pubkey, wrap.content);
      const seal = JSON.parse(sealJson);
      if (!seal || seal.kind !== SEAL_KIND) continue;
      if (!Array.isArray(seal.tags) || seal.tags.length !== 0) continue;
      if (!verifyEvent(seal)) continue;

      const rumorJson = await decryptor.decrypt(seal.pubkey, seal.content);
      const rumor = JSON.parse(rumorJson);
      if (!rumor || rumor.pubkey !== seal.pubkey) continue;

      rumors.push(rumor as NostrEvent);
    } catch {
      // A wrap addressed to someone else, a payload that is not JSON, a
      // seal this key cannot open: all ordinary, none of them a reason to
      // abandon the rest of the list.
      continue;
    }
  }

  return rumors;
}
