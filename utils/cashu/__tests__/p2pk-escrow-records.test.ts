import {
  BUYER_P2PK_ESCROW_EVENT_KIND,
  getLocalBuyerP2pkEscrowRecords,
  getStoredBuyerP2pkEscrowRecords,
  isBuyerP2pkEscrowRecord,
  persistBuyerP2pkEscrowRecord,
  restoreEncryptedEscrowRecordLocally,
  restoreEscrowRecordLocally,
  updateDisputeStatus,
} from "../p2pk-escrow-records";

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  finalizeAndSendNostrEvent: jest.fn().mockResolvedValue({ id: "event-id" }),
}));

import { finalizeAndSendNostrEvent } from "@/utils/nostr/nostr-helper-functions";
import { getPublicKey, nip44 } from "nostr-tools";

// Phase 1 fixture: no arbiterPubkey/disputeStatus, matching records
// persisted before Phase 2 shipped.
const legacyRecord = {
  orderId: "order-1",
  mint: "https://mint.example",
  token: "cashuAtoken",
  amount: 42,
  sellerPubkey: "seller-pubkey",
  locktime: 123456,
  refundKeys: ["refund-pubkey"],
  createdAt: 111,
};

const record = legacyRecord;
// What legacyRecord normalizes to once it round-trips through this module.
const normalizedRecord = { ...legacyRecord, disputeStatus: "none" };

const USER_PRIVKEY = "1".repeat(64);
const USER_PRIVKEY_BYTES = Uint8Array.from(Buffer.from(USER_PRIVKEY, "hex"));
const USER_PUBKEY = getPublicKey(USER_PRIVKEY_BYTES);

function decryptSelfContent(content: string): unknown {
  const conversationKey = nip44.getConversationKey(
    USER_PRIVKEY_BYTES,
    USER_PUBKEY
  );
  return JSON.parse(nip44.decrypt(content, conversationKey));
}

describe("p2pk-escrow-records", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it("persists a local buyer escrow mirror", async () => {
    await persistBuyerP2pkEscrowRecord(undefined, undefined, record);

    expect(getLocalBuyerP2pkEscrowRecords()).toEqual([]);
    expect(localStorage.getItem("shopstr.p2pkEscrowRecords")).toBeNull();
  });

  it("persists and restores an encrypted self-copy when a signer is available", async () => {
    const encryptedContent = "encrypted-record";
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("buyer-pubkey"),
      encrypt: jest.fn().mockResolvedValue(encryptedContent),
      decrypt: jest.fn(async (_pubkey: string, ciphertext: string) => {
        return ciphertext === encryptedContent ? JSON.stringify(record) : "";
      }),
    } as any;

    await persistBuyerP2pkEscrowRecord(undefined, signer, record);

    expect(signer.encrypt).toHaveBeenCalledWith(
      "buyer-pubkey",
      JSON.stringify(normalizedRecord)
    );
    expect(
      JSON.parse(localStorage.getItem("shopstr.p2pkEscrowRecords.encrypted")!)
    ).toEqual([
      {
        orderId: record.orderId,
        createdAt: record.createdAt,
        content: encryptedContent,
      },
    ]);
    expect(localStorage.getItem("shopstr.p2pkEscrowRecords")).toBeNull();
    await expect(getStoredBuyerP2pkEscrowRecords(signer)).resolves.toEqual([
      normalizedRecord,
    ]);
  });

  it("restoreEscrowRecordLocally writes the record to localStorage, defaulting disputeStatus to none", () => {
    restoreEscrowRecordLocally(record);
    expect(getLocalBuyerP2pkEscrowRecords()).toEqual([normalizedRecord]);
  });

  it("restoreEscrowRecordLocally deduplicates by orderId — calling twice does not create a duplicate", () => {
    restoreEscrowRecordLocally(record);
    restoreEscrowRecordLocally(record);
    expect(getLocalBuyerP2pkEscrowRecords()).toHaveLength(1);
  });

  it("restoreEscrowRecordLocally replaces an existing record with the same orderId", () => {
    restoreEscrowRecordLocally(record);
    const updated = { ...record, token: "cashuUpdatedToken" };
    restoreEscrowRecordLocally(updated);
    const stored = getLocalBuyerP2pkEscrowRecords();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.token).toBe("cashuUpdatedToken");
  });

  it("restoreEscrowRecordLocally is safe when DB and relay return the same event", () => {
    // Simulates the double-call pattern in fetchEscrowRecords
    restoreEscrowRecordLocally(record); // from DB
    restoreEscrowRecordLocally(record); // from relay
    expect(getLocalBuyerP2pkEscrowRecords()).toEqual([normalizedRecord]);
  });

  it("restoreEncryptedEscrowRecordLocally stores encrypted records without token plaintext", async () => {
    const encryptedContent = "encrypted-record";
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("buyer-pubkey"),
      decrypt: jest.fn(async (_pubkey: string, ciphertext: string) => {
        return ciphertext === encryptedContent ? JSON.stringify(record) : "";
      }),
    } as any;

    restoreEncryptedEscrowRecordLocally({
      orderId: record.orderId,
      createdAt: record.createdAt,
      content: encryptedContent,
    });

    expect(localStorage.getItem("shopstr.p2pkEscrowRecords")).toBeNull();
    expect(
      localStorage.getItem("shopstr.p2pkEscrowRecords.encrypted")
    ).toContain(encryptedContent);
    expect(
      localStorage.getItem("shopstr.p2pkEscrowRecords.encrypted")
    ).not.toContain(record.token);
    await expect(getStoredBuyerP2pkEscrowRecords(signer)).resolves.toEqual([
      normalizedRecord,
    ]);
  });

  it("publishes an encrypted relay record when nostr and signer are available", async () => {
    const nostr = {};
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("buyer-pubkey"),
      encrypt: jest.fn(async (_pubkey: string, plaintext: string) => {
        return `encrypted:${plaintext}`;
      }),
    } as any;

    await persistBuyerP2pkEscrowRecord(nostr as any, signer, record);

    expect(finalizeAndSendNostrEvent).toHaveBeenCalledWith(
      signer,
      nostr,
      expect.objectContaining({
        kind: BUYER_P2PK_ESCROW_EVENT_KIND,
        content: `encrypted:${JSON.stringify(normalizedRecord)}`,
        tags: expect.arrayContaining([
          ["d", `shopstr:p2pk-escrow:${record.orderId}`],
          ["type", "p2pk-escrow"],
        ]),
      }),
      { waitForRelayPublish: false }
    );
  });

  describe("Phase 2 dispute fields", () => {
    it("isBuyerP2pkEscrowRecord accepts legacy Phase 1 records with no arbiterPubkey/disputeStatus", () => {
      expect(isBuyerP2pkEscrowRecord(legacyRecord)).toBe(true);
    });

    it("isBuyerP2pkEscrowRecord accepts records carrying arbiterPubkey and a valid disputeStatus", () => {
      expect(
        isBuyerP2pkEscrowRecord({
          ...legacyRecord,
          arbiterPubkey: "arbiter-pubkey",
          disputeStatus: "open",
        })
      ).toBe(true);
    });

    it("isBuyerP2pkEscrowRecord rejects an unrecognized disputeStatus value", () => {
      expect(
        isBuyerP2pkEscrowRecord({ ...legacyRecord, disputeStatus: "bogus" })
      ).toBe(false);
    });

    it("normalizes a legacy record's disputeStatus to none on every read path", () => {
      restoreEscrowRecordLocally(legacyRecord);
      const [stored] = getLocalBuyerP2pkEscrowRecords();
      expect(stored?.disputeStatus).toBe("none");
      expect(stored?.arbiterPubkey).toBeUndefined();
    });

    it("updateDisputeStatus throws when no record exists for the order", async () => {
      await expect(
        updateDisputeStatus("no-such-order", "open", USER_PRIVKEY)
      ).rejects.toThrow("No escrow record found for order no-such-order.");
    });

    it("updateDisputeStatus republishes the record with the new status, preserving other fields", async () => {
      restoreEscrowRecordLocally({ ...record, orderId: "order-2" });

      await updateDisputeStatus("order-2", "open", USER_PRIVKEY);

      expect(finalizeAndSendNostrEvent).toHaveBeenCalledTimes(1);
      const [, , eventTemplate] = (finalizeAndSendNostrEvent as jest.Mock).mock
        .calls[0];
      expect(eventTemplate.kind).toBe(BUYER_P2PK_ESCROW_EVENT_KIND);
      expect(eventTemplate.tags).toEqual(
        expect.arrayContaining([["d", "shopstr:p2pk-escrow:order-2"]])
      );

      const decryptedRecord = decryptSelfContent(eventTemplate.content) as any;
      expect(decryptedRecord).toEqual({
        ...record,
        orderId: "order-2",
        disputeStatus: "open",
      });
    });
  });
});
