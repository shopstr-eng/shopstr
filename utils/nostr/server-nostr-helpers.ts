import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  getEventHash,
  nip19,
  nip44,
} from "nostr-tools";
import { NostrEvent } from "@/utils/types/types";
import { cacheEvent } from "@/utils/db/db-service";

function generateRandomTimestamp(): number {
  const now = Math.floor(Date.now() / 1000);
  const twoDaysAgo = now - 2 * 24 * 60 * 60;
  return Math.floor(Math.random() * (now - twoDaysAgo)) + twoDaysAgo;
}

function getDefaultRelays(): string[] {
  return [
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.nostr.band",
    "wss://purplepag.es",
    "wss://relay.primal.net",
  ];
}

export async function sendServerSideNostrDM(
  recipientPubkey: string,
  message: string,
  subject: string
): Promise<boolean> {
  try {
    const encryptionNsec = process.env["ENCRYPTION_NSEC"];
    if (!encryptionNsec) {
      console.warn("ENCRYPTION_NSEC not configured, skipping Nostr DM");
      return false;
    }

    const decoded = nip19.decode(encryptionNsec);
    if (decoded.type !== "nsec") {
      console.warn("Invalid ENCRYPTION_NSEC format");
      return false;
    }

    const serverPrivkey = decoded.data as Uint8Array;
    const serverPubkey = getPublicKey(serverPrivkey);
    const defaultRelays = getDefaultRelays();

    const bareEvent = {
      pubkey: serverPubkey,
      created_at: Math.floor(Date.now() / 1000),
      content: message,
      kind: 14,
      tags: [
        ["p", recipientPubkey, defaultRelays[0]!],
        ["subject", subject],
      ],
    };

    const eventToHash: NostrEvent = {
      ...bareEvent,
      id: "",
      sig: "",
    };
    const eventId = getEventHash(eventToHash);
    const messageEvent = { id: eventId, ...bareEvent };

    const randomPrivkey = generateSecretKey();
    const randomPubkey = getPublicKey(randomPrivkey);

    const conversationKey = nip44.getConversationKey(
      randomPrivkey,
      recipientPubkey
    );
    const encryptedRumor = nip44.encrypt(
      JSON.stringify(messageEvent),
      conversationKey
    );

    const sealEvent = {
      pubkey: serverPubkey,
      created_at: generateRandomTimestamp(),
      content: encryptedRumor,
      kind: 13,
      tags: [],
    };
    const signedSeal = finalizeEvent(sealEvent, serverPrivkey);

    const giftWrapConversationKey = nip44.getConversationKey(
      randomPrivkey,
      recipientPubkey
    );
    const encryptedSeal = nip44.encrypt(
      JSON.stringify(signedSeal),
      giftWrapConversationKey
    );
    const giftWrapEvent = {
      pubkey: randomPubkey,
      created_at: generateRandomTimestamp(),
      content: encryptedSeal,
      kind: 1059,
      tags: [["p", recipientPubkey, defaultRelays[0]!]],
    };
    const signedGiftWrap = finalizeEvent(giftWrapEvent, randomPrivkey);

    await cacheEvent(signedGiftWrap as NostrEvent);

    return true;
  } catch (error) {
    console.error("Failed to send server-side Nostr DM:", error);
    return false;
  }
}
