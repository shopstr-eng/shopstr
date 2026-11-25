import {
  LogOut,
  clearNWCConnection,
  getLocalStorageData,
  lockNIP46Signer,
  lockNWCConnection,
  saveEncryptedNWCString,
  saveNWCInfo,
  setLocalStorageDataOnSignIn,
  unlockNIP46Signer,
  unlockNWCString,
} from "../nostr-helper-functions";
import { storage, STORAGE_KEYS } from "@/utils/storage";
import { webcrypto } from "node:crypto";

const originalCrypto = globalThis.crypto;

beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: webcrypto,
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: originalCrypto,
  });
});

describe("StorageManager defaults (replaces getLocalStorageData)", () => {
  beforeEach(() => {
    LogOut();
    jest.restoreAllMocks();
    clearNWCConnection();
  });

  it("returns safe defaults for missing keys", () => {
    expect(storage.getJson(STORAGE_KEYS.RELAYS, [])).toEqual([]);
    expect(storage.getJson(STORAGE_KEYS.MINTS, [])).toEqual([]);
    expect(storage.getJson(STORAGE_KEYS.TOKENS, [])).toEqual([]);
    expect(storage.getJson(STORAGE_KEYS.HISTORY, [])).toEqual([]);
  });

  it("recovers from malformed JSON in critical keys", () => {
    localStorage.setItem("relays", "{bad");
    localStorage.setItem("mints", "{bad");
    localStorage.setItem("tokens", "{bad");
    localStorage.setItem("history", "{bad");
    localStorage.setItem("signer", "{bad");

    expect(() => storage.getJson(STORAGE_KEYS.RELAYS, [])).not.toThrow();
    expect(storage.getJson(STORAGE_KEYS.RELAYS, [])).toEqual([]);
    expect(storage.getJson(STORAGE_KEYS.MINTS, [])).toEqual([]);
    expect(storage.getJson(STORAGE_KEYS.TOKENS, [])).toEqual([]);
    expect(storage.getJson(STORAGE_KEYS.HISTORY, [])).toEqual([]);
  });

  it("falls back to signInMethod signer when stored signer shape is invalid", () => {
    localStorage.setItem("signInMethod", "extension");
    localStorage.setItem("signer", JSON.stringify({ type: "bad" }));

    const data = getLocalStorageData();

    expect(data.signer).toEqual({ type: "nip07" });
    expect(localStorage.getItem("signer")).toBeNull();
  });

  it("reads and writes data correctly", () => {
    const relays = ["wss://relay.damus.io"];
    storage.setJson(STORAGE_KEYS.RELAYS, relays);
    expect(storage.getJson(STORAGE_KEYS.RELAYS, [])).toEqual(relays);
  });

  it("returns string items correctly", () => {
    storage.setItem(STORAGE_KEYS.NWC_STRING, "nostr+walletconnect://test");
    expect(storage.getItem(STORAGE_KEYS.NWC_STRING)).toBe(
      "nostr+walletconnect://test"
    );
  });

  it("stores the NWC connection encrypted at rest and keeps the raw value in runtime memory", async () => {
    await saveEncryptedNWCString(
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

  it("stores NWC credentials in a versioned authenticated envelope", async () => {
    await saveEncryptedNWCString(
      "nostr+walletconnect://wallet?relay=wss://relay&secret=abcd",
      "secret-passphrase"
    );

    const envelope = JSON.parse(
      localStorage.getItem("encryptedNWCString") || ""
    );

    expect(envelope).toMatchObject({
      version: 1,
      kdf: "PBKDF2-SHA-256",
      iterations: expect.any(Number),
      cipher: "AES-256-GCM",
      salt: expect.any(String),
      iv: expect.any(String),
      ciphertext: expect.any(String),
    });
    expect(envelope.iterations).toBeGreaterThanOrEqual(600_000);
  });

  it("rejects passphrases shorter than twelve characters", async () => {
    await expect(
      Promise.resolve().then(() =>
        saveEncryptedNWCString(
          "nostr+walletconnect://wallet?relay=wss://relay&secret=abcd",
          "too-short"
        )
      )
    ).rejects.toThrow("at least 12 characters");
  });

  it("unlocks the stored NWC connection with the correct passphrase", async () => {
    await saveEncryptedNWCString(
      "nostr+walletconnect://wallet?relay=wss://relay&secret=abcd",
      "secret-passphrase"
    );
    lockNWCConnection();

    expect(getLocalStorageData().nwcString).toBeNull();

    const unlocked = await unlockNWCString("secret-passphrase");

    expect(unlocked).toBe(
      "nostr+walletconnect://wallet?relay=wss://relay&secret=abcd"
    );
    expect(getLocalStorageData().nwcString).toBe(
      "nostr+walletconnect://wallet?relay=wss://relay&secret=abcd"
    );
  });

  it("does not unlock the stored NWC connection with an incorrect passphrase", async () => {
    await saveEncryptedNWCString(
      "nostr+walletconnect://wallet?relay=wss://relay&secret=abcd",
      "secret-passphrase"
    );
    lockNWCConnection();

    await expect(unlockNWCString("wrong-passphrase")).rejects.toThrow(
      "Incorrect passphrase or invalid NWC connection."
    );
    expect(getLocalStorageData().nwcString).toBeNull();
  });

  it("rejects a tampered encrypted NWC connection", async () => {
    await saveEncryptedNWCString(
      "nostr+walletconnect://wallet?relay=wss://relay&secret=abcd",
      "secret-passphrase"
    );
    lockNWCConnection();

    const envelope = JSON.parse(
      localStorage.getItem("encryptedNWCString") || ""
    );
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -2)}AA`;
    localStorage.setItem("encryptedNWCString", JSON.stringify(envelope));

    await expect(unlockNWCString("secret-passphrase")).rejects.toThrow(
      "Incorrect passphrase or invalid NWC connection."
    );
    expect(getLocalStorageData().nwcString).toBeNull();
  });

  it("removes legacy plaintext even when encrypted NWC data also exists", () => {
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
    expect(data.legacyNWCString).toBeNull();
    expect(data.nwcInfo).toBe(
      JSON.stringify({ alias: "Legacy", methods: ["pay_invoice"] })
    );
    expect(data.hasStoredNWCConnection).toBe(true);
    expect(data.hasLegacyNWCConnection).toBe(false);
    expect(localStorage.getItem("nwcString")).toBeNull();
  });

  it("removes an unmigrated legacy plaintext NWC connection after reading it", () => {
    localStorage.setItem(
      "nwcString",
      "nostr+walletconnect://wallet?relay=wss://relay&secret=legacysecret"
    );
    localStorage.setItem(
      "nwcInfo",
      JSON.stringify({ alias: "Legacy", methods: ["pay_invoice"] })
    );

    const data = getLocalStorageData();

    expect(data.nwcString).toBeNull();
    expect(data.legacyNWCString).toBe(
      "nostr+walletconnect://wallet?relay=wss://relay&secret=legacysecret"
    );
    expect(data.hasStoredNWCConnection).toBe(false);
    expect(data.hasLegacyNWCConnection).toBe(true);
    expect(localStorage.getItem("nwcString")).toBeNull();
  });

  it("keeps a removed legacy connection available in memory for migration", () => {
    const legacyNWCString =
      "nostr+walletconnect://wallet?relay=wss://relay&secret=legacysecret";
    localStorage.setItem("nwcString", legacyNWCString);

    expect(getLocalStorageData().legacyNWCString).toBe(legacyNWCString);
    expect(localStorage.getItem("nwcString")).toBeNull();
    expect(getLocalStorageData().legacyNWCString).toBe(legacyNWCString);
    expect(getLocalStorageData().hasLegacyNWCConnection).toBe(true);
  });

  it("removes the legacy plaintext NWC value once it is re-encrypted", async () => {
    localStorage.setItem(
      "nwcString",
      "nostr+walletconnect://wallet?relay=wss://relay&secret=legacysecret"
    );

    await saveEncryptedNWCString(
      "nostr+walletconnect://wallet?relay=wss://relay&secret=legacysecret",
      "secret-passphrase"
    );

    const data = getLocalStorageData();

    expect(data.legacyNWCString).toBeNull();
    expect(data.hasLegacyNWCConnection).toBe(false);
    expect(data.hasStoredNWCConnection).toBe(true);
    expect(localStorage.getItem("nwcString")).toBeNull();
  });

  it("does not treat a marker-only NIP-46 record as a usable signer", () => {
    localStorage.setItem("signer", JSON.stringify({ type: "nip46" }));

    const data = getLocalStorageData();

    expect(data.signer).toBeUndefined();
    expect(localStorage.getItem("signer")).toBe(
      JSON.stringify({ type: "nip46" })
    );
  });

  it("captures legacy NIP-46 credentials in memory and removes every plaintext copy", () => {
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
    expect(data.hasLegacyNIP46Connection).toBe(true);
    expect(localStorage.getItem("clientPrivkey")).toBeNull();
    expect(localStorage.getItem("bunkerRemotePubkey")).toBeNull();
    expect(localStorage.getItem("bunkerRelays")).toBeNull();
    expect(localStorage.getItem("bunkerSecret")).toBeNull();
  });

  it("stores NIP-46 credentials only inside an encrypted signer envelope", async () => {
    const remotePubkey = "a".repeat(64);
    const appPrivKey = "b".repeat(64);

    await setLocalStorageDataOnSignIn({
      signer: {
        toJSON: () => ({
          type: "nip46",
          bunker: `bunker://${remotePubkey}?secret=supersecret&relay=wss://relay.example`,
          appPrivKey,
        }),
      } as any,
      signerPassphrase: "secret-passphrase",
    } as any);

    const data = getLocalStorageData();

    expect(data.signer).toEqual({
      type: "nip46",
      bunker: `bunker://${remotePubkey}?relay=wss%3A%2F%2Frelay.example`,
      appPrivKey,
    });
    const storedSigner = localStorage.getItem("signer") || "";
    expect(JSON.parse(storedSigner)).toMatchObject({
      type: "nip46",
      encryptedSigner: expect.any(String),
    });
    expect(storedSigner).not.toContain("supersecret");
    expect(storedSigner).not.toContain(appPrivKey);
    expect(localStorage.getItem("clientPrivkey")).toBeNull();
    expect(localStorage.getItem("bunkerSecret")).toBeNull();
  });

  it("restores the encrypted NIP-46 signer after reload with the passphrase", async () => {
    const remotePubkey = "a".repeat(64);
    const appPrivKey = "b".repeat(64);
    await setLocalStorageDataOnSignIn({
      signer: {
        toJSON: () => ({
          type: "nip46",
          bunker: `bunker://${remotePubkey}?secret=single-use&relay=wss://relay.example`,
          appPrivKey,
        }),
      } as any,
      signerPassphrase: "secret-passphrase",
    });

    lockNIP46Signer();
    expect(getLocalStorageData().signer).toMatchObject({
      type: "nip46",
      encryptedSigner: expect.any(String),
    });

    await expect(unlockNIP46Signer("secret-passphrase")).resolves.toEqual({
      type: "nip46",
      bunker: `bunker://${remotePubkey}?relay=wss%3A%2F%2Frelay.example`,
      appPrivKey,
    });
  });

  it("drops the in-memory NIP-46 signer when another tab removes the persisted session", async () => {
    const remotePubkey = "a".repeat(64);
    await setLocalStorageDataOnSignIn({
      signer: {
        toJSON: () => ({
          type: "nip46",
          bunker: `bunker://${remotePubkey}?relay=wss://relay.example`,
          appPrivKey: "b".repeat(64),
        }),
      } as any,
      signerPassphrase: "secret-passphrase",
    });
    expect(getLocalStorageData().signer?.type).toBe("nip46");

    localStorage.removeItem("signer");

    expect(getLocalStorageData().signer).toBeUndefined();
  });

  it("removes a legacy serialized signer and keeps it only for in-session migration", () => {
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
      bunker: "bunker://pubkey?secret=legacysecret",
      appPrivKey: "legacy-app-privkey",
    });
    expect(localStorage.getItem("signer")).toBe(
      JSON.stringify({ type: "nip46" })
    );
    expect(data.hasLegacyNIP46Connection).toBe(true);
    expect(localStorage.getItem("clientPrivkey")).toBeNull();
    expect(localStorage.getItem("bunkerSecret")).toBeNull();
  });
});
