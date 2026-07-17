import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";

interface BunkerTokenParams {
  remotePubkey: string;
  relays: string[];
  secret?: string;
}

export async function generateKeys(): Promise<{ nsec: string; npub: string }> {
  const sk = generateSecretKey();
  const nsec = nip19.nsecEncode(sk);

  const pk = getPublicKey(sk);
  const npub = nip19.npubEncode(pk);

  return { nsec, npub };
}

export function validateNPubKey(publicKey: string) {
  const validPubKey = /^npub[a-zA-Z0-9]{59}$/;
  return publicKey.match(validPubKey) !== null;
}

export function validateNSecKey(privateKey: string) {
  const validPrivKey = /^nsec[a-zA-Z0-9]{59}$/;
  return privateKey.match(validPrivKey) !== null;
}

export const decryptNpub = (npub: string): string | null => {
  try {
    const decoded = nip19.decode(npub);
    return decoded.type === "npub" && typeof decoded.data === "string"
      ? decoded.data
      : null;
  } catch {
    return null;
  }
};

export function nostrExtensionLoaded() {
  if (!window.nostr) {
    return false;
  }
  return true;
}

export function parseBunkerToken(token: string): BunkerTokenParams | null {
  try {
    if (!token.startsWith("bunker://")) {
      return null;
    }

    const url = new URL(token.replace("bunker://", "https://"));

    const remotePubkey = url.hostname;

    const relays = url.searchParams.getAll("relay");

    const secret = url.searchParams.get("secret") || undefined;

    return {
      remotePubkey,
      relays,
      secret,
    };
  } catch (error) {
    console.error("Failed to parse bunker token:", error);
    return null;
  }
}
