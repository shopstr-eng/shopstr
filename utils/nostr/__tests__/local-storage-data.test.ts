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
    localStorage.setItem("signer", JSON.stringify({ type: "bad" }));

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

  it("accepts a marker-only nip46 stored signer", () => {
    localStorage.setItem("signer", JSON.stringify({ type: "nip46" }));

    const data = getLocalStorageData();

    expect(data.signer).toEqual({ type: "nip46" });
    expect(localStorage.getItem("signer")).toBe(
      JSON.stringify({ type: "nip46" })
    );
  });

  it("reconstructs a marker-only nip46 signer from separate bunker keys", () => {
    localStorage.setItem("signer", JSON.stringify({ type: "nip46" }));
    localStorage.setItem("clientPrivkey", "client-private-key");
    localStorage.setItem("bunkerRemotePubkey", "remote-pubkey");
    localStorage.setItem("bunkerRelays", JSON.stringify(["wss://relay.one"]));
    localStorage.setItem("bunkerSecret", "stored-secret");

    const data = getLocalStorageData();

    expect(data.signer).toEqual({
      type: "nip46",
      bunker:
        "bunker://remote-pubkey?secret=stored-secret&relay=wss://relay.one",
      appPrivKey: "client-private-key",
    });
    expect(localStorage.getItem("signer")).toBe(
      JSON.stringify({ type: "nip46" })
    );
  });

  it("stores only a safe nip46 signer marker while keeping runtime signer data", () => {
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
    expect(localStorage.getItem("signer")).toBe(
      JSON.stringify({ type: "nip46" })
    );
  });

  it("migrates legacy persisted bunker signer data to a safe marker on read", () => {
    localStorage.setItem(
      "signer",
      JSON.stringify({
        type: "nip46",
        bunker: "bunker://pubkey?secret=legacysecret",
        appPrivKey: "legacy-app-privkey",
      })
    );
    localStorage.setItem("clientPrivkey", "client-private-key");
    localStorage.setItem("bunkerRemotePubkey", "remote-pubkey");
    localStorage.setItem("bunkerRelays", JSON.stringify(["wss://relay.one"]));
    localStorage.setItem("bunkerSecret", "stored-secret");

    const data = getLocalStorageData();

    expect(data.signer).toEqual({
      type: "nip46",
      bunker:
        "bunker://remote-pubkey?secret=stored-secret&relay=wss://relay.one",
      appPrivKey: "client-private-key",
    });
    expect(localStorage.getItem("signer")).toBe(
      JSON.stringify({ type: "nip46" })
    );
  });
});
