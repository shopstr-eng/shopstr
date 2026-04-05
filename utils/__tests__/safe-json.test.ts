import { getLocalStorageJson, parseJsonWithFallback } from "../safe-json";

describe("safe-json helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  describe("parseJsonWithFallback", () => {
    it("returns parsed value for valid JSON", () => {
      const parsed = parseJsonWithFallback<{ ok: boolean }>(
        '{"ok":true}',
        { ok: false }
      );

      expect(parsed).toEqual({ ok: true });
    });

    it("returns fallback for malformed JSON", () => {
      const parsed = parseJsonWithFallback<string[]>("{bad", []);

      expect(parsed).toEqual([]);
    });

    it("returns fallback when validator fails", () => {
      const parsed = parseJsonWithFallback<string[]>(
        "[1,2,3]",
        [],
        {
          validate: (value): value is string[] =>
            Array.isArray(value) && value.every((item) => typeof item === "string"),
        }
      );

      expect(parsed).toEqual([]);
    });
  });

  describe("getLocalStorageJson", () => {
    it("returns fallback for missing keys", () => {
      const parsed = getLocalStorageJson("missing-key", [] as string[]);

      expect(parsed).toEqual([]);
    });

    it("removes malformed key when removeOnError is enabled", () => {
      localStorage.setItem("cart", "{bad-json");
      const removeItemSpy = jest.spyOn(Storage.prototype, "removeItem");

      const parsed = getLocalStorageJson("cart", [] as unknown[], {
        removeOnError: true,
      });

      expect(parsed).toEqual([]);
      expect(removeItemSpy).toHaveBeenCalledWith("cart");
    });

    it("removes invalid key when validator fails and removeOnError is enabled", () => {
      localStorage.setItem("relays", "[1,2,3]");
      const removeItemSpy = jest.spyOn(Storage.prototype, "removeItem");

      const parsed = getLocalStorageJson<string[]>("relays", [], {
        removeOnError: true,
        validate: (value): value is string[] =>
          Array.isArray(value) && value.every((item) => typeof item === "string"),
      });

      expect(parsed).toEqual([]);
      expect(removeItemSpy).toHaveBeenCalledWith("relays");
    });
  });
});
