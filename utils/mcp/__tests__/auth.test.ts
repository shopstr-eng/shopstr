const verifyEventMock = jest.fn();

jest.mock("nostr-tools", () => ({
  verifyEvent: (event: unknown) => verifyEventMock(event),
}));

jest.mock("@/utils/db/db-service", () => ({
  getDbPool: jest.fn(),
}));

import type { NextApiRequest } from "next";
import {
  extractBearerToken,
  generateApiKey,
  hashApiKey,
  verifyApiKey,
  verifyNostrAuth,
} from "@/utils/mcp/auth";

const FIXED_NOW_MS = Date.UTC(2026, 0, 1, 0, 0, 0);
const FIXED_NOW_SECONDS = Math.floor(FIXED_NOW_MS / 1000);

describe("MCP auth helpers", () => {
  let dateNowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    verifyEventMock.mockReset();
    dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(FIXED_NOW_MS);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  describe("generateApiKey", () => {
    it("returns an sk_-prefixed key and matching prefix", () => {
      const { key, prefix } = generateApiKey();

      expect(key.startsWith("sk_")).toBe(true);
      expect(prefix).toHaveLength(10);
      expect(prefix).toBe(key.substring(0, 10));
    });
  });

  describe("hashApiKey and verifyApiKey", () => {
    it("verifies the original key against its generated hash", () => {
      const { key } = generateApiKey();
      const keyHash = hashApiKey(key);

      expect(keyHash.startsWith("pbkdf2_sha256$100000$")).toBe(true);
      expect(verifyApiKey(key, keyHash)).toBe(true);
    });

    it("rejects a different key", () => {
      const { key } = generateApiKey();
      const otherKey = generateApiKey().key;

      expect(verifyApiKey(otherKey, hashApiKey(key))).toBe(false);
    });

    it("rejects malformed stored hashes", () => {
      const { key } = generateApiKey();

      expect(verifyApiKey(key, "bad-hash")).toBe(false);
    });
  });

  describe("extractBearerToken", () => {
    it("returns the bearer token when the header is well-formed", () => {
      const req = {
        headers: {
          authorization: "Bearer sk_test_token",
        },
      } as NextApiRequest;

      expect(extractBearerToken(req)).toBe("sk_test_token");
    });

    it("returns null when the authorization header is missing", () => {
      const req = {
        headers: {},
      } as NextApiRequest;

      expect(extractBearerToken(req)).toBeNull();
    });

    it("returns null when the authorization header is not a bearer token", () => {
      const req = {
        headers: {
          authorization: "Basic abc123",
        },
      } as NextApiRequest;

      expect(extractBearerToken(req)).toBeNull();
    });
  });

  describe("verifyNostrAuth", () => {
    const baseAuthEvent = {
      kind: 27235,
      pubkey: "f".repeat(64),
      created_at: FIXED_NOW_SECONDS,
    };

    it("rejects missing signed events", () => {
      expect(verifyNostrAuth(undefined)).toEqual({
        valid: false,
        pubkey: "",
        error: "Missing signed auth event",
      });
    });

    it("rejects events with the wrong auth kind", () => {
      expect(
        verifyNostrAuth({
          ...baseAuthEvent,
          kind: 1,
        })
      ).toEqual({
        valid: false,
        pubkey: "",
        error: "Invalid auth event kind",
      });
    });

    it("rejects events with invalid signatures", () => {
      verifyEventMock.mockReturnValue(false);

      expect(verifyNostrAuth(baseAuthEvent)).toEqual({
        valid: false,
        pubkey: "",
        error: "Invalid event signature",
      });
    });

    it("rejects expired auth events", () => {
      verifyEventMock.mockReturnValue(true);

      const result = verifyNostrAuth({
        ...baseAuthEvent,
        pubkey: "c".repeat(64),
        created_at: FIXED_NOW_SECONDS - 3600,
      });

      expect(result).toEqual({
        valid: false,
        pubkey: "",
        error: "Auth event has expired",
      });
    });

    it("rejects auth events when the expected pubkey does not match", () => {
      verifyEventMock.mockReturnValue(true);

      const result = verifyNostrAuth(
        {
          ...baseAuthEvent,
          pubkey: "d".repeat(64),
        },
        "e".repeat(64)
      );

      expect(result).toEqual({
        valid: false,
        pubkey: "d".repeat(64),
        error: "Pubkey mismatch",
      });
    });

    it("propagates unexpected verification errors", () => {
      verifyEventMock.mockImplementation(() => {
        throw new Error("verification exploded");
      });

      expect(() => verifyNostrAuth(baseAuthEvent)).toThrow(
        "verification exploded"
      );
    });

    it("accepts fresh valid auth events", () => {
      verifyEventMock.mockReturnValue(true);

      const result = verifyNostrAuth(baseAuthEvent);

      expect(result).toEqual({
        valid: true,
        pubkey: "f".repeat(64),
      });
    });
  });
});
