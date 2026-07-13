import { finalizeEvent, getPublicKey, nip19, nip44 } from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils.js";
import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import {
  NostrManager,
  type NostrEvent,
  type NostrEventTemplate,
} from "@/utils/nostr/nostr-manager";
import type { EventTemplate } from "nostr-tools";
import { finalizeAndSendNostrEvent } from "@/utils/nostr/nostr-helper-functions";

const LOCAL_STORAGE_KEY = "shopstr.p2pkEscrowRecords";
const ENCRYPTED_STORAGE_KEY = "shopstr.p2pkEscrowRecords.encrypted";
export const BUYER_P2PK_ESCROW_EVENT_KIND = 30406;
const BUYER_P2PK_ESCROW_D_PREFIX = "shopstr:p2pk-escrow";

export type P2pkEscrowDisputeStatus =
  "none" | "open" | "resolved:buyer" | "resolved:seller";

const DISPUTE_STATUSES: readonly P2pkEscrowDisputeStatus[] = [
  "none",
  "open",
  "resolved:buyer",
  "resolved:seller",
];

const DEFAULT_DISPUTE_STATUS: P2pkEscrowDisputeStatus = "none";

export interface BuyerP2pkEscrowRecord {
  orderId: string;
  mint: string;
  token: string;
  amount: number;
  sellerPubkey: string;
  locktime: number;
  refundKeys: string[];
  createdAt: number;
  // Cashu pubkey of the arbiter (from NEXT_PUBLIC_ARBITER_PUBKEY at checkout
  // time). Absent on Phase 1 records that predate 2-of-3 dispute escrow.
  arbiterPubkey?: string;
  // Absent on Phase 1 records; normalized to "none" on read via
  // normalizeBuyerP2pkEscrowRecord.
  disputeStatus?: P2pkEscrowDisputeStatus;
}

export interface EncryptedBuyerP2pkEscrowRecord {
  orderId: string;
  createdAt: number;
  content: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isDisputeStatus(value: unknown): value is P2pkEscrowDisputeStatus {
  return (
    typeof value === "string" &&
    (DISPUTE_STATUSES as readonly string[]).includes(value)
  );
}

export function isBuyerP2pkEscrowRecord(
  record: unknown
): record is BuyerP2pkEscrowRecord {
  if (typeof record !== "object" || record === null) return false;
  const candidate = record as Partial<BuyerP2pkEscrowRecord>;

  return (
    isNonEmptyString(candidate.orderId) &&
    isNonEmptyString(candidate.mint) &&
    isNonEmptyString(candidate.token) &&
    typeof candidate.amount === "number" &&
    Number.isFinite(candidate.amount) &&
    isNonEmptyString(candidate.sellerPubkey) &&
    typeof candidate.locktime === "number" &&
    Number.isFinite(candidate.locktime) &&
    Array.isArray(candidate.refundKeys) &&
    candidate.refundKeys.every(isNonEmptyString) &&
    typeof candidate.createdAt === "number" &&
    Number.isFinite(candidate.createdAt) &&
    (candidate.arbiterPubkey === undefined ||
      isNonEmptyString(candidate.arbiterPubkey)) &&
    (candidate.disputeStatus === undefined ||
      isDisputeStatus(candidate.disputeStatus))
  );
}

// Phase 1 records predate arbiterPubkey/disputeStatus. This backfills the
// dispute default so every record leaving this module has an explicit
// status, without forcing every existing caller that builds a
// BuyerP2pkEscrowRecord literal to know about Phase 2 fields.
function normalizeBuyerP2pkEscrowRecord(
  record: BuyerP2pkEscrowRecord
): BuyerP2pkEscrowRecord {
  return {
    ...record,
    disputeStatus: record.disputeStatus ?? DEFAULT_DISPUTE_STATUS,
  };
}

function isEncryptedBuyerP2pkEscrowRecord(
  record: unknown
): record is EncryptedBuyerP2pkEscrowRecord {
  if (typeof record !== "object" || record === null) return false;
  const candidate = record as Partial<EncryptedBuyerP2pkEscrowRecord>;

  return (
    isNonEmptyString(candidate.orderId) &&
    typeof candidate.createdAt === "number" &&
    Number.isFinite(candidate.createdAt) &&
    isNonEmptyString(candidate.content)
  );
}

function readJsonArray<T>(storageKey: string): T[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray<T>(storageKey: string, records: T[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(records));
}

export function getLocalBuyerP2pkEscrowRecords(): BuyerP2pkEscrowRecord[] {
  return readJsonArray<BuyerP2pkEscrowRecord>(LOCAL_STORAGE_KEY)
    .filter(isBuyerP2pkEscrowRecord)
    .map(normalizeBuyerP2pkEscrowRecord);
}

function getEncryptedBuyerP2pkEscrowRecords(): EncryptedBuyerP2pkEscrowRecord[] {
  return readJsonArray<EncryptedBuyerP2pkEscrowRecord>(
    ENCRYPTED_STORAGE_KEY
  ).filter(isEncryptedBuyerP2pkEscrowRecord);
}

function upsertLocalBuyerP2pkEscrowRecord(record: BuyerP2pkEscrowRecord): void {
  const records = getLocalBuyerP2pkEscrowRecords();
  const existingIndex = records.findIndex(
    (item) => item.orderId === record.orderId
  );

  if (existingIndex >= 0) {
    records[existingIndex] = record;
  } else {
    records.push(record);
  }

  writeJsonArray(LOCAL_STORAGE_KEY, records);
}

function upsertEncryptedBuyerP2pkEscrowRecord(
  record: EncryptedBuyerP2pkEscrowRecord
): void {
  const records = getEncryptedBuyerP2pkEscrowRecords();
  const existingIndex = records.findIndex(
    (item) => item.orderId === record.orderId
  );

  if (existingIndex >= 0) {
    records[existingIndex] = record;
  } else {
    records.push(record);
  }

  writeJsonArray(ENCRYPTED_STORAGE_KEY, records);
}

function removeLocalBuyerP2pkEscrowRecord(orderId: string): void {
  const records = getLocalBuyerP2pkEscrowRecords().filter(
    (item) => item.orderId !== orderId
  );

  if (records.length > 0) {
    writeJsonArray(LOCAL_STORAGE_KEY, records);
  } else if (typeof window !== "undefined") {
    window.localStorage.removeItem(LOCAL_STORAGE_KEY);
  }
}

export function restoreEscrowRecordLocally(
  record: BuyerP2pkEscrowRecord
): void {
  upsertLocalBuyerP2pkEscrowRecord(normalizeBuyerP2pkEscrowRecord(record));
}

export function restoreEncryptedEscrowRecordLocally(
  record: EncryptedBuyerP2pkEscrowRecord
): void {
  upsertEncryptedBuyerP2pkEscrowRecord(record);
  removeLocalBuyerP2pkEscrowRecord(record.orderId);
}

export async function getStoredBuyerP2pkEscrowRecords(
  signer?: NostrSigner
): Promise<BuyerP2pkEscrowRecord[]> {
  const recordsByOrderId = new Map<string, BuyerP2pkEscrowRecord>();

  for (const record of getLocalBuyerP2pkEscrowRecords()) {
    recordsByOrderId.set(record.orderId, record);
  }

  if (!signer) {
    return Array.from(recordsByOrderId.values());
  }

  let userPubkey: string;
  try {
    userPubkey = await signer.getPubKey();
  } catch {
    return Array.from(recordsByOrderId.values());
  }

  for (const encryptedRecord of getEncryptedBuyerP2pkEscrowRecords()) {
    try {
      const decrypted = await signer.decrypt(
        userPubkey,
        encryptedRecord.content
      );
      const parsed = JSON.parse(decrypted);
      if (isBuyerP2pkEscrowRecord(parsed)) {
        recordsByOrderId.set(
          parsed.orderId,
          normalizeBuyerP2pkEscrowRecord(parsed)
        );
      }
    } catch {
      // Ignore records this signer cannot decrypt.
    }
  }

  return Array.from(recordsByOrderId.values());
}

export async function persistBuyerP2pkEscrowRecord(
  nostr: NostrManager | undefined,
  signer: NostrSigner | undefined,
  record: BuyerP2pkEscrowRecord
): Promise<void> {
  if (!signer) return;

  const normalizedRecord = normalizeBuyerP2pkEscrowRecord(record);

  const userPubkey = await signer.getPubKey();
  const content = await signer.encrypt(
    userPubkey,
    JSON.stringify(normalizedRecord)
  );
  restoreEncryptedEscrowRecordLocally({
    orderId: normalizedRecord.orderId,
    createdAt: normalizedRecord.createdAt,
    content,
  });

  if (!nostr) return;

  const event: EventTemplate = {
    kind: BUYER_P2PK_ESCROW_EVENT_KIND,
    tags: [
      ["d", `${BUYER_P2PK_ESCROW_D_PREFIX}:${normalizedRecord.orderId}`],
      ["type", "p2pk-escrow"],
    ],
    content,
    created_at: normalizedRecord.createdAt,
  };

  await finalizeAndSendNostrEvent(signer, nostr, event, {
    waitForRelayPublish: false,
  });
}

// Wraps a raw Nostr private key (hex or nsec) as a NostrSigner so
// updateDisputeStatus can run outside the browser-extension/NIP-46 signer
// flows the rest of this file assumes (e.g. an arbiter's own key).
class PrivkeyNostrSigner implements NostrSigner {
  private readonly privKeyBytes: Uint8Array;
  private readonly pubkey: string;

  constructor(privkey: string) {
    this.privKeyBytes = privkey.startsWith("nsec")
      ? (nip19.decode(privkey).data as Uint8Array)
      : hexToBytes(privkey);
    this.pubkey = getPublicKey(this.privKeyBytes);
  }

  async connect(): Promise<string> {
    return this.pubkey;
  }

  async getPubKey(): Promise<string> {
    return this.pubkey;
  }

  async sign(event: NostrEventTemplate): Promise<NostrEvent> {
    return finalizeEvent(event, this.privKeyBytes) as unknown as NostrEvent;
  }

  async encrypt(pubkey: string, plainText: string): Promise<string> {
    const conversationKey = nip44.getConversationKey(this.privKeyBytes, pubkey);
    return nip44.encrypt(plainText, conversationKey);
  }

  async decrypt(pubkey: string, cipherText: string): Promise<string> {
    const conversationKey = nip44.getConversationKey(this.privKeyBytes, pubkey);
    return nip44.decrypt(cipherText, conversationKey);
  }

  async close(): Promise<void> {}

  toJSON(): { [key: string]: any } {
    return { type: "privkey", pubkey: this.pubkey };
  }
}

// Publishes an updated kind 30406 record with a new disputeStatus, signed
// by userPrivkey (buyer, seller, or arbiter — whoever calls this only ever
// updates their own self-encrypted copy of the record for orderId).
export async function updateDisputeStatus(
  orderId: string,
  status: P2pkEscrowDisputeStatus,
  userPrivkey: string
): Promise<void> {
  const signer = new PrivkeyNostrSigner(userPrivkey);

  const existingRecords = await getStoredBuyerP2pkEscrowRecords(signer);
  const existingRecord = existingRecords.find(
    (candidate) => candidate.orderId === orderId
  );

  if (!existingRecord) {
    throw new Error(`No escrow record found for order ${orderId}.`);
  }

  const updatedRecord: BuyerP2pkEscrowRecord = {
    ...existingRecord,
    disputeStatus: status,
  };

  const nostr = new NostrManager();
  await persistBuyerP2pkEscrowRecord(nostr, signer, updatedRecord);
}

// Same as updateDisputeStatus, but for callers that already have the app's
// real NostrSigner (e.g. the buyer's SignerContext.signer in-session) rather
// than a raw privkey. This matters because the escrow record is
// self-encrypted to whoever originally persisted it (the buyer's real Nostr
// identity at checkout) — a Cashu-only key like cashuPrivkey has no
// relationship to that identity and can never decrypt/update the record.
export async function updateDisputeStatusWithSigner(
  orderId: string,
  status: P2pkEscrowDisputeStatus,
  signer: NostrSigner,
  nostr?: NostrManager
): Promise<void> {
  const existingRecords = await getStoredBuyerP2pkEscrowRecords(signer);
  const existingRecord = existingRecords.find(
    (candidate) => candidate.orderId === orderId
  );

  if (!existingRecord) {
    throw new Error(`No escrow record found for order ${orderId}.`);
  }

  const updatedRecord: BuyerP2pkEscrowRecord = {
    ...existingRecord,
    disputeStatus: status,
  };

  await persistBuyerP2pkEscrowRecord(nostr, signer, updatedRecord);
}
