/**
 * @jest-environment jsdom
 */
import { resolvePendingSellerLightningPayout } from "../resolve-pending-payouts";
import { storage, STORAGE_KEYS } from "@/utils/storage";
import {
  getPendingSellerLightningPayouts,
  recordPendingSellerLightningPayout,
} from "../pending-lightning-payouts";

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  publishProofEvent: jest.fn().mockResolvedValue(undefined),
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
      50
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
