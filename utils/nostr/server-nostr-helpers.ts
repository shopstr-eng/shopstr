import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  getEventHash,
  nip19,
  nip44,
} from "nostr-tools";
import { useWebSocketImplementation, SimplePool } from "nostr-tools/pool";
import { NostrEvent } from "@/utils/types/types";
import { cacheEvent, getDbPool } from "@/utils/db/db-service";
// @ts-ignore: ws provides the WebSocket implementation for Node.js, passed to nostr-tools
import WebSocket from "ws";

useWebSocketImplementation(WebSocket);

const RELAY_PUBLISH_TIMEOUT_MS = 21000;

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

async function trackFailedRelayPublish(
  eventId: string,
  event: NostrEvent,
  relays: string[]
): Promise<void> {
  try {
    const dbPool = getDbPool();
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS failed_relay_publishes (
        event_id TEXT PRIMARY KEY,
        event_data TEXT NOT NULL,
        relays TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        retry_count INTEGER DEFAULT 0
      )
    `);
    const values: (string | number)[] = [
      eventId,
      JSON.stringify(event),
      JSON.stringify(relays),
      Math.floor(Date.now() / 1000),
    ];
    await dbPool.query(
      `INSERT INTO failed_relay_publishes (event_id, event_data, relays, created_at, retry_count)
       VALUES ($1, $2, $3, $4, 0)
       ON CONFLICT (event_id) DO UPDATE SET
         event_data = EXCLUDED.event_data,
         relays = EXCLUDED.relays,
         created_at = EXCLUDED.created_at`,
      values as any[]
    );
  } catch (error) {
    console.error("Failed to track failed relay publish:", error);
  }
}

async function publishToRelays(event: any): Promise<number> {
  const relays = getDefaultRelays();
  const pool = new SimplePool();
  try {
    const publishPromise = Promise.allSettled(pool.publish(relays, event));
    const timeoutPromise = new Promise<PromiseSettledResult<string>[]>(
      (resolve) =>
        setTimeout(
          () =>
            resolve(
              relays.map(() => ({
                status: "rejected" as const,
                reason: "timeout",
              }))
            ),
          RELAY_PUBLISH_TIMEOUT_MS
        )
    );
    const results = await Promise.race([publishPromise, timeoutPromise]);
    let successCount = 0;
    for (const result of results) {
      if (result.status === "fulfilled") {
        successCount++;
      }
    }
    return successCount;
  } catch (error) {
    console.error("Failed to publish to relays:", error);
    return 0;
  } finally {
    pool.close(relays);
  }
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

    const successCount = await publishToRelays(signedGiftWrap);
    if (successCount === 0) {
      console.warn(
        `Relay publish timed out or failed for gift-wrapped message, but event is saved to database. Recipient: ${recipientPubkey.substring(
          0,
          8
        )}...`
      );
      await trackFailedRelayPublish(
        (signedGiftWrap as NostrEvent).id,
        signedGiftWrap as NostrEvent,
        defaultRelays
      ).catch(console.error);
    }

    return true;
  } catch (error) {
    console.error("Failed to send server-side Nostr DM:", error);
    return false;
  }
}
