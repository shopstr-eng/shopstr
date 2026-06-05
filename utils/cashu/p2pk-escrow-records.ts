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

interface EncryptedBuyerP2pkEscrowRecord {
  orderId: string;
  createdAt: number;
  content: string;
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
  return readJsonArray<BuyerP2pkEscrowRecord>(LOCAL_STORAGE_KEY);
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
  const records = readJsonArray<EncryptedBuyerP2pkEscrowRecord>(
    ENCRYPTED_STORAGE_KEY
  );
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

export async function persistBuyerP2pkEscrowRecord(
  nostr: NostrManager | undefined,
  signer: NostrSigner | undefined,
  record: BuyerP2pkEscrowRecord
): Promise<void> {
  upsertLocalBuyerP2pkEscrowRecord(record);

  if (!signer) return;

  const userPubkey = await signer.getPubKey();
  const content = await signer.encrypt(userPubkey, JSON.stringify(record));
  upsertEncryptedBuyerP2pkEscrowRecord({
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
