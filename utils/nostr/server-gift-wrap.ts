import {
  finalizeEvent,
  generateSecretKey,
  getEventHash,
  getPublicKey,
  nip19,
  nip44,
} from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils.js";
import { NostrEvent } from "@/utils/types/types";
import { cacheEvent } from "@/utils/db/db-service";
import { McpRelayManager } from "@/utils/mcp/nostr-signing";

function toPrivkeyBytes(nsecOrHex: string): Uint8Array {
  if (nsecOrHex.startsWith("nsec")) {
    const decoded = nip19.decode(nsecOrHex);
    if (decoded.type !== "nsec") throw new Error("Invalid nsec");
    return decoded.data as Uint8Array;
  }
  return hexToBytes(nsecOrHex);
}

// NIP-59 recommends randomizing rumor/seal timestamps (up to ~2 days in the
// past) to reduce timing-correlation metadata leakage on relays.
function randomPastTimestamp(): number {
  const now = Math.floor(Date.now() / 1000);
  return now - Math.floor(Math.random() * 172800);
}

// Server-safe NIP-59 gift-wrap sender for use from API routes. The browser
// gift-wrap helpers in nostr-helper-functions.ts can't be reused here: they
// depend on getLocalStorageData() for relay lists and on
// cacheEventToDatabase's relative-URL fetch("/api/db/cache-event"), both of
// which are browser-only. This mirrors the server-safe pattern already
// established in utils/mcp/nostr-signing.ts (direct-DB cacheEvent,
// allowlisted McpRelayManager) instead.
export async function sendServerGiftWrappedDm(params: {
  senderPrivkeyHexOrNsec: string;
  recipientPubkey: string;
  payload: unknown;
  relayManager?: McpRelayManager;
}): Promise<void> {
  const { senderPrivkeyHexOrNsec, recipientPubkey, payload, relayManager } =
    params;

  const senderPrivkeyBytes = toPrivkeyBytes(senderPrivkeyHexOrNsec);
  const senderPubkey = getPublicKey(senderPrivkeyBytes);

  // kind-14 rumor (unsigned)
  const rumorBare = {
    pubkey: senderPubkey,
    created_at: randomPastTimestamp(),
    kind: 14,
    tags: [["p", recipientPubkey]],
    content: JSON.stringify(payload),
  };
  const rumor = {
    ...rumorBare,
    id: getEventHash(rumorBare as any),
    sig: "",
  };

  // kind-13 seal, signed with the sender's real Nostr identity key so the
  // recipient can verify the DM genuinely came from that identity.
  const sealConversationKey = nip44.getConversationKey(
    senderPrivkeyBytes,
    recipientPubkey
  );
  const sealContent = nip44.encrypt(JSON.stringify(rumor), sealConversationKey);
  const seal = finalizeEvent(
    {
      created_at: randomPastTimestamp(),
      kind: 13,
      tags: [],
      content: sealContent,
    },
    senderPrivkeyBytes
  );

  // kind-1059 gift wrap, fresh ephemeral keypair per NIP-59.
  const wrapPrivkeyBytes = generateSecretKey();
  const wrapConversationKey = nip44.getConversationKey(
    wrapPrivkeyBytes,
    recipientPubkey
  );
  const wrapContent = nip44.encrypt(JSON.stringify(seal), wrapConversationKey);
  const giftWrap = finalizeEvent(
    {
      created_at: randomPastTimestamp(),
      kind: 1059,
      tags: [["p", recipientPubkey]],
      content: wrapContent,
    },
    wrapPrivkeyBytes
  ) as unknown as NostrEvent;

  await cacheEvent(giftWrap);

  const manager = relayManager || new McpRelayManager();
  try {
    await Promise.race([
      manager.publish(giftWrap),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Relay publish timeout")), 21000)
      ),
    ]);
  } catch (error) {
    // The event is already durably cached via cacheEvent above; a relay
    // fanout failure here is a soft degradation, not data loss. (Unlike
    // McpNostrSigner's signAndPublishEvent, we don't call
    // trackFailedRelayPublish: it does fetch("/api/db/track-failed-publish")
    // with a relative URL, which is browser-only and would just fail again
    // in this server context.)
    console.warn(
      "Arbiter DM relay publish timed out or failed, but event is saved to database:",
      error
    );
  } finally {
    if (!relayManager) {
      manager.close();
    }
  }
}
