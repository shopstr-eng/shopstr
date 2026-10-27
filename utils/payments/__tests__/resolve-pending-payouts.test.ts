/**
 * @jest-environment jsdom
 */
import { generateSecretKey, getPublicKey } from "nostr-tools";
import { resolvePendingSellerLightningPayout } from "../resolve-pending-payouts";
import { notifySellerOfCompletedPayout } from "../seller-payout-notification";
import { storage, STORAGE_KEYS } from "@/utils/storage";
import {
  getPendingSellerLightningPayouts,
  recordPendingSellerLightningPayout,
  type PendingSellerLightningPayout,
} from "../pending-lightning-payouts";

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  publishProofEvent: jest.fn().mockResolvedValue(undefined),
  getLocalStorageData: jest.fn(() => ({
    relays: ["wss://relay.one"],
    writeRelays: [],
  })),
}));

const mockLoadMint = jest.fn();
const mockCheckMeltQuoteBolt11 = jest.fn();
const mockCheckProofsStates = jest.fn();

jest.mock("@cashu/cashu-ts", () => ({
  Mint: jest.fn().mockImplementation((url: string) => ({ url })),
  Wallet: jest.fn().mockImplementation(() => ({
    loadMint: mockLoadMint,
    checkMeltQuoteBolt11: mockCheckMeltQuoteBolt11,
    checkProofsStates: mockCheckProofsStates,
  })),
}));

const recoverableProof = {
  id: "keyset-1",
  amount: 17,
  secret: "recoverable-secret",
  C: "recoverable-C",
} as any;
const quarantinedProof = {
  id: "keyset-1",
  amount: 983,
  secret: "quarantined-secret",
  C: "quarantined-C",
} as any;

const nostr = {} as any;
const signer = {} as any;

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "order-1",
    mintUrl: "https://mint.example",
    sellerPubkey: "seller-pubkey",
    buyerPubkey: "buyer-pubkey",
    lnurl: "seller@example.com",
    sellerAmount: 1000,
    status: "pending" as const,
    meltQuoteId: "melt-quote-1",
    recoverableProofs: [recoverableProof],
    quarantinedProofs: [quarantinedProof],
    errorMessage: "mint still processing",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

/** Persist the record through the real store so removal is observable. */
function seedRecord(overrides: Record<string, unknown> = {}) {
  recordPendingSellerLightningPayout(makeRecord(overrides));
}

function storedSecrets(): string[] {
  return storage
    .getJson<any[]>(STORAGE_KEYS.TOKENS, [])
    .map((token) => token.secret);
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  mockLoadMint.mockResolvedValue(undefined);
});

describe("resolvePendingSellerLightningPayout", () => {
  it("refuses to resolve a legacy record with no buyer binding", async () => {
    // Simulate a record written before account binding existed.
    const legacy = makeRecord();
    delete (legacy as any).buyerPubkey;
    window.localStorage.setItem(
      "shopstr.pendingSellerLightningPayouts",
      JSON.stringify([legacy])
    );

    await expect(
      resolvePendingSellerLightningPayout(legacy, nostr, signer, "buyer-pubkey")
    ).resolves.toEqual({ status: "not-owner" });

    expect(mockLoadMint).not.toHaveBeenCalled();
    expect(getPendingSellerLightningPayouts()).toHaveLength(1);
  });

  it("reports unknown when the mint stalls past the deadline", async () => {
    seedRecord();
    mockCheckMeltQuoteBolt11.mockReturnValue(new Promise(() => {}));

    const result = await resolvePendingSellerLightningPayout(
      makeRecord(),
      nostr,
      signer,
      "buyer-pubkey",
      { timeoutMs: 50 }
    );

    expect(result.status).toBe("unknown");
    expect(result).toMatchObject({
      reason: expect.stringMatching(/timed out/),
    });
    expect(getPendingSellerLightningPayouts()).toHaveLength(1);
  });

  it("refuses to resolve a record bound to a different account", async () => {
    seedRecord();

    await expect(
      resolvePendingSellerLightningPayout(
        makeRecord(),
        nostr,
        signer,
        "someone-else"
      )
    ).resolves.toEqual({ status: "not-owner" });

    expect(mockLoadMint).not.toHaveBeenCalled();
    expect(getPendingSellerLightningPayouts()).toHaveLength(1);
  });

  it("clears the record when the mint reports the quote PAID and recoverable proofs are already in the wallet", async () => {
    seedRecord();
    storage.setJson(STORAGE_KEYS.TOKENS, [recoverableProof]);
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "PAID" });

    await expect(
      resolvePendingSellerLightningPayout(
        makeRecord(),
        nostr,
        signer,
        "buyer-pubkey"
      )
    ).resolves.toEqual({ status: "completed" });

    expect(mockCheckProofsStates).not.toHaveBeenCalled();
    expect(getPendingSellerLightningPayouts()).toHaveLength(0);
  });

  it("re-restores missing recoverable proofs on PAID when the checkout-time restore failed", async () => {
    seedRecord();
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "PAID" });
    mockCheckProofsStates.mockResolvedValue([{ state: "UNSPENT" }]);

    await expect(
      resolvePendingSellerLightningPayout(
        makeRecord(),
        nostr,
        signer,
        "buyer-pubkey"
      )
    ).resolves.toEqual({ status: "completed" });

    expect(storedSecrets()).toContain("recoverable-secret");
    expect(getPendingSellerLightningPayouts()).toHaveLength(0);
  });

  it("keeps the record untouched while the quote is PENDING", async () => {
    seedRecord();
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "PENDING" });

    const result = await resolvePendingSellerLightningPayout(
      makeRecord(),
      nostr,
      signer,
      "buyer-pubkey"
    );

    expect(result.status).toBe("still-pending");
    expect(getPendingSellerLightningPayouts()).toHaveLength(1);
    expect(storedSecrets()).toHaveLength(0);
  });

  it("reports unknown when the mint cannot be reached for the quote check", async () => {
    seedRecord();
    mockCheckMeltQuoteBolt11.mockRejectedValue(new Error("connection refused"));

    const result = await resolvePendingSellerLightningPayout(
      makeRecord(),
      nostr,
      signer,
      "buyer-pubkey"
    );

    expect(result.status).toBe("unknown");
    expect(result).toMatchObject({
      reason: expect.stringMatching(/connection refused/),
    });
    expect(getPendingSellerLightningPayouts()).toHaveLength(1);
  });

  it("flags needs-attention for an unrecognized quote state", async () => {
    seedRecord();
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "EXPIRED" });

    const result = await resolvePendingSellerLightningPayout(
      makeRecord(),
      nostr,
      signer,
      "buyer-pubkey"
    );

    expect(result.status).toBe("needs-attention");
    expect(getPendingSellerLightningPayouts()).toHaveLength(1);
    expect(storedSecrets()).toHaveLength(0);
  });

  it("restores quarantined proofs on UNPAID without duplicating already-present recoverable proofs", async () => {
    seedRecord();
    // Checkout-time restore already put the recoverable proof in the wallet.
    storage.setJson(STORAGE_KEYS.TOKENS, [recoverableProof]);
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "UNPAID" });
    mockCheckProofsStates.mockResolvedValue([{ state: "UNSPENT" }]);

    await expect(
      resolvePendingSellerLightningPayout(
        makeRecord(),
        nostr,
        signer,
        "buyer-pubkey"
      )
    ).resolves.toEqual({ status: "recovered", recoveredAmount: 983 });

    // Only the missing quarantined proof was state-checked and restored.
    expect(mockCheckProofsStates).toHaveBeenCalledWith([quarantinedProof]);
    expect(storedSecrets().sort()).toEqual(
      ["quarantined-secret", "recoverable-secret"].sort()
    );
    expect(getPendingSellerLightningPayouts()).toHaveLength(0);
  });

  it("keeps the record when the payout is unpaid but a proof is still PENDING at the mint", async () => {
    seedRecord();
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "UNPAID" });
    mockCheckProofsStates.mockResolvedValue([
      { state: "PENDING" },
      { state: "UNSPENT" },
    ]);

    const result = await resolvePendingSellerLightningPayout(
      makeRecord(),
      nostr,
      signer,
      "buyer-pubkey"
    );

    expect(result.status).toBe("still-pending");
    expect(storedSecrets()).toHaveLength(0);
    expect(getPendingSellerLightningPayouts()).toHaveLength(1);
  });

  it("flags needs-attention when the mint says unpaid but a quarantined proof is SPENT", async () => {
    seedRecord();
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "UNPAID" });
    mockCheckProofsStates.mockResolvedValue([
      { state: "SPENT" },
      { state: "UNSPENT" },
    ]);

    const result = await resolvePendingSellerLightningPayout(
      makeRecord(),
      nostr,
      signer,
      "buyer-pubkey"
    );

    expect(result.status).toBe("needs-attention");
    expect(storedSecrets()).toHaveLength(0);
    expect(getPendingSellerLightningPayouts()).toHaveLength(1);
  });

  it("flags needs-attention on a malformed proof-state response", async () => {
    seedRecord();
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "UNPAID" });
    mockCheckProofsStates.mockResolvedValue([{ state: "UNSPENT" }]); // too few

    const result = await resolvePendingSellerLightningPayout(
      makeRecord(),
      nostr,
      signer,
      "buyer-pubkey"
    );

    expect(result.status).toBe("needs-attention");
    expect(storedSecrets()).toHaveLength(0);
    expect(getPendingSellerLightningPayouts()).toHaveLength(1);
  });

  it("notifies the seller before clearing the record when the mint reports PAID", async () => {
    seedRecord();
    storage.setJson(STORAGE_KEYS.TOKENS, [recoverableProof]);
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "PAID" });
    const notifySeller = jest.fn().mockResolvedValue(undefined);

    await expect(
      resolvePendingSellerLightningPayout(
        makeRecord(),
        nostr,
        signer,
        "buyer-pubkey",
        { notifySeller }
      )
    ).resolves.toEqual({ status: "completed" });

    expect(notifySeller).toHaveBeenCalledTimes(1);
    expect(notifySeller).toHaveBeenCalledWith(
      expect.objectContaining({
        meltQuoteId: "melt-quote-1",
        sellerPubkey: "seller-pubkey",
      })
    );
    expect(getPendingSellerLightningPayouts()).toHaveLength(0);
  });

  it("keeps the record and surfaces notify-failed when the seller notification fails", async () => {
    seedRecord();
    storage.setJson(STORAGE_KEYS.TOKENS, [recoverableProof]);
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "PAID" });
    const notifySeller = jest
      .fn()
      .mockRejectedValue(new Error("no relays available"));

    const result = await resolvePendingSellerLightningPayout(
      makeRecord(),
      nostr,
      signer,
      "buyer-pubkey",
      { notifySeller }
    );

    expect(result.status).toBe("notify-failed");
    expect(result).toMatchObject({
      reason: expect.stringMatching(/no relays available/),
    });
    // The record is kept so the buyer can retry the notification.
    expect(getPendingSellerLightningPayouts()).toHaveLength(1);
  });

  it("retries the notification and clears the record on a later attempt", async () => {
    seedRecord();
    storage.setJson(STORAGE_KEYS.TOKENS, [recoverableProof]);
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "PAID" });
    const notifySeller = jest
      .fn()
      .mockRejectedValueOnce(new Error("relay offline"))
      .mockResolvedValueOnce(undefined);

    const first = await resolvePendingSellerLightningPayout(
      makeRecord(),
      nostr,
      signer,
      "buyer-pubkey",
      { notifySeller }
    );
    expect(first.status).toBe("notify-failed");
    expect(getPendingSellerLightningPayouts()).toHaveLength(1);

    const second = await resolvePendingSellerLightningPayout(
      makeRecord(),
      nostr,
      signer,
      "buyer-pubkey",
      { notifySeller }
    );
    expect(second).toEqual({ status: "completed" });
    expect(notifySeller).toHaveBeenCalledTimes(2);
    expect(getPendingSellerLightningPayouts()).toHaveLength(0);
  });

  it("never notifies the seller when the payout did not confirm (PENDING/UNPAID)", async () => {
    seedRecord();
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "PENDING" });
    const notifySeller = jest.fn();

    await resolvePendingSellerLightningPayout(
      makeRecord(),
      nostr,
      signer,
      "buyer-pubkey",
      { notifySeller }
    );
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "UNPAID" });
    mockCheckProofsStates.mockResolvedValue([
      { state: "UNSPENT" },
      { state: "UNSPENT" },
    ]);
    await resolvePendingSellerLightningPayout(
      makeRecord(),
      nostr,
      signer,
      "buyer-pubkey",
      { notifySeller }
    );

    expect(notifySeller).not.toHaveBeenCalled();
  });

  it("sends the buyer receipt after the seller notification when the mint reports PAID", async () => {
    seedRecord();
    storage.setJson(STORAGE_KEYS.TOKENS, [recoverableProof]);
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "PAID" });
    const callOrder: string[] = [];
    const notifySeller = jest.fn().mockImplementation(async () => {
      callOrder.push("seller");
    });
    const notifyBuyer = jest.fn().mockImplementation(async () => {
      callOrder.push("buyer");
    });

    await expect(
      resolvePendingSellerLightningPayout(
        makeRecord(),
        nostr,
        signer,
        "buyer-pubkey",
        { notifySeller, notifyBuyer }
      )
    ).resolves.toEqual({ status: "completed" });

    // The seller DM is critical, so it goes first; the receipt follows.
    expect(callOrder).toEqual(["seller", "buyer"]);
    expect(notifyBuyer).toHaveBeenCalledWith(
      expect.objectContaining({ meltQuoteId: "melt-quote-1" })
    );
    expect(getPendingSellerLightningPayouts()).toHaveLength(0);
  });

  it("clears the record and reports completed with receiptError when the buyer receipt fails", async () => {
    seedRecord();
    storage.setJson(STORAGE_KEYS.TOKENS, [recoverableProof]);
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "PAID" });
    const notifySeller = jest.fn().mockResolvedValue(undefined);
    const notifyBuyer = jest
      .fn()
      .mockRejectedValue(new Error("no relays available"));

    const result = await resolvePendingSellerLightningPayout(
      makeRecord(),
      nostr,
      signer,
      "buyer-pubkey",
      { notifySeller, notifyBuyer }
    );

    // The seller was paid and notified, so the payout resolves — the
    // receipt failure is surfaced separately and never keeps the record.
    expect(result).toEqual({
      status: "completed",
      receiptError: "no relays available",
    });
    expect(getPendingSellerLightningPayouts()).toHaveLength(0);
  });

  it("never sends the buyer receipt when the seller notification fails", async () => {
    seedRecord();
    storage.setJson(STORAGE_KEYS.TOKENS, [recoverableProof]);
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "PAID" });
    const notifySeller = jest
      .fn()
      .mockRejectedValue(new Error("relay offline"));
    const notifyBuyer = jest.fn();

    const result = await resolvePendingSellerLightningPayout(
      makeRecord(),
      nostr,
      signer,
      "buyer-pubkey",
      { notifySeller, notifyBuyer }
    );

    expect(result.status).toBe("notify-failed");
    expect(notifyBuyer).not.toHaveBeenCalled();
    expect(getPendingSellerLightningPayouts()).toHaveLength(1);
  });

  it("stamps the record as notified so a retry after a record-removal failure does not re-send the seller DM", async () => {
    seedRecord();
    storage.setJson(STORAGE_KEYS.TOKENS, [recoverableProof]);
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "PAID" });
    const notifySeller = jest.fn().mockResolvedValue(undefined);
    const notifyBuyer = jest.fn().mockResolvedValue(undefined);

    // First attempt: the notifiedAt mark lands, but the record removal
    // fails (e.g. storage quota pressure between the two writes).
    const originalSetItem = Storage.prototype.setItem;
    let payoutWrites = 0;
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (this: Storage, key: string, value: string) {
        if (key === "shopstr.pendingSellerLightningPayouts") {
          payoutWrites += 1;
          if (payoutWrites === 2) throw new Error("quota exceeded");
        }
        return originalSetItem.call(this, key, value);
      });

    let first;
    try {
      first = await resolvePendingSellerLightningPayout(
        makeRecord(),
        nostr,
        signer,
        "buyer-pubkey",
        { notifySeller, notifyBuyer }
      );
    } finally {
      setItem.mockRestore();
    }
    expect(first.status).toBe("unknown");
    expect(notifySeller).toHaveBeenCalledTimes(1);
    expect(notifyBuyer).toHaveBeenCalledTimes(1);
    const storedRecords = getPendingSellerLightningPayouts();
    expect(storedRecords).toHaveLength(1);
    expect(storedRecords[0]!.notifiedAt).toEqual(expect.any(Number));

    // Retry: the mint still says PAID, but the record is already stamped —
    // neither DM is re-sent and the record is simply cleared.
    const second = await resolvePendingSellerLightningPayout(
      storedRecords[0]!,
      nostr,
      signer,
      "buyer-pubkey",
      { notifySeller, notifyBuyer }
    );
    expect(second).toEqual({ status: "completed" });
    expect(notifySeller).toHaveBeenCalledTimes(1);
    expect(notifyBuyer).toHaveBeenCalledTimes(1);
    expect(getPendingSellerLightningPayouts()).toHaveLength(0);
  });

  it("falls back to re-sending the seller DM when the notifiedAt mark itself could not be persisted", async () => {
    seedRecord();
    storage.setJson(STORAGE_KEYS.TOKENS, [recoverableProof]);
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "PAID" });
    const notifySeller = jest.fn().mockResolvedValue(undefined);

    // All payout-record writes fail: the mark never lands, so the removal
    // fails too and the retry cannot know the DM already went out.
    const originalSetItem = Storage.prototype.setItem;
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (this: Storage, key: string, value: string) {
        if (key === "shopstr.pendingSellerLightningPayouts") {
          throw new Error("quota exceeded");
        }
        return originalSetItem.call(this, key, value);
      });

    let first;
    try {
      first = await resolvePendingSellerLightningPayout(
        makeRecord(),
        nostr,
        signer,
        "buyer-pubkey",
        { notifySeller }
      );
    } finally {
      setItem.mockRestore();
    }
    expect(first.status).toBe("unknown");
    const keptRecords = getPendingSellerLightningPayouts();
    expect(keptRecords).toHaveLength(1);
    expect(keptRecords[0]!.notifiedAt).toBeUndefined();

    // The retry re-sends the DM — a duplicate is the accepted at-least-once
    // fallback when the notifiedAt mark cannot be persisted.
    const second = await resolvePendingSellerLightningPayout(
      makeRecord(),
      nostr,
      signer,
      "buyer-pubkey",
      { notifySeller }
    );
    expect(second).toEqual({ status: "completed" });
    expect(notifySeller).toHaveBeenCalledTimes(2);
    expect(getPendingSellerLightningPayouts()).toHaveLength(0);
  });

  it("never sends the buyer receipt when the payout did not confirm (PENDING/UNPAID)", async () => {
    seedRecord();
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "PENDING" });
    const notifyBuyer = jest.fn();

    await resolvePendingSellerLightningPayout(
      makeRecord(),
      nostr,
      signer,
      "buyer-pubkey",
      { notifyBuyer }
    );
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "UNPAID" });
    mockCheckProofsStates.mockResolvedValue([
      { state: "UNSPENT" },
      { state: "UNSPENT" },
    ]);
    await resolvePendingSellerLightningPayout(
      makeRecord(),
      nostr,
      signer,
      "buyer-pubkey",
      { notifyBuyer }
    );

    expect(notifyBuyer).not.toHaveBeenCalled();
  });

  it("keeps the record when the wallet write cannot be confirmed by read-back", async () => {
    seedRecord();
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "UNPAID" });
    mockCheckProofsStates.mockResolvedValue([
      { state: "UNSPENT" },
      { state: "UNSPENT" },
    ]);
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota exceeded");
      });

    try {
      const result = await resolvePendingSellerLightningPayout(
        makeRecord(),
        nostr,
        signer,
        "buyer-pubkey"
      );

      expect(result.status).toBe("unknown");
      expect(result).toMatchObject({
        reason: expect.stringMatching(/could not be confirmed/),
      });
    } finally {
      setItem.mockRestore();
    }
    expect(getPendingSellerLightningPayouts()).toHaveLength(1);
    expect(storedSecrets()).toHaveLength(0);
  });

  it("never double-inserts a proof that lands in the wallet while the mint check is in flight", async () => {
    seedRecord();
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "UNPAID" });
    mockCheckProofsStates.mockImplementation(async () => {
      // The checkout catch handler (or another tab) restores the quarantined
      // proof after missingFromWallet() already ran for the state check.
      storage.setJson(STORAGE_KEYS.TOKENS, [quarantinedProof]);
      return [{ state: "UNSPENT" }, { state: "UNSPENT" }];
    });

    await expect(
      resolvePendingSellerLightningPayout(
        makeRecord(),
        nostr,
        signer,
        "buyer-pubkey"
      )
    ).resolves.toEqual({ status: "recovered", recoveredAmount: 17 });

    const secrets = storedSecrets();
    expect(secrets.filter((secret) => secret === "quarantined-secret")).toHaveLength(1);
    expect(secrets.filter((secret) => secret === "recoverable-secret")).toHaveLength(1);
    expect(getPendingSellerLightningPayouts()).toHaveLength(0);
  });

  it("retry after a partial restore is idempotent and never double-counts proofs", async () => {

    seedRecord();
    storage.setJson(STORAGE_KEYS.TOKENS, [recoverableProof]);
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "UNPAID" });
    mockCheckProofsStates.mockResolvedValue([{ state: "UNSPENT" }]);

    // First attempt: restore succeeds, record removal fails.
    const originalSetItem = Storage.prototype.setItem;
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (this: Storage, key: string, value: string) {
        if (key === "shopstr.pendingSellerLightningPayouts") {
          throw new Error("quota exceeded");
        }
        return originalSetItem.call(this, key, value);
      });

    let first;
    try {
      first = await resolvePendingSellerLightningPayout(
        makeRecord(),
        nostr,
        signer,
        "buyer-pubkey"
      );
    } finally {
      setItem.mockRestore();
    }
    expect(first.status).toBe("unknown");
    expect(storedSecrets()).toContain("quarantined-secret");
    expect(getPendingSellerLightningPayouts()).toHaveLength(1);

    // Retry: nothing missing, so no restore — record is simply cleared.
    const second = await resolvePendingSellerLightningPayout(
      makeRecord(),
      nostr,
      signer,
      "buyer-pubkey"
    );
    expect(second).toEqual({ status: "recovered", recoveredAmount: 0 });
    expect(
      storedSecrets().filter((secret) => secret === "quarantined-secret")
    ).toHaveLength(1);
    expect(getPendingSellerLightningPayouts()).toHaveLength(0);
  });
});

// These tests run the REAL notification path (gift-wrap construction,
// durable cache write, relay publish) with only the network stubbed, so a
// swallowed cache or publish failure can never masquerade as "seller
// notified" — the record must survive for a retry.
describe("seller notification delivery through the recovery flow", () => {
  // nip44 requires real curve points, so these must be genuine pubkeys.
  const SELLER_HEX = getPublicKey(generateSecretKey());
  const BUYER_HEX = getPublicKey(generateSecretKey());
  const originalFetch = (global as any).fetch;

  beforeEach(() => {
    (global as any).fetch = jest.fn();
  });
  afterAll(() => {
    (global as any).fetch = originalFetch;
  });

  const realNotify =
    (publish: jest.Mock) => (record: PendingSellerLightningPayout) =>
      notifySellerOfCompletedPayout({
        nostr: { publish } as any,
        signer: {} as any,
        record,
        buyerPubkey: BUYER_HEX,
      });

  function seedHexRecord() {
    const overrides = { sellerPubkey: SELLER_HEX };
    seedRecord(overrides);
    storage.setJson(STORAGE_KEYS.TOKENS, [recoverableProof]);
    mockCheckMeltQuoteBolt11.mockResolvedValue({ state: "PAID" });
    return makeRecord(overrides);
  }

  it("keeps the record and reports notify-failed when the DM cannot be durably cached", async () => {
    const record = seedHexRecord();
    ((global as any).fetch as jest.Mock).mockResolvedValue({ ok: false });
    const publish = jest.fn();

    const result = await resolvePendingSellerLightningPayout(
      record,
      nostr,
      signer,
      "buyer-pubkey",
      { notifySeller: realNotify(publish) }
    );

    expect(result.status).toBe("notify-failed");
    expect(getPendingSellerLightningPayouts()).toHaveLength(1);
    expect((global as any).fetch).toHaveBeenCalledWith(
      "/api/db/cache-event",
      expect.objectContaining({ method: "POST" })
    );
    // The strict cache write fails before any relay publish is attempted.
    expect(publish).not.toHaveBeenCalled();
  }, 20000);

  it("keeps the record and reports notify-failed when no relay accepts the DM", async () => {
    const record = seedHexRecord();
    ((global as any).fetch as jest.Mock).mockResolvedValue({ ok: true });
    const publish = jest
      .fn()
      .mockResolvedValue([
        { status: "rejected", reason: new Error("blocked") },
      ]);

    const result = await resolvePendingSellerLightningPayout(
      record,
      nostr,
      signer,
      "buyer-pubkey",
      { notifySeller: realNotify(publish) }
    );

    expect(result.status).toBe("notify-failed");
    expect(result).toMatchObject({
      reason: expect.stringMatching(/No relay accepted/),
    });
    expect(getPendingSellerLightningPayouts()).toHaveLength(1);
  }, 20000);

  it("completes once the DM is durably cached and at least one relay accepts it", async () => {
    const record = seedHexRecord();
    ((global as any).fetch as jest.Mock).mockResolvedValue({ ok: true });
    const publish = jest
      .fn()
      .mockResolvedValue([
        { status: "rejected", reason: new Error("blocked") },
        { status: "fulfilled", value: "wss://relay.one" },
      ]);

    const result = await resolvePendingSellerLightningPayout(
      record,
      nostr,
      signer,
      "buyer-pubkey",
      { notifySeller: realNotify(publish) }
    );

    expect(result).toEqual({ status: "completed" });
    expect(getPendingSellerLightningPayouts()).toHaveLength(0);
    expect(publish).toHaveBeenCalledTimes(1);
  }, 20000);
});
