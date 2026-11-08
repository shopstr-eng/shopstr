/**
 * Opens a NIP-59 gift wrap (kind 1059) and returns the NIP-17 rumor inside.
 *
 * Anyone can publish a gift wrap tagged to any pubkey, so the contents are
 * untrusted. This never throws: anything malformed returns null so callers
 * can skip it without dropping the rest of the inbox.
 *
 * The rumor's pubkey must equal the seal's pubkey (NIP-17). The seal content
 * is decrypted with the seal pubkey, so a match proves who wrote the rumor.
 * Without this check anyone can claim to be any sender.
 */

export type GiftWrapDecrypter = {
  decrypt(pubkey: string, cipherText: string): string | Promise<string>;
};

export type UnwrappedRumor = {
  id?: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
};

type GiftWrapLike = { pubkey: string; content: string };

function isRumor(value: unknown): value is UnwrappedRumor {
  if (typeof value !== "object" || value === null) return false;
  const rumor = value as Record<string, unknown>;
  return (
    typeof rumor.pubkey === "string" &&
    typeof rumor.created_at === "number" &&
    typeof rumor.content === "string" &&
    Array.isArray(rumor.tags) &&
    rumor.tags.every((tag) => Array.isArray(tag))
  );
}

export async function unwrapGiftWrap(
  wrap: GiftWrapLike,
  decrypter: GiftWrapDecrypter
): Promise<UnwrappedRumor | null> {
  try {
    const sealJson = await decrypter.decrypt(wrap.pubkey, wrap.content);
    if (!sealJson) return null;

    const seal = JSON.parse(sealJson);
    if (
      seal?.kind !== 13 ||
      typeof seal.pubkey !== "string" ||
      typeof seal.content !== "string"
    ) {
      return null;
    }

    const rumorJson = await decrypter.decrypt(seal.pubkey, seal.content);
    if (!rumorJson) return null;

    const rumor = JSON.parse(rumorJson);
    if (!isRumor(rumor) || rumor.pubkey !== seal.pubkey) return null;

    return rumor;
  } catch {
    return null;
  }
}
