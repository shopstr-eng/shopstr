import {
  createStorageKey,
  storage,
  STORAGE_KEY_PREFIXES,
  STORAGE_KEYS,
} from "../storage";

describe("StorageManager key types", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it("accepts catalogued keys and rejects unregistered literals", () => {
    expect(storage.getItem(STORAGE_KEYS.CART)).toBeNull();

    // @ts-expect-error Unregistered static keys must not compile.
    storage.getItem("cart-typo");

    const profileKey = createStorageKey(
      STORAGE_KEY_PREFIXES.USER_PROFILE,
      "pubkey"
    );
    expect(storage.getItem(profileKey)).toBeNull();
  });

  it("removes malformed JSON when requested", () => {
    localStorage.setItem(STORAGE_KEYS.CART, "{bad-json");

    expect(
      storage.getJson(STORAGE_KEYS.CART, [], { removeOnError: true })
    ).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEYS.CART)).toBeNull();
  });

  it("validates parsed JSON and reports the storage key", () => {
    const onError = jest.fn();
    localStorage.setItem(STORAGE_KEYS.RELAYS, "[1,2,3]");

    const relays = storage.getJson<string[]>(STORAGE_KEYS.RELAYS, [], {
      onError,
      removeOnValidationError: true,
      validate: (value): value is string[] =>
        Array.isArray(value) && value.every((item) => typeof item === "string"),
    });

    expect(relays).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEYS.RELAYS)).toBeNull();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "validation_mismatch",
        key: STORAGE_KEYS.RELAYS,
      })
    );
  });
});
