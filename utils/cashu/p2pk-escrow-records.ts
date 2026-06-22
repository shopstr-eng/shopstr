import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import type { NostrManager } from "@/utils/nostr/nostr-manager";
import type { EventTemplate } from "nostr-tools";
import { finalizeAndSendNostrEvent } from "@/utils/nostr/nostr-helper-functions";

const LOCAL_STORAGE_KEY = "shopstr.p2pkEscrowRecords";
const ENCRYPTED_STORAGE_KEY = "shopstr.p2pkEscrowRecords.encrypted";
export const BUYER_P2PK_ESCROW_EVENT_KIND = 30406;
const BUYER_P2PK_ESCROW_D_PREFIX = "shopstr:p2pk-escrow";

export interface BuyerP2pkEscrowRecord {
  orderId: string;
  mint: string;
  token: string;
  amount: number;
  sellerPubkey: string;
  locktime: number;
  refundKeys: string[];
  createdAt: number;
}

export interface EncryptedBuyerP2pkEscrowRecord {
  orderId: string;
  createdAt: number;
  content: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
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
    Number.isFinite(candidate.createdAt)
  );
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
  return readJsonArray<BuyerP2pkEscrowRecord>(LOCAL_STORAGE_KEY).filter(
    isBuyerP2pkEscrowRecord
  );
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
  upsertLocalBuyerP2pkEscrowRecord(record);
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
        recordsByOrderId.set(parsed.orderId, parsed);
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

  const userPubkey = await signer.getPubKey();
  const content = await signer.encrypt(userPubkey, JSON.stringify(record));
  restoreEncryptedEscrowRecordLocally({
    orderId: record.orderId,
    createdAt: record.createdAt,
    content,
  });

  if (!nostr) return;

  const event: EventTemplate = {
    kind: BUYER_P2PK_ESCROW_EVENT_KIND,
    tags: [
      ["d", `${BUYER_P2PK_ESCROW_D_PREFIX}:${record.orderId}`],
      ["type", "p2pk-escrow"],
    ],
    content,
    created_at: record.createdAt,
  };

  await finalizeAndSendNostrEvent(signer, nostr, event, {
    waitForRelayPublish: false,
  });
}
