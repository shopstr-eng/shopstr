import {
  clearNWCConnection,
  getDefaultBlossomServer,
  getDefaultMint,
  getDefaultRelays,
  getLocalStorageData,
  lockNWCConnection,
  saveEncryptedNWCString,
  saveNWCInfo,
  unlockNWCString,
} from "../nostr-helper-functions";

describe("getLocalStorageData", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
    clearNWCConnection();
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

  it("stores the NWC connection encrypted at rest and keeps the raw value in runtime memory", () => {
    saveEncryptedNWCString(
      "nostr+walletconnect://wallet?relay=wss://relay&secret=abcd",
      "secret-passphrase"
    );
    saveNWCInfo({ alias: "Alby", methods: ["pay_invoice"] });

    const data = getLocalStorageData();

    expect(data.nwcString).toBe(
      "nostr+walletconnect://wallet?relay=wss://relay&secret=abcd"
    );
    expect(data.nwcInfo).toBe(
      JSON.stringify({ alias: "Alby", methods: ["pay_invoice"] })
    );
    expect(data.hasStoredNWCConnection).toBe(true);
    expect(localStorage.getItem("nwcString")).toBeNull();
    expect(localStorage.getItem("encryptedNWCString")).not.toBeNull();
    expect(localStorage.getItem("nwcInfo")).toBe(
      JSON.stringify({ alias: "Alby", methods: ["pay_invoice"] })
    );
  });

  it("unlocks the stored NWC connection with the correct passphrase", () => {
    saveEncryptedNWCString(
      "nostr+walletconnect://wallet?relay=wss://relay&secret=abcd",
      "secret-passphrase"
    );
    lockNWCConnection();

    expect(getLocalStorageData().nwcString).toBeNull();

    const unlocked = unlockNWCString("secret-passphrase");

    expect(unlocked).toBe(
      "nostr+walletconnect://wallet?relay=wss://relay&secret=abcd"
    );
    expect(getLocalStorageData().nwcString).toBe(
      "nostr+walletconnect://wallet?relay=wss://relay&secret=abcd"
    );
  });

  it("does not unlock the stored NWC connection with an incorrect passphrase", () => {
    saveEncryptedNWCString(
      "nostr+walletconnect://wallet?relay=wss://relay&secret=abcd",
      "secret-passphrase"
    );
    lockNWCConnection();

    expect(() => unlockNWCString("wrong-passphrase")).toThrow(
      "Incorrect passphrase or invalid NWC connection."
    );
    expect(getLocalStorageData().nwcString).toBeNull();
  });

  it("removes legacy persisted plaintext NWC data on read", () => {
    localStorage.setItem(
      "nwcString",
      "nostr+walletconnect://wallet?relay=wss://relay&secret=legacysecret"
    );
    localStorage.setItem("encryptedNWCString", "ciphertext");
    localStorage.setItem(
      "nwcInfo",
      JSON.stringify({ alias: "Legacy", methods: ["pay_invoice"] })
    );

    const data = getLocalStorageData();

    expect(data.nwcString).toBeNull();
    expect(data.nwcInfo).toBe(
      JSON.stringify({ alias: "Legacy", methods: ["pay_invoice"] })
    );
    expect(data.hasStoredNWCConnection).toBe(true);
    expect(localStorage.getItem("nwcString")).toBeNull();
  });
});
