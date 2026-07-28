import {
  BUYER_P2PK_ESCROW_EVENT_KIND,
  getLocalBuyerP2pkEscrowRecords,
  getStoredBuyerP2pkEscrowRecords,
  isBuyerP2pkEscrowRecord,
  persistBuyerP2pkEscrowRecord,
  restoreEncryptedEscrowRecordLocally,
  restoreEscrowRecordLocally,
} from "../p2pk-escrow-records";
import * as escrowRecords from "../p2pk-escrow-records";

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  finalizeAndSendNostrEvent: jest.fn().mockResolvedValue({ id: "event-id" }),
}));

jest.mock("@/utils/nostr/nip98-auth", () => ({
  createNip98AuthorizationHeader: jest
    .fn()
    .mockResolvedValue("Nostr signed-registration"),
}));

import { finalizeAndSendNostrEvent } from "@/utils/nostr/nostr-helper-functions";
import { createNip98AuthorizationHeader } from "@/utils/nostr/nip98-auth";

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

describe("p2pk-escrow-records", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true }),
    }) as jest.Mock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
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

  it("registers an immutable authenticated token commitment without sending the bearer token", async () => {
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("1".repeat(64)),
      encrypt: jest.fn().mockResolvedValue("encrypted-record"),
    } as any;
    const phase2Record = {
      ...record,
      sellerPubkey: "2".repeat(64),
      buyerCashuPubkey: "3".repeat(64),
      arbiterPubkey: "4".repeat(64),
      sellerNostrPubkey: "5".repeat(64),
    };

    await persistBuyerP2pkEscrowRecord(undefined, signer, phase2Record);

    expect(createNip98AuthorizationHeader).toHaveBeenCalledTimes(1);
    const [, url, method, body] = (createNip98AuthorizationHeader as jest.Mock)
      .mock.calls[0]!;
    expect(url).toBe(`${window.location.origin}/api/db/register-escrow-order`);
    expect(method).toBe("POST");

    const parsedBody = JSON.parse(body);
    expect(parsedBody).toEqual(
      expect.objectContaining({
        orderId: "order-1",
        sellerNostrPubkey: "5".repeat(64),
        sellerCashuPubkey: "2".repeat(64),
        buyerCashuPubkey: "3".repeat(64),
        arbiterCashuPubkey: "4".repeat(64),
        amountSats: 42,
        locktime: 123456,
        tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
    );
    expect(body).not.toContain("cashuAtoken");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/db/register-escrow-order",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Nostr signed-registration",
        }),
        body,
      })
    );
  });

  it("refuses to persist a Phase 2 escrow without a Nostr signer", async () => {
    const phase2Record = {
      ...record,
      sellerPubkey: "2".repeat(64),
      buyerCashuPubkey: "3".repeat(64),
      arbiterPubkey: "4".repeat(64),
      sellerNostrPubkey: "5".repeat(64),
    };

    await expect(
      persistBuyerP2pkEscrowRecord(undefined, undefined, phase2Record)
    ).rejects.toThrow("Nostr identity is required");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("builds a complete Phase 2 record from the checkout output keys", () => {
    const result = (escrowRecords as any).createBuyerP2pkEscrowRecord({
      orderId: "order-2",
      mint: "https://mint.example",
      token: "cashuBtoken",
      amount: 21,
      sellerNostrPubkey: "5".repeat(64),
      outputConfig: {
        send: {
          type: "p2pk",
          options: {
            pubkey: ["2".repeat(64), "3".repeat(64), "4".repeat(64)],
            locktime: 999,
            refundKeys: ["3".repeat(64)],
          },
        },
      },
      createdAt: 222,
    });

    expect(result).toEqual({
      orderId: "order-2",
      mint: "https://mint.example",
      token: "cashuBtoken",
      amount: 21,
      sellerPubkey: "2".repeat(64),
      buyerCashuPubkey: "3".repeat(64),
      arbiterPubkey: "4".repeat(64),
      sellerNostrPubkey: "5".repeat(64),
      locktime: 999,
      refundKeys: ["3".repeat(64)],
      createdAt: 222,
    });
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
  });
});
