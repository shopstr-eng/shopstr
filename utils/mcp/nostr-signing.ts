import {
  EventTemplate,
  finalizeEvent,
  getPublicKey,
  nip19,
  nip44,
} from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils.js";
import { SimplePool } from "nostr-tools";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "crypto";
import { NostrEvent } from "@/utils/types/types";
import { cacheEvent } from "@/utils/db/db-service";
import {
  getDefaultRelays,
  withBlastr,
} from "@/utils/nostr/nostr-helper-functions";

const ALGORITHM = "aes-256-gcm";

export const MCP_RELAY_ALLOWLIST = new Set([
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://purplepag.es",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
  "wss://sendit.nosflare.com",
]);

function filterAllowedRelays(urls: string[]): string[] {
  const allowed: string[] = [];
  for (const url of urls) {
    if (MCP_RELAY_ALLOWLIST.has(url)) {
      allowed.push(url);
    } else {
      console.warn(`MCP relay blocked (not in allowlist): ${url}`);
    }
  }
  return allowed;
}

function getEncryptionKey(): Uint8Array {
  const envKey = process.env.MCP_ENCRYPTION_KEY;
  if (!envKey) {
    throw new Error(
      "MCP_ENCRYPTION_KEY environment variable is required for agent key storage"
    );
  }
  return Uint8Array.from(createHash("sha256").update(envKey).digest());
}

export function encryptNsec(nsec: string): string {
  const key = getEncryptionKey();
  const iv = Uint8Array.from(randomBytes(16));
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(nsec, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${Buffer.from(iv).toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptNsec(encryptedData: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encrypted] = encryptedData.split(":");
  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error("Invalid encrypted nsec format");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Uint8Array.from(Buffer.from(ivHex, "hex"))
  );
  decipher.setAuthTag(Uint8Array.from(Buffer.from(authTagHex, "hex")));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function nsecToPrivateKeyBytes(nsec: string): Uint8Array {
  if (nsec.startsWith("nsec")) {
    const decoded = nip19.decode(nsec);
    if (decoded.type !== "nsec") throw new Error("Invalid nsec");
    return decoded.data as Uint8Array;
  }
  return hexToBytes(nsec);
}

export class McpNostrSigner {
  private privKeyBytes: Uint8Array;
  private pubkey: string;

  constructor(nsecOrHex: string) {
    this.privKeyBytes = nsecToPrivateKeyBytes(nsecOrHex);
    this.pubkey = getPublicKey(this.privKeyBytes);
  }

  getPubKey(): string {
    return this.pubkey;
  }

  sign(event: EventTemplate): NostrEvent {
    return finalizeEvent(event, this.privKeyBytes) as unknown as NostrEvent;
  }

  encrypt(recipientPubkey: string, plainText: string): string {
    const conversationKey = nip44.getConversationKey(
      this.privKeyBytes,
      recipientPubkey
    );
    return nip44.encrypt(plainText, conversationKey);
  }

  decrypt(senderPubkey: string, cipherText: string): string {
    const conversationKey = nip44.getConversationKey(
      this.privKeyBytes,
      senderPubkey
    );
    return nip44.decrypt(cipherText, conversationKey);
  }

  getPrivKeyBytes(): Uint8Array {
    return this.privKeyBytes;
  }
}

export class McpRelayManager {
  private pool: SimplePool;
  private relayUrls: string[];

  constructor(relayUrls?: string[]) {
    this.pool = new SimplePool();
    const raw = relayUrls || withBlastr(getDefaultRelays());
    this.relayUrls = filterAllowedRelays(raw);
    if (this.relayUrls.length === 0) {
      throw new Error("MCP relay allowlist produced no valid relays");
    }
  }

  getRelayUrls(): string[] {
    return [...this.relayUrls];
  }

  async publish(event: NostrEvent): Promise<void> {
    await Promise.allSettled(this.pool.publish(this.relayUrls, event as any));
  }

  close(): void {
    this.pool.close(this.relayUrls);
  }
}

export async function signAndPublishEvent(
  signer: McpNostrSigner,
  eventTemplate: EventTemplate,
  relayManager?: McpRelayManager
): Promise<NostrEvent> {
  const signedEvent = signer.sign(eventTemplate);

  await cacheEvent(signedEvent);

  const manager = relayManager || new McpRelayManager();
  try {
    const publishPromise = manager.publish(signedEvent);
    const timeoutPromise = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error("Relay publish timeout")), 21000)
    );
    await Promise.race([publishPromise, timeoutPromise]);
  } catch (error) {
    console.warn(
      "MCP relay publish timed out or failed, but event is saved to database:",
      error
    );
    try {
      const { trackFailedRelayPublish } = await import("@/utils/db/db-client");
      await trackFailedRelayPublish(
        signedEvent.id,
        signedEvent,
        manager.getRelayUrls(),
        signer
      );
    } catch (trackError) {
      console.error("Failed to track failed relay publish:", trackError);
    }
  } finally {
    if (!relayManager) {
      manager.close();
    }
  }

  return signedEvent;
}
