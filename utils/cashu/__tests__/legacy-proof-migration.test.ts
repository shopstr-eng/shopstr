import { Proof } from "@cashu/cashu-ts";
import { migrateLegacyCashuProofsToWallet } from "../legacy-proof-migration";
import * as NostrHelpers from "@/utils/nostr/nostr-helper-functions";

jest.mock("@/utils/nostr/nostr-helper-functions", () => {
  const actual = jest.requireActual("@/utils/nostr/nostr-helper-functions");
  return {
    ...actual,
    publishProofEvent: jest.fn(),
  };
});

const publishProofEvent = NostrHelpers.publishProofEvent as jest.Mock;

const mkProof = (secret: string, id = "keyset-1", amount = 10): Proof =>
  ({
    id,
    amount,
    secret,
    C: `C-${secret}`,
  }) as unknown as Proof;

describe("migrateLegacyCashuProofsToWallet", () => {
  beforeEach(() => {
    localStorage.clear();
    NostrHelpers.setCachedCashuProofs([]);
    publishProofEvent.mockReset();
    publishProofEvent.mockResolvedValue({ id: "proof-event" });
    localStorage.setItem("mints", JSON.stringify(["https://mint.example"]));
  });

  it("publishes legacy proofs and removes them only after durable persistence", async () => {
    const proof = mkProof("legacy");
    localStorage.setItem("tokens", JSON.stringify([proof]));

    const result = await migrateLegacyCashuProofsToWallet(
      {} as never,
      {} as never,
      { loadMintKeysetIds: async () => ["keyset-1"] }
    );

    expect(result).toMatchObject({
      total: 1,
      migrated: 1,
      remaining: 0,
    });
    expect(publishProofEvent).toHaveBeenCalledWith(
      {},
      {},
      "https://mint.example",
      [proof],
      "in",
      "10"
    );
    expect(localStorage.getItem("tokens")).toBeNull();
    expect(NostrHelpers.getLocalStorageData().tokens).toEqual([proof]);
  });

  it("keeps legacy proofs when durable publish fails", async () => {
    const proof = mkProof("legacy");
    localStorage.setItem("tokens", JSON.stringify([proof]));
    publishProofEvent.mockRejectedValueOnce(new Error("cache unavailable"));

    const result = await migrateLegacyCashuProofsToWallet(
      {} as never,
      {} as never,
      { loadMintKeysetIds: async () => ["keyset-1"] }
    );

    expect(result).toMatchObject({
      total: 1,
      migrated: 0,
      remaining: 1,
      failedMints: ["https://mint.example"],
    });
    expect(JSON.parse(localStorage.getItem("tokens") ?? "[]")).toEqual([proof]);
  });

  it("removes already-persisted legacy proofs without publishing duplicates", async () => {
    const proof = mkProof("legacy");
    localStorage.setItem("tokens", JSON.stringify([proof]));

    const result = await migrateLegacyCashuProofsToWallet(
      {} as never,
      {} as never,
      {
        persistedProofs: [proof],
        loadMintKeysetIds: async () => ["keyset-1"],
      }
    );

    expect(result).toMatchObject({
      total: 1,
      alreadyPersisted: 1,
      migrated: 0,
      remaining: 0,
    });
    expect(publishProofEvent).not.toHaveBeenCalled();
    expect(localStorage.getItem("tokens")).toBeNull();
  });

  it("leaves proofs pending when no configured mint owns their keyset", async () => {
    const proof = mkProof("unknown", "unknown-keyset");
    localStorage.setItem("tokens", JSON.stringify([proof]));

    const result = await migrateLegacyCashuProofsToWallet(
      {} as never,
      {} as never,
      { loadMintKeysetIds: async () => ["keyset-1"] }
    );

    expect(result).toMatchObject({
      total: 1,
      migrated: 0,
      remaining: 1,
    });
    expect(publishProofEvent).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("tokens") ?? "[]")).toEqual([proof]);
  });
});
