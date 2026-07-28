import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import type { EventTemplate } from "nostr-tools";
import { finalizeAndSendNostrEvent } from "@/utils/nostr/nostr-helper-functions";
import { createNip98AuthorizationHeader } from "@/utils/nostr/nip98-auth";
import { hashEscrowToken } from "@/utils/cashu/escrow-order-commitment";

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
  // Phase 2 records retain the buyer's Cashu signer and seller's Nostr
  // identity so checkout can register an authenticated, immutable order
  // commitment without exposing the bearer token to the server.
  buyerCashuPubkey?: string;
  sellerNostrPubkey?: string;
  // Absent on Phase 1 records; normalized to "none" on read via
  // normalizeBuyerP2pkEscrowRecord.
  disputeStatus?: P2pkEscrowDisputeStatus;
}

export interface EncryptedBuyerP2pkEscrowRecord {
  orderId: string;
  createdAt: number;
  content: string;
}

export function createBuyerP2pkEscrowRecord(params: {
  orderId: string;
  mint: string;
  token: string;
  amount: number;
  sellerNostrPubkey: string;
  outputConfig: {
    send: {
      type: "p2pk";
      options: {
        pubkey: string | string[];
        locktime: number;
        refundKeys: string[];
      };
    };
  };
  createdAt: number;
}): BuyerP2pkEscrowRecord {
  const lockPubkeys = params.outputConfig.send.options.pubkey;
  if (!Array.isArray(lockPubkeys) || lockPubkeys.length !== 3) {
    throw new Error("Phase 2 escrow requires exactly three P2PK lock keys.");
  }
  const [sellerPubkey, buyerCashuPubkey, arbiterPubkey] = lockPubkeys;
  if (!sellerPubkey || !buyerCashuPubkey || !arbiterPubkey) {
    throw new Error("Phase 2 escrow lock keys are incomplete.");
  }

  return {
    orderId: params.orderId,
    mint: params.mint,
    token: params.token,
    amount: params.amount,
    sellerPubkey,
    buyerCashuPubkey,
    arbiterPubkey,
    sellerNostrPubkey: params.sellerNostrPubkey,
    locktime: params.outputConfig.send.options.locktime,
    refundKeys: params.outputConfig.send.options.refundKeys,
    createdAt: params.createdAt,
  };
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
    (candidate.buyerCashuPubkey === undefined ||
      isNonEmptyString(candidate.buyerCashuPubkey)) &&
    (candidate.sellerNostrPubkey === undefined ||
      isNonEmptyString(candidate.sellerNostrPubkey)) &&
    (candidate.disputeStatus === undefined ||
      isDisputeStatus(candidate.disputeStatus))
  );
}

async function registerEscrowOrderCommitment(
  signer: NostrSigner,
  record: BuyerP2pkEscrowRecord
): Promise<void> {
  if (
    !record.buyerCashuPubkey ||
    !record.sellerNostrPubkey ||
    !record.arbiterPubkey
  ) {
    return;
  }

  const body = JSON.stringify({
    orderId: record.orderId,
    sellerNostrPubkey: record.sellerNostrPubkey,
    sellerCashuPubkey: record.sellerPubkey,
    buyerCashuPubkey: record.buyerCashuPubkey,
    arbiterCashuPubkey: record.arbiterPubkey,
    amountSats: record.amount,
    locktime: record.locktime,
    tokenHash: hashEscrowToken(record.token),
  });
  const url = `${window.location.origin}/api/db/register-escrow-order`;
  const authorization = await createNip98AuthorizationHeader(
    signer,
    url,
    "POST",
    body
  );
  const response = await fetch("/api/db/register-escrow-order", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization,
    },
    body,
  });

  if (!response.ok) {
    const responseBody = await response.json().catch(() => null);
    throw new Error(
      responseBody?.error ?? "Failed to register dispute escrow order"
    );
  }
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
  const isRegistrablePhase2Record = Boolean(
    record.buyerCashuPubkey && record.sellerNostrPubkey && record.arbiterPubkey
  );
  if (!signer) {
    if (isRegistrablePhase2Record) {
      throw new Error(
        "A Nostr identity is required to register dispute escrow securely."
      );
    }
    return;
  }

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

  await registerEscrowOrderCommitment(signer, normalizedRecord);

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

// Update with the app's active Nostr signer because the record is encrypted
// to the buyer's Nostr identity, not to a Cashu key.
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
