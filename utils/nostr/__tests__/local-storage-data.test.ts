import {
  LogOut,
  getDefaultBlossomServer,
  getDefaultMint,
  getDefaultRelays,
  getLocalStorageData,
  setLocalStorageDataOnSignIn,
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

  it("keeps bunker signer data in runtime memory only", () => {
    setLocalStorageDataOnSignIn({
      signer: {
        toJSON: () => ({
          type: "nip46",
          bunker: "bunker://pubkey?secret=supersecret",
          appPrivKey: "app-private-key",
        }),
      } as any,
    });

    const data = getLocalStorageData();

    expect(data.signer).toEqual({
      type: "nip46",
      bunker: "bunker://pubkey?secret=supersecret",
      appPrivKey: "app-private-key",
    });
    expect(localStorage.getItem("signer")).toBeNull();
  });

  it("removes legacy persisted bunker signer data on read", () => {
    localStorage.setItem(
      "signer",
      JSON.stringify({
        type: "nip46",
        bunker: "bunker://pubkey?secret=legacysecret",
        appPrivKey: "legacy-app-privkey",
      })
    );

    const data = getLocalStorageData();

    expect(data.signer).toBeUndefined();
    expect(localStorage.getItem("signer")).toBeNull();
  });
});
