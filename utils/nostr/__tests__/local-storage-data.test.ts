import {
  clearPendingIncomingProofs,
  LogOut,
  getDefaultBlossomServer,
  getDefaultMint,
  getDefaultRelays,
  getLocalStorageData,
  readPendingIncomingProofs,
  setLocalCashuTokens,
  stagePendingIncomingProofs,
} from "../nostr-helper-functions";

describe("getLocalStorageData", () => {
  beforeEach(() => {
    LogOut();
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

  it("keeps cashu proofs in runtime memory only", () => {
    setLocalCashuTokens([
      {
        id: "00d0a1b24d1c1a53",
        amount: 5,
        secret: "secret-1",
        C: "C1",
      } as any,
    ]);

    const data = getLocalStorageData();

    expect(data.tokens).toEqual([
      {
        id: "00d0a1b24d1c1a53",
        amount: 5,
        secret: "secret-1",
        C: "C1",
      },
    ]);
    expect(localStorage.getItem("tokens")).toBeNull();
  });

  it("stages incoming proofs as encrypted pending records", async () => {
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("pubkey"),
      encrypt: jest.fn().mockResolvedValue("cipher-text"),
      decrypt: jest.fn().mockResolvedValue(
        JSON.stringify({
          mint: "https://mint.example",
          proofs: [
            {
              id: "00d0a1b24d1c1a53",
              amount: 9,
              secret: "secret-9",
              C: "C9",
            },
          ],
          amount: "9",
        })
      ),
    } as any;

    const pendingId = await stagePendingIncomingProofs(
      signer,
      "https://mint.example",
      [
        {
          id: "00d0a1b24d1c1a53",
          amount: 9,
          secret: "secret-9",
          C: "C9",
        } as any,
      ],
      "9"
    );

    expect(localStorage.getItem("pendingIncomingProofs")).toContain(
      "cipher-text"
    );

    const pendingProofs = await readPendingIncomingProofs(signer);
    expect(pendingProofs).toEqual([
      {
        id: pendingId,
        mint: "https://mint.example",
        proofs: [
          {
            id: "00d0a1b24d1c1a53",
            amount: 9,
            secret: "secret-9",
            C: "C9",
          },
        ],
        amount: "9",
      },
    ]);
  });

  it("clears pending incoming proof records after sync", async () => {
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("pubkey"),
      encrypt: jest.fn().mockResolvedValue("cipher-text"),
      decrypt: jest.fn().mockResolvedValue(
        JSON.stringify({
          mint: "https://mint.example",
          proofs: [],
          amount: "0",
        })
      ),
    } as any;

    const pendingId = await stagePendingIncomingProofs(
      signer,
      "https://mint.example",
      [],
      "0"
    );
    clearPendingIncomingProofs([pendingId]);

    expect(localStorage.getItem("pendingIncomingProofs")).toBeNull();
  });

  it("removes legacy persisted cashu proofs on read", () => {
    localStorage.setItem(
      "tokens",
      JSON.stringify([
        {
          id: "00d0a1b24d1c1a53",
          amount: 7,
          secret: "legacy-secret",
          C: "legacy-C",
        },
      ])
    );

    const data = getLocalStorageData();

    expect(data.tokens).toEqual([
      {
        id: "00d0a1b24d1c1a53",
        amount: 7,
        secret: "legacy-secret",
        C: "legacy-C",
      },
    ]);
    expect(localStorage.getItem("tokens")).toBeNull();
  });
});
