import {
  getPendingCashuProofPublishes,
  getDefaultBlossomServer,
  getDefaultMint,
  getDefaultRelays,
  getLocalStorageData,
  getStoredLegacyCashuProofs,
  removeStoredLegacyCashuProofs,
  retryPendingCashuProofPublishes,
  queuePendingCashuProofPublish,
  setCachedCashuProofs,
} from "../nostr-helper-functions";

const mockProof = {
  id: "00d0a1b24d1c1a53",
  amount: 1,
  secret: "proof-secret",
  C: "proof-c",
} as any;

describe("getLocalStorageData", () => {
  beforeEach(() => {
    localStorage.clear();
    setCachedCashuProofs([]);
    jest.restoreAllMocks();
  });

  it("returns safe defaults for missing keys", () => {
    const data = getLocalStorageData();

    expect(data.relays).toEqual(getDefaultRelays());
    expect(data.mints).toEqual([getDefaultMint()]);
    expect(data.blossomServers).toEqual([getDefaultBlossomServer()]);
    expect(data.tokens).toEqual([]);
    expect(data.history).toEqual([]);
  });

  it("recovers from malformed JSON in critical keys", () => {
    localStorage.setItem("relays", "{bad");
    localStorage.setItem("readRelays", "{bad");
    localStorage.setItem("writeRelays", "{bad");
    localStorage.setItem("mints", "{bad");
    localStorage.setItem("blossomServers", "{bad");
    localStorage.setItem("tokens", "{bad");
    localStorage.setItem("history", "{bad");
    localStorage.setItem("bunkerRelays", "{bad");
    localStorage.setItem("signer", "{bad");

    expect(() => getLocalStorageData()).not.toThrow();

    const data = getLocalStorageData();
    expect(data.relays).toEqual(getDefaultRelays());
    expect(data.readRelays).toEqual([]);
    expect(data.writeRelays).toEqual([]);
    expect(data.mints).toEqual([getDefaultMint()]);
    expect(data.blossomServers).toEqual([getDefaultBlossomServer()]);
    expect(data.tokens).toEqual([]);
    expect(data.history).toEqual([]);
    expect(data.bunkerRelays).toEqual([]);
  });

  it("falls back to signInMethod signer when stored signer shape is invalid", () => {
    localStorage.setItem("signInMethod", "extension");
    localStorage.setItem("signer", JSON.stringify({ type: "nip46" }));

    const data = getLocalStorageData();

    expect(data.signer).toEqual({ type: "nip07" });
  });

  it("keeps valid stored signer shape", () => {
    localStorage.setItem(
      "signer",
      JSON.stringify({
        type: "nsec",
        encryptedPrivKey: "ncryptsec1mock",
      })
    );

    const data = getLocalStorageData();

    expect(data.signer).toEqual({
      type: "nsec",
      encryptedPrivKey: "ncryptsec1mock",
    });
  });

  it("reads volatile Cashu proofs without writing them to localStorage", () => {
    setCachedCashuProofs([mockProof]);

    const data = getLocalStorageData();

    expect(data.tokens).toEqual([mockProof]);
    expect(localStorage.getItem("tokens")).toBeNull();
  });

  it("keeps valid legacy Cashu proofs until migration removes them", () => {
    localStorage.setItem("tokens", JSON.stringify([mockProof]));

    const data = getLocalStorageData();

    expect(data.tokens).toEqual([mockProof]);
    expect(getStoredLegacyCashuProofs()).toEqual([mockProof]);
    expect(localStorage.getItem("tokens")).toBe(JSON.stringify([mockProof]));
  });

  it("filters malformed legacy Cashu proof entries without wiping valid ones", () => {
    localStorage.setItem(
      "tokens",
      JSON.stringify([mockProof, { secret: "missing-required-fields" }])
    );

    expect(getStoredLegacyCashuProofs()).toEqual([mockProof]);
    expect(JSON.parse(localStorage.getItem("tokens") ?? "[]")).toEqual([
      mockProof,
    ]);
  });

  it("removes only migrated legacy Cashu proofs", () => {
    const secondProof = { ...mockProof, secret: "second", C: "second-c" };
    localStorage.setItem("tokens", JSON.stringify([mockProof, secondProof]));

    removeStoredLegacyCashuProofs([mockProof]);

    expect(getStoredLegacyCashuProofs()).toEqual([secondProof]);
  });

  it("queues encrypted Cashu proof publishes and retries them", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("pubkey"),
      encrypt: jest.fn().mockResolvedValue("encrypted-proofs"),
      decrypt: jest.fn().mockResolvedValue(JSON.stringify([mockProof])),
      sign: jest.fn(async (event) => ({
        ...event,
        id: `signed-${event.kind}`,
        pubkey: "pubkey",
        sig: "sig",
      })),
    } as any;
    const nostr = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as any;

    await queuePendingCashuProofPublish(signer, {
      mint: "https://mint.example",
      proofs: [mockProof],
      direction: "in",
      amount: "1",
    });

    expect(getPendingCashuProofPublishes()).toHaveLength(1);

    await expect(
      retryPendingCashuProofPublishes(nostr, signer)
    ).resolves.toMatchObject({ total: 1, recovered: 1, failed: 0 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/db/cache-event",
      expect.objectContaining({ method: "POST" })
    );
    expect(nostr.publish).toHaveBeenCalled();
    expect(getPendingCashuProofPublishes()).toHaveLength(0);
  });
});
