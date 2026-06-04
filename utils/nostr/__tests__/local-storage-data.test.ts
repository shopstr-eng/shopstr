import {
  getDefaultBlossomServer,
  getDefaultMint,
  getDefaultRelays,
  getLocalStorageData,
  setCachedCashuProofs,
} from "../nostr-helper-functions";

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

  it("keeps Cashu proofs out of localStorage and reads the volatile cache", () => {
    const proofs = [
      {
        id: "00d0a1b24d1c1a53",
        amount: 1,
        secret: "proof-secret",
        C: "proof-c",
      },
    ] as any;

    localStorage.setItem("tokens", JSON.stringify([{ secret: "legacy" }]));
    setCachedCashuProofs(proofs);

    const data = getLocalStorageData();

    expect(data.tokens).toEqual(proofs);
    expect(localStorage.getItem("tokens")).toBeNull();
  });
});
