const verifyEventMock = jest.fn();
const mockConnect = jest.fn();
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const decryptNsecMock = jest.fn();
const getPubKeyMock = jest.fn();
const McpNostrSignerMock = jest.fn();

jest.mock("nostr-tools", () => ({
  verifyEvent: (event: unknown) => verifyEventMock(event),
}));

jest.mock("@/utils/db/db-service", () => ({
  getDbPool: jest.fn(() => ({ connect: mockConnect })),
}));

jest.mock("@/utils/mcp/nostr-signing", () => ({
  decryptNsec: (encrypted: string) => decryptNsecMock(encrypted),
  McpNostrSigner: McpNostrSignerMock,
}));

import type { NextApiRequest, NextApiResponse } from "next";
import {
  authenticateRequest,
  createApiKey,
  extractBearerToken,
  generateApiKey,
  getAgentSigner,
  hashApiKey,
  initializeApiKeysTable,
  listApiKeys,
  revokeApiKey,
  updateApiKeyNsec,
  validateApiKey,
  verifyApiKey,
  verifyNostrAuth,
  type ApiKeyRecord,
} from "@/utils/mcp/auth";

function makeApiKeyFixture(
  overrides: Partial<ApiKeyRecord> = {}
): ApiKeyRecord {
  return {
    encrypted_nsec: null,
    ...overrides,
  } as unknown as ApiKeyRecord;
}

type MockRes = { statusCode: number; body: unknown };

function createMockRes() {
  const res: MockRes & {
    status(code: number): MockRes;
    json(payload: unknown): MockRes;
  } = {
    statusCode: 0,
    body: undefined as unknown,
    status(this: MockRes, code: number) {
      this.statusCode = code;
      return this;
    },
    json(this: MockRes, payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as NextApiResponse & {
    statusCode: number;
    body: unknown;
  };
}

const FIXED_NOW_MS = Date.UTC(2026, 0, 1, 0, 0, 0);
const FIXED_NOW_SECONDS = Math.floor(FIXED_NOW_MS / 1000);

describe("MCP auth helpers", () => {
  let dateNowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    verifyEventMock.mockReset();
    dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(FIXED_NOW_MS);

    mockConnect.mockReset();
    mockQuery.mockReset();
    mockRelease.mockReset();
    mockConnect.mockResolvedValue({ query: mockQuery, release: mockRelease });

    decryptNsecMock.mockReset();
    getPubKeyMock.mockReset();
    McpNostrSignerMock.mockReset();
    McpNostrSignerMock.mockImplementation(() => ({
      getPubKey: getPubKeyMock,
    }));
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

    it("rejects a hash with 4 parts but the wrong algorithm tag", () => {
      const { key } = generateApiKey();
      const wrongAlgoHash = hashApiKey(key).replace("pbkdf2_sha256", "bcrypt");

      expect(verifyApiKey(key, wrongAlgoHash)).toBe(false);
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

  describe("initializeApiKeysTable", () => {
    it("creates the schema (4 statements) and releases the client", async () => {
      mockQuery.mockResolvedValue({});

      await initializeApiKeysTable();

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(mockQuery).toHaveBeenCalledTimes(4);
      expect(mockQuery.mock.calls[0]?.[0]).toContain(
        "CREATE TABLE IF NOT EXISTS mcp_api_keys"
      );
      expect(mockQuery.mock.calls[1]?.[0]).toContain(
        "ADD COLUMN IF NOT EXISTS encrypted_nsec"
      );
      expect(mockQuery.mock.calls[2]?.[0]).toContain("DROP CONSTRAINT");
      expect(mockQuery.mock.calls[3]?.[0]).toContain("ADD CONSTRAINT");
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("swallows a failure from the encrypted_nsec column migration and still runs the permissions-constraint migration", async () => {
      mockQuery
        .mockResolvedValueOnce({}) // main CREATE TABLE block
        .mockRejectedValueOnce(new Error("column exists")) // ADD COLUMN
        .mockResolvedValueOnce({}) // DROP CONSTRAINT
        .mockResolvedValueOnce({}); // ADD CONSTRAINT

      await expect(initializeApiKeysTable()).resolves.toBeUndefined();

      expect(mockQuery).toHaveBeenCalledTimes(4);
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("swallows a failure from the permissions-constraint migration", async () => {
      mockQuery
        .mockResolvedValueOnce({}) // main CREATE TABLE block
        .mockResolvedValueOnce({}) // ADD COLUMN
        .mockRejectedValueOnce(new Error("constraint missing")); // DROP CONSTRAINT throws, ADD CONSTRAINT never runs

      await expect(initializeApiKeysTable()).resolves.toBeUndefined();

      expect(mockQuery).toHaveBeenCalledTimes(3);
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("logs and rethrows when the main table-creation query fails, still releasing the client", async () => {
      const dbError = new Error("connection lost");
      mockQuery.mockRejectedValueOnce(dbError);
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await expect(initializeApiKeysTable()).rejects.toThrow("connection lost");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to initialize MCP tables:",
        dbError
      );
      expect(mockRelease).toHaveBeenCalledTimes(1);
      consoleErrorSpy.mockRestore();
    });

    it("propagates a pool.connect() failure without attempting to release a client", async () => {
      mockConnect.mockRejectedValueOnce(new Error("pool exhausted"));
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await expect(initializeApiKeysTable()).rejects.toThrow("pool exhausted");

      expect(mockQuery).not.toHaveBeenCalled();
      expect(mockRelease).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("createApiKey", () => {
    it("inserts a new row with a generated key/prefix/hash and default permissions, then releases the client", async () => {
      const insertedRow = { id: 1, key_prefix: "sk_abc", permissions: "read" };
      mockQuery.mockResolvedValueOnce({ rows: [insertedRow] });

      const { key, record } = await createApiKey("Agent", "f".repeat(64));

      expect(key.startsWith("sk_")).toBe(true);
      expect(record).toBe(insertedRow);
      const [sql, params] = mockQuery.mock.calls[0]!;
      expect(sql).toContain("INSERT INTO mcp_api_keys");
      expect(params).toEqual([
        key.substring(0, 10),
        expect.stringMatching(/^pbkdf2_sha256\$100000\$/),
        "Agent",
        "f".repeat(64),
        "read",
        null,
      ]);
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("passes explicit permissions and an encrypted nsec through to the insert", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{}] });

      await createApiKey(
        "Agent",
        "f".repeat(64),
        "full_access",
        "encrypted-blob"
      );

      const [, params] = mockQuery.mock.calls[0]!;
      expect(params[4]).toBe("full_access");
      expect(params[5]).toBe("encrypted-blob");
    });

    it("releases the client even when the insert fails", async () => {
      mockQuery.mockRejectedValueOnce(new Error("insert failed"));

      await expect(createApiKey("Agent", "f".repeat(64))).rejects.toThrow(
        "insert failed"
      );
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("does not attempt to release a client when pool.connect() itself fails", async () => {
      mockConnect.mockRejectedValueOnce(new Error("pool exhausted"));

      await expect(createApiKey("Agent", "f".repeat(64))).rejects.toThrow(
        "pool exhausted"
      );
      expect(mockRelease).not.toHaveBeenCalled();
    });
  });

  describe("updateApiKeyNsec", () => {
    it("updates encrypted_nsec and permissions together when permissions is provided", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await updateApiKeyNsec(
        1,
        "f".repeat(64),
        "enc",
        "full_access"
      );

      expect(result).toBe(true);
      const [sql, params] = mockQuery.mock.calls[0]!;
      expect(sql).toContain("SET encrypted_nsec = $1, permissions = $2");
      expect(params).toEqual(["enc", "full_access", 1, "f".repeat(64)]);
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("updates only encrypted_nsec when permissions is omitted", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await updateApiKeyNsec(1, "f".repeat(64), "enc");

      expect(result).toBe(true);
      const [sql, params] = mockQuery.mock.calls[0]!;
      expect(sql).not.toContain("permissions = $2");
      expect(params).toEqual(["enc", 1, "f".repeat(64)]);
    });

    it("returns false when no row matches", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const result = await updateApiKeyNsec(1, "f".repeat(64), "enc");

      expect(result).toBe(false);
    });

    it("returns false when rowCount is undefined", async () => {
      mockQuery.mockResolvedValueOnce({});

      const result = await updateApiKeyNsec(1, "f".repeat(64), "enc");

      expect(result).toBe(false);
    });

    it("releases the client when the update query fails", async () => {
      mockQuery.mockRejectedValueOnce(new Error("update failed"));

      await expect(updateApiKeyNsec(1, "f".repeat(64), "enc")).rejects.toThrow(
        "update failed"
      );
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("does not attempt to release a client when pool.connect() itself fails", async () => {
      mockConnect.mockRejectedValueOnce(new Error("pool exhausted"));

      await expect(updateApiKeyNsec(1, "f".repeat(64), "enc")).rejects.toThrow(
        "pool exhausted"
      );
      expect(mockRelease).not.toHaveBeenCalled();
    });
  });

  describe("getAgentSigner", () => {
    it("returns null without attempting decryption when encrypted_nsec is absent", async () => {
      const result = await getAgentSigner(makeApiKeyFixture());

      expect(result).toBeNull();
      expect(decryptNsecMock).not.toHaveBeenCalled();
    });

    it("decrypts the nsec and returns a signer keyed by its pubkey", async () => {
      decryptNsecMock.mockReturnValue("nsec1...");
      getPubKeyMock.mockReturnValue("f".repeat(64));

      const result = await getAgentSigner(
        makeApiKeyFixture({ encrypted_nsec: "encrypted-blob" })
      );

      expect(decryptNsecMock).toHaveBeenCalledWith("encrypted-blob");
      expect(McpNostrSignerMock).toHaveBeenCalledWith("nsec1...");
      expect(result?.pubkey).toBe("f".repeat(64));
      expect(result?.signer.getPubKey()).toBe("f".repeat(64));
    });

    it("returns null and logs when decryption throws", async () => {
      decryptNsecMock.mockImplementation(() => {
        throw new Error("bad ciphertext");
      });
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = await getAgentSigner(
        makeApiKeyFixture({ encrypted_nsec: "encrypted-blob" })
      );

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to create agent signer:",
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe("validateApiKey", () => {
    it("returns the matching active key and bumps last_used_at", async () => {
      const { key } = generateApiKey();
      const keyHash = hashApiKey(key);
      const record = {
        id: 7,
        key_prefix: key.substring(0, 10),
        key_hash: keyHash,
        is_active: true,
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [record] }) // SELECT
        .mockResolvedValueOnce({}); // UPDATE last_used_at

      const result = await validateApiKey(key);

      expect(result).toBe(record);
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("SELECT * FROM mcp_api_keys"),
        [key.substring(0, 10)]
      );
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("UPDATE mcp_api_keys SET last_used_at"),
        [7]
      );
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("returns null and skips the last_used_at update when no row's hash matches", async () => {
      const { key } = generateApiKey();
      const otherHash = hashApiKey(generateApiKey().key);
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, key_hash: otherHash }],
      });

      const result = await validateApiKey(key);

      expect(result).toBeNull();
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("releases the client even when the query fails", async () => {
      mockQuery.mockRejectedValueOnce(new Error("db down"));

      await expect(validateApiKey("sk_whatever")).rejects.toThrow("db down");
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("does not attempt to release a client when pool.connect() itself fails", async () => {
      mockConnect.mockRejectedValueOnce(new Error("pool exhausted"));

      await expect(validateApiKey("sk_whatever")).rejects.toThrow(
        "pool exhausted"
      );
      expect(mockRelease).not.toHaveBeenCalled();
    });
  });

  describe("listApiKeys", () => {
    it("returns the rows for the given pubkey and releases the client", async () => {
      const rows = [{ id: 1 }, { id: 2 }];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await listApiKeys("f".repeat(64));

      expect(result).toBe(rows);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("FROM mcp_api_keys WHERE pubkey = $1"),
        ["f".repeat(64)]
      );
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("releases the client when the list query fails", async () => {
      mockQuery.mockRejectedValueOnce(new Error("list failed"));

      await expect(listApiKeys("f".repeat(64))).rejects.toThrow("list failed");
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("does not attempt to release a client when pool.connect() itself fails", async () => {
      mockConnect.mockRejectedValueOnce(new Error("pool exhausted"));

      await expect(listApiKeys("f".repeat(64))).rejects.toThrow(
        "pool exhausted"
      );
      expect(mockRelease).not.toHaveBeenCalled();
    });
  });

  describe("revokeApiKey", () => {
    it("returns true when a row is deactivated", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await revokeApiKey(1, "f".repeat(64));

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET is_active = FALSE"),
        ["1", "f".repeat(64)]
      );
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("returns false when no row matches", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const result = await revokeApiKey(1, "f".repeat(64));

      expect(result).toBe(false);
    });

    it("returns false when rowCount is undefined", async () => {
      mockQuery.mockResolvedValueOnce({});

      const result = await revokeApiKey(1, "f".repeat(64));

      expect(result).toBe(false);
    });

    it("releases the client when the revoke query fails", async () => {
      mockQuery.mockRejectedValueOnce(new Error("revoke failed"));

      await expect(revokeApiKey(1, "f".repeat(64))).rejects.toThrow(
        "revoke failed"
      );
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("does not attempt to release a client when pool.connect() itself fails", async () => {
      mockConnect.mockRejectedValueOnce(new Error("pool exhausted"));

      await expect(revokeApiKey(1, "f".repeat(64))).rejects.toThrow(
        "pool exhausted"
      );
      expect(mockRelease).not.toHaveBeenCalled();
    });
  });

  describe("authenticateRequest", () => {
    it("returns 401 and null when no bearer token is present", async () => {
      const req = { headers: {} } as NextApiRequest;
      const res = createMockRes();

      const result = await authenticateRequest(req, res);

      expect(result).toBeNull();
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({
        error: "Missing API key. Use Authorization: Bearer <key>",
      });
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it("returns 401 and null when the key does not validate", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const req = {
        headers: { authorization: "Bearer sk_unknown" },
      } as NextApiRequest;
      const res = createMockRes();

      const result = await authenticateRequest(req, res);

      expect(result).toBeNull();
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: "Invalid or revoked API key" });
    });

    it("returns 403 when read_write is required but the key is read-only", async () => {
      const { key } = generateApiKey();
      const record = {
        id: 1,
        key_hash: hashApiKey(key),
        permissions: "read",
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [record] })
        .mockResolvedValueOnce({});
      const req = {
        headers: { authorization: `Bearer ${key}` },
      } as NextApiRequest;
      const res = createMockRes();

      const result = await authenticateRequest(req, res, "read_write");

      expect(result).toBeNull();
      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({
        error:
          "Insufficient permissions. This action requires read_write or full_access.",
      });
    });

    it("allows a read_write key through a read_write requirement", async () => {
      const { key } = generateApiKey();
      const record = {
        id: 1,
        key_hash: hashApiKey(key),
        permissions: "read_write",
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [record] })
        .mockResolvedValueOnce({});
      const req = {
        headers: { authorization: `Bearer ${key}` },
      } as NextApiRequest;
      const res = createMockRes();

      const result = await authenticateRequest(req, res, "read_write");

      expect(result).toBe(record);
      expect(res.statusCode).toBe(0);
    });

    it("allows a full_access key through a read_write requirement", async () => {
      const { key } = generateApiKey();
      const record = {
        id: 1,
        key_hash: hashApiKey(key),
        permissions: "full_access",
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [record] })
        .mockResolvedValueOnce({});
      const req = {
        headers: { authorization: `Bearer ${key}` },
      } as NextApiRequest;
      const res = createMockRes();

      const result = await authenticateRequest(req, res, "read_write");

      expect(result).toBe(record);
      expect(res.statusCode).toBe(0);
    });

    it("returns 403 when full_access is required but the key is only read_write", async () => {
      const { key } = generateApiKey();
      const record = {
        id: 1,
        key_hash: hashApiKey(key),
        permissions: "read_write",
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [record] })
        .mockResolvedValueOnce({});
      const req = {
        headers: { authorization: `Bearer ${key}` },
      } as NextApiRequest;
      const res = createMockRes();

      const result = await authenticateRequest(req, res, "full_access");

      expect(result).toBeNull();
      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({
        error: "Insufficient permissions. This action requires full_access.",
      });
    });

    it("allows a full_access key through a full_access requirement", async () => {
      const { key } = generateApiKey();
      const record = {
        id: 1,
        key_hash: hashApiKey(key),
        permissions: "full_access",
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [record] })
        .mockResolvedValueOnce({});
      const req = {
        headers: { authorization: `Bearer ${key}` },
      } as NextApiRequest;
      const res = createMockRes();

      const result = await authenticateRequest(req, res, "full_access");

      expect(result).toBe(record);
      expect(res.statusCode).toBe(0);
    });

    it("returns the api key record without touching res when no specific permission is required", async () => {
      const { key } = generateApiKey();
      const record = {
        id: 1,
        key_hash: hashApiKey(key),
        permissions: "read",
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [record] })
        .mockResolvedValueOnce({});
      const req = {
        headers: { authorization: `Bearer ${key}` },
      } as NextApiRequest;
      const res = createMockRes();

      const result = await authenticateRequest(req, res);

      expect(result).toBe(record);
      expect(res.statusCode).toBe(0);
    });
  });
});
