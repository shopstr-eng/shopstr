import { storage, STORAGE_KEYS } from "@/utils/storage";

describe("StorageManager defaults (replaces getLocalStorageData)", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
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
});
