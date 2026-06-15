import {
  BUYER_P2PK_ESCROW_EVENT_KIND,
  getLocalBuyerP2pkEscrowRecords,
  persistBuyerP2pkEscrowRecord,
  restoreEscrowRecordLocally,
} from "../p2pk-escrow-records";

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  finalizeAndSendNostrEvent: jest.fn().mockResolvedValue({ id: "event-id" }),
}));

import { finalizeAndSendNostrEvent } from "@/utils/nostr/nostr-helper-functions";

const record = {
  orderId: "order-1",
  mint: "https://mint.example",
  token: "cashuAtoken",
  amount: 42,
  sellerPubkey: "seller-pubkey",
  locktime: 123456,
  refundKeys: ["refund-pubkey"],
  createdAt: 111,
};

describe("p2pk-escrow-records", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it("persists a local buyer escrow mirror", async () => {
    await persistBuyerP2pkEscrowRecord(undefined, undefined, record);

    expect(getLocalBuyerP2pkEscrowRecords()).toEqual([record]);
  });

  it("persists an encrypted self-copy when a signer is available", async () => {
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("buyer-pubkey"),
      encrypt: jest.fn(async (_pubkey: string, plaintext: string) => {
        return `encrypted:${plaintext}`;
      }),
    } as any;

    await persistBuyerP2pkEscrowRecord(undefined, signer, record);

    expect(signer.encrypt).toHaveBeenCalledWith(
      "buyer-pubkey",
      JSON.stringify(record)
    );
    expect(
      JSON.parse(localStorage.getItem("shopstr.p2pkEscrowRecords.encrypted")!)
    ).toEqual([
      {
        orderId: record.orderId,
        createdAt: record.createdAt,
        content: `encrypted:${JSON.stringify(record)}`,
      },
    ]);
  });

  it("restoreEscrowRecordLocally writes the record to localStorage", () => {
    restoreEscrowRecordLocally(record);
    expect(getLocalBuyerP2pkEscrowRecords()).toEqual([record]);
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
    expect(getLocalBuyerP2pkEscrowRecords()).toEqual([record]);
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
        content: `encrypted:${JSON.stringify(record)}`,
        tags: expect.arrayContaining([
          ["d", `shopstr:p2pk-escrow:${record.orderId}`],
          ["type", "p2pk-escrow"],
        ]),
      }),
      { waitForRelayPublish: false }
    );
  });
});
