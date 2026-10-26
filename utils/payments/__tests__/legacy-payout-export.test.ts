/**
 * @jest-environment jsdom
 */
import { getEncodedToken } from "@cashu/cashu-ts";
import { buildLegacyPayoutExportToken } from "../legacy-payout-export";
import { storage, STORAGE_KEYS } from "@/utils/storage";

jest.mock("@cashu/cashu-ts", () => ({
  getEncodedToken: jest.fn().mockReturnValue("cashuBexported"),
}));

const mockGetEncodedToken = getEncodedToken as jest.Mock;

const quarantinedProof = {
  id: "keyset-1",
  amount: 983,
  secret: "quarantined-secret",
  C: "quarantined-C",
} as any;
const recoverableProof = {
  id: "keyset-1",
  amount: 17,
  secret: "recoverable-secret",
  C: "recoverable-C",
} as any;

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "order-1",
    mintUrl: "https://mint.example",
    sellerPubkey: "seller-pubkey",
    // No buyerPubkey: legacy records predate account binding.
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

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});

describe("buildLegacyPayoutExportToken", () => {
  it("encodes the quarantined and recoverable proofs for the record's mint", () => {
    const token = buildLegacyPayoutExportToken(makeRecord());

    expect(token).toBe("cashuBexported");
    expect(mockGetEncodedToken).toHaveBeenCalledWith({
      mint: "https://mint.example",
      proofs: [quarantinedProof, recoverableProof],
      memo: expect.stringContaining("order-1"),
    });
  });

  it("refuses to export a record bound to an account, even the owner's", () => {
    expect(() =>
      buildLegacyPayoutExportToken(
        makeRecord({ buyerPubkey: "buyer-pubkey" })
      )
    ).toThrow(/bound to an account/);
    expect(mockGetEncodedToken).not.toHaveBeenCalled();
  });

  it("excludes proofs already present in the local wallet", () => {
    storage.setJson(STORAGE_KEYS.TOKENS, [recoverableProof]);

    buildLegacyPayoutExportToken(makeRecord());

    expect(mockGetEncodedToken).toHaveBeenCalledWith(
      expect.objectContaining({ proofs: [quarantinedProof] })
    );
  });

  it("dedupes proofs that appear in both proof lists", () => {
    buildLegacyPayoutExportToken(
      makeRecord({ recoverableProofs: [quarantinedProof, recoverableProof] })
    );

    expect(mockGetEncodedToken).toHaveBeenCalledWith(
      expect.objectContaining({
        proofs: [quarantinedProof, recoverableProof],
      })
    );
  });

  it("throws when every proof is already in the wallet", () => {
    storage.setJson(STORAGE_KEYS.TOKENS, [quarantinedProof, recoverableProof]);

    expect(() => buildLegacyPayoutExportToken(makeRecord())).toThrow(
      /nothing to export/
    );
    expect(mockGetEncodedToken).not.toHaveBeenCalled();
  });
});
