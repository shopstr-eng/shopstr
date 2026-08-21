import { parseJsonWithFallback } from "../safe-json";

describe("safe-json helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  describe("parseJsonWithFallback", () => {
    it("returns parsed value for valid JSON", () => {
      const parsed = parseJsonWithFallback<{ ok: boolean }>('{"ok":true}', {
        ok: false,
      });

      expect(parsed).toEqual({ ok: true });
    });

    it("returns fallback for malformed JSON", () => {
      const parsed = parseJsonWithFallback<string[]>("{bad", []);

      expect(parsed).toEqual([]);
    });

    it("returns fallback when validator fails", () => {
      const parsed = parseJsonWithFallback<string[]>("[1,2,3]", [], {
        validate: (value): value is string[] =>
          Array.isArray(value) &&
          value.every((item) => typeof item === "string"),
      });

      expect(parsed).toEqual([]);
    });
  });
});
