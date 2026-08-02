import type { NextApiRequest, NextApiResponse } from "next";
import type { ApiKeyRecord } from "@/utils/mcp/auth";

const extractBearerTokenMock = jest.fn();
const validateApiKeyMock = jest.fn();
const initializeApiKeysTableMock = jest.fn();
const applyRateLimitMock = jest.fn();
const recordRequestMock = jest.fn();

const createMcpServerMock = jest.fn();
const registerWriteToolsMock = jest.fn();
const StreamableHTTPServerTransportMock = jest.fn();

jest.mock("@/utils/mcp/auth", () => ({
  extractBearerToken: (...args: unknown[]) => extractBearerTokenMock(...args),
  validateApiKey: (...args: unknown[]) => validateApiKeyMock(...args),
  initializeApiKeysTable: (...args: unknown[]) =>
    initializeApiKeysTableMock(...args),
}));

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));

jest.mock("@/utils/mcp/metrics", () => ({
  recordRequest: (...args: unknown[]) => recordRequestMock(...args),
}));

jest.mock("@/mcp/server", () => ({
  createMcpServer: (...args: unknown[]) => createMcpServerMock(...args),
}));

jest.mock("@/mcp/tools/write-tools", () => ({
  registerWriteTools: (...args: unknown[]) => registerWriteToolsMock(...args),
}));

jest.mock("@modelcontextprotocol/sdk/server/streamableHttp.js", () => ({
  StreamableHTTPServerTransport: StreamableHTTPServerTransportMock,
}));

const BUYER_PUBKEY = "b".repeat(64);

function makeApiKey(overrides: Partial<ApiKeyRecord> = {}): ApiKeyRecord {
  return {
    id: 1,
    key_prefix: "sk_test12",
    key_hash: "pbkdf2_sha256$1$salt$hash",
    name: "Test Agent",
    pubkey: BUYER_PUBKEY,
    permissions: "read_write",
    created_at: new Date().toISOString(),
    last_used_at: null,
    is_active: true,
    ...overrides,
  };
}

type MockResponse = {
  statusCode: number;
  jsonBody: unknown;
  headers: Record<string, string | number>;
  status(code: number): MockResponse;
  json(payload: unknown): MockResponse;
  setHeader(name: string, value: string | number): MockResponse;
  end(...args: unknown[]): MockResponse;
};

function createMockRequest(
  overrides: Partial<NextApiRequest> = {}
): NextApiRequest {
  return {
    method: "GET",
    headers: {
      host: "localhost:5000",
    },
    body: {},
    socket: {
      remoteAddress: "127.0.0.1",
      encrypted: false,
    },
    ...overrides,
  } as unknown as NextApiRequest;
}

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    jsonBody: undefined,
    headers: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.jsonBody = payload;
      // Real Next.js res.json() internally calls res.end(); the handler
      // relies on that to wire up its X-Response-Time/recordRequest hook.
      this.end();
      return this;
    },
    setHeader(name: string, value: string | number) {
      this.headers[name] = value;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

type FakeTransport = {
  handleRequest: jest.Mock;
  close: jest.Mock;
  options: Record<string, unknown>;
  sessionId: string;
};

let handler: typeof import("@/pages/api/mcp/index").default;
let callOrder: string[];
let transportInstances: FakeTransport[];
let fakeServer: { tool: jest.Mock; connect: jest.Mock };

beforeEach(async () => {
  jest.useFakeTimers();
  jest.resetModules();
  jest.clearAllMocks();

  callOrder = [];
  transportInstances = [];

  applyRateLimitMock.mockReturnValue(true);
  recordRequestMock.mockImplementation(() => undefined);

  extractBearerTokenMock.mockReturnValue("test-token");
  initializeApiKeysTableMock.mockImplementation(async () => {
    callOrder.push("initializeApiKeysTable");
  });
  validateApiKeyMock.mockImplementation(async () => {
    callOrder.push("validateApiKey");
    return makeApiKey();
  });

  fakeServer = {
    tool: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
  };
  createMcpServerMock.mockImplementation(() => fakeServer);
  registerWriteToolsMock.mockImplementation(() => undefined);

  // Default fake transport: simulates the real SDK writing a 200 response
  // and ending it, so response-instrumentation tests (which only fire on
  // res.end) have something to observe without a real transport in the loop.
  StreamableHTTPServerTransportMock.mockImplementation(
    (options: Record<string, unknown>) => {
      const sessionId = `session-${transportInstances.length + 1}`;
      let initialized = false;
      const instance: FakeTransport = {
        handleRequest: jest.fn(
          async (
            _req: unknown,
            res: MockResponse,
            parsedBody?: { method?: unknown }
          ) => {
            if (parsedBody?.method === "initialize") {
              initialized = true;
              const onSessionInitialized = options.onsessioninitialized;
              if (typeof onSessionInitialized === "function") {
                await onSessionInitialized(sessionId);
              }
              res.status(200);
              res.end();
              return;
            }

            if (!initialized) {
              res.status(400).json({
                jsonrpc: "2.0",
                error: {
                  code: -32000,
                  message: "Bad Request: Server not initialized",
                },
                id: null,
              });
              return;
            }

            res.status(200);
            res.end();
          }
        ),
        close: jest.fn(),
        options,
        sessionId,
      };
      transportInstances.push(instance);
      return instance;
    }
  );

  handler = (await import("@/pages/api/mcp/index")).default;
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

async function initializeSession() {
  const initializeReq = createMockRequest({
    method: "POST",
    body: { jsonrpc: "2.0", method: "initialize", id: 1 },
  });
  const initializeRes = createMockResponse();
  await handler(initializeReq, initializeRes as unknown as NextApiResponse);
  return { initializeReq, initializeRes };
}

describe("request gating, routing, instrumentation", () => {
  describe("rate limiting", () => {
    it("returns 429 without checking auth when the per-IP limit (mcp-protocol:ip) is exceeded", async () => {
      applyRateLimitMock.mockImplementationOnce(
        (_req: unknown, res: MockResponse) => {
          res.status(429).json({ error: "Too many requests" });
          return false;
        }
      );

      const req = createMockRequest({ method: "GET" });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(429);
      expect(extractBearerTokenMock).not.toHaveBeenCalled();
      expect(validateApiKeyMock).not.toHaveBeenCalled();
    });

    it("returns 429 without dispatching to any method handler when the per-key limit (mcp-protocol:key) is exceeded, after auth succeeds", async () => {
      applyRateLimitMock
        .mockImplementationOnce(() => true) // IP bucket passes
        .mockImplementationOnce((_req: unknown, res: MockResponse) => {
          res.status(429).json({ error: "Too many requests" });
          return false;
        });

      const req = createMockRequest({ method: "GET" });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(429);
      expect(validateApiKeyMock).toHaveBeenCalledTimes(1);
      expect(StreamableHTTPServerTransportMock).not.toHaveBeenCalled();
    });

    it("calls recordRequest with exactly (durationMs, false) — no tool-name argument — when either rate limit rejects", async () => {
      applyRateLimitMock.mockImplementationOnce(
        (_req: unknown, res: MockResponse) => {
          res.status(429).json({ error: "Too many requests" });
          return false;
        }
      );

      const req = createMockRequest({ method: "GET" });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(recordRequestMock).toHaveBeenCalledWith(expect.any(Number), false);
      expect(recordRequestMock.mock.calls[0]).toHaveLength(2);
    });
  });

  describe("authentication", () => {
    it("returns 401 'Missing API key...' when extractBearerToken returns null, without calling validateApiKey", async () => {
      extractBearerTokenMock.mockReturnValue(null);

      const req = createMockRequest({ method: "GET" });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(401);
      expect(res.jsonBody).toEqual({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Missing API key. Use Authorization: Bearer <key>",
        },
        id: null,
      });
      expect(validateApiKeyMock).not.toHaveBeenCalled();
      expect(recordRequestMock).toHaveBeenCalledWith(expect.any(Number), false);
    });

    it("returns 401 'Invalid or revoked API key' when validateApiKey resolves null", async () => {
      validateApiKeyMock.mockResolvedValueOnce(null);

      const req = createMockRequest({ method: "GET" });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(401);
      expect(res.jsonBody).toEqual({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid or revoked API key" },
        id: null,
      });
      expect(recordRequestMock).toHaveBeenCalledWith(expect.any(Number), false);
    });

    it("calls ensureTables/initializeApiKeysTable before validateApiKey", async () => {
      const req = createMockRequest({ method: "GET" });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(callOrder).toEqual(["initializeApiKeysTable", "validateApiKey"]);
    });

    it("only calls initializeApiKeysTable once across repeated requests (tablesReady guard)", async () => {
      const req1 = createMockRequest({ method: "GET" });
      const res1 = createMockResponse();
      await handler(req1, res1 as unknown as NextApiResponse);

      const req2 = createMockRequest({ method: "GET" });
      const res2 = createMockResponse();
      await handler(req2, res2 as unknown as NextApiResponse);

      expect(initializeApiKeysTableMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("method routing", () => {
    it("returns 405 'Method not allowed' for unsupported methods (e.g. PATCH)", async () => {
      const req = createMockRequest({ method: "PATCH" });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(405);
      expect(res.jsonBody).toEqual({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed" },
        id: null,
      });
      expect(StreamableHTTPServerTransportMock).not.toHaveBeenCalled();
    });

    it("lets the transport reject a non-initialize POST when no mcp-session-id header is present", async () => {
      const req = createMockRequest({
        method: "POST",
        body: { jsonrpc: "2.0", method: "tools/call", id: 1 },
      });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toEqual({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: Server not initialized",
        },
        id: null,
      });
      expect(StreamableHTTPServerTransportMock).toHaveBeenCalledTimes(1);
      expect(createMcpServerMock).toHaveBeenCalledTimes(1);
    });

    it("creates a new session when the body IS an 'initialize' call even if an unrecognized mcp-session-id header is present", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: {
          host: "localhost:5000",
          "mcp-session-id": "unknown-session",
        },
        body: { jsonrpc: "2.0", method: "initialize", id: 1 },
      });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(StreamableHTTPServerTransportMock).toHaveBeenCalledTimes(1);
    });

    it("reuses an initialized session for GET requests from the same API key", async () => {
      const initializeReq = createMockRequest({
        method: "POST",
        body: { jsonrpc: "2.0", method: "initialize", id: 1 },
      });
      const initializeRes = createMockResponse();

      await handler(initializeReq, initializeRes as unknown as NextApiResponse);

      const sessionReq = createMockRequest({
        method: "GET",
        headers: {
          host: "localhost:5000",
          "mcp-session-id": "session-1",
        },
      });
      const sessionRes = createMockResponse();

      await handler(sessionReq, sessionRes as unknown as NextApiResponse);

      expect(sessionRes.statusCode).toBe(200);
      expect(transportInstances[0]?.handleRequest).toHaveBeenCalledWith(
        sessionReq,
        sessionRes
      );
    });

    it("rejects requests when the session belongs to a different API key", async () => {
      const initializeReq = createMockRequest({
        method: "POST",
        body: { jsonrpc: "2.0", method: "initialize", id: 1 },
      });
      const initializeRes = createMockResponse();

      await handler(initializeReq, initializeRes as unknown as NextApiResponse);

      validateApiKeyMock.mockResolvedValueOnce(makeApiKey({ id: 2 }));

      const sessionReq = createMockRequest({
        method: "GET",
        headers: {
          host: "localhost:5000",
          "mcp-session-id": "session-1",
        },
      });
      const sessionRes = createMockResponse();

      await handler(sessionReq, sessionRes as unknown as NextApiResponse);

      expect(sessionRes.statusCode).toBe(403);
      expect(sessionRes.jsonBody).toEqual({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Session belongs to a different API key",
        },
        id: null,
      });
    });

    it("expires stale sessions before routing to the transport", async () => {
      const initializeReq = createMockRequest({
        method: "POST",
        body: { jsonrpc: "2.0", method: "initialize", id: 1 },
      });
      const initializeRes = createMockResponse();

      await handler(initializeReq, initializeRes as unknown as NextApiResponse);

      jest.setSystemTime(Date.now() + 30 * 60 * 1000 + 1);

      const sessionReq = createMockRequest({
        method: "GET",
        headers: {
          host: "localhost:5000",
          "mcp-session-id": "session-1",
        },
      });
      const sessionRes = createMockResponse();

      await handler(sessionReq, sessionRes as unknown as NextApiResponse);

      expect(sessionRes.statusCode).toBe(404);
      expect(sessionRes.jsonBody).toEqual({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Session expired" },
        id: null,
      });
      expect(transportInstances[0]?.close).toHaveBeenCalledTimes(1);
      expect(transportInstances[0]?.handleRequest).not.toHaveBeenCalledWith(
        sessionReq,
        sessionRes
      );
    });

    it("removes a session after DELETE handles the request", async () => {
      const initializeReq = createMockRequest({
        method: "POST",
        body: { jsonrpc: "2.0", method: "initialize", id: 1 },
      });
      const initializeRes = createMockResponse();

      await handler(initializeReq, initializeRes as unknown as NextApiResponse);

      const deleteReq = createMockRequest({
        method: "DELETE",
        headers: {
          host: "localhost:5000",
          "mcp-session-id": "session-1",
        },
      });
      const deleteRes = createMockResponse();

      await handler(deleteReq, deleteRes as unknown as NextApiResponse);

      expect(deleteRes.statusCode).toBe(200);
      expect(transportInstances[0]?.handleRequest).toHaveBeenCalledWith(
        deleteReq,
        deleteRes
      );

      const secondDeleteReq = createMockRequest({
        method: "DELETE",
        headers: {
          host: "localhost:5000",
          "mcp-session-id": "session-1",
        },
      });
      const secondDeleteRes = createMockResponse();

      await handler(
        secondDeleteReq,
        secondDeleteRes as unknown as NextApiResponse
      );

      expect(secondDeleteRes.statusCode).toBe(404);
      expect(secondDeleteRes.jsonBody).toEqual({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Session not found" },
        id: null,
      });
    });

    it("returns 400 'Bad Request: No valid session ID provided' only when mcp-session-id is present, unrecognized, AND the body is not an initialize call", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: {
          host: "localhost:5000",
          "mcp-session-id": "unknown-session",
        },
        body: { jsonrpc: "2.0", method: "tools/call", id: 1 },
      });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toEqual({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
      expect(StreamableHTTPServerTransportMock).not.toHaveBeenCalled();
    });

    it.each([undefined, "unknown-session"])(
      "returns 400 'Bad Request: Missing or invalid session ID for SSE stream' for GET with session id %p",
      async (sessionId) => {
        const headers: Record<string, string> = { host: "localhost:5000" };
        if (sessionId) headers["mcp-session-id"] = sessionId;

        const req = createMockRequest({ method: "GET", headers });
        const res = createMockResponse();

        await handler(req, res as unknown as NextApiResponse);

        expect(res.statusCode).toBe(400);
        expect(res.jsonBody).toEqual({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message:
              "Bad Request: Missing or invalid session ID for SSE stream",
          },
          id: null,
        });
      }
    );

    it.each([undefined, "unknown-session"])(
      "returns 404 'Session not found' for DELETE with session id %p",
      async (sessionId) => {
        const headers: Record<string, string> = { host: "localhost:5000" };
        if (sessionId) headers["mcp-session-id"] = sessionId;

        const req = createMockRequest({ method: "DELETE", headers });
        const res = createMockResponse();

        await handler(req, res as unknown as NextApiResponse);

        expect(res.statusCode).toBe(404);
        expect(res.jsonBody).toEqual({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Session not found" },
          id: null,
        });
      }
    );

    it("registers write tools only when the api key has full_access permissions", async () => {
      const req = createMockRequest({
        method: "POST",
        body: { jsonrpc: "2.0", method: "initialize", id: 1 },
      });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(registerWriteToolsMock).not.toHaveBeenCalled();
    });

    it("registers write tools when the api key has full_access permissions", async () => {
      validateApiKeyMock.mockResolvedValueOnce(
        makeApiKey({ permissions: "full_access" })
      );

      const req = createMockRequest({
        method: "POST",
        body: { jsonrpc: "2.0", method: "initialize", id: 1 },
      });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(registerWriteToolsMock).toHaveBeenCalledWith(
        fakeServer,
        expect.objectContaining({ permissions: "full_access" })
      );
    });
  });

  describe("response instrumentation", () => {
    it("sets X-Response-Time-Start immediately after the per-key rate limit passes, before any method-specific branching", async () => {
      const req = createMockRequest({ method: "GET" });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.headers["X-Response-Time-Start"]).toMatch(/^\d+$/);
    });

    it("sets X-Response-Time and calls recordRequest with (durationMs, success, req.body?.method) once the response completes", async () => {
      const req = createMockRequest({
        method: "POST",
        body: { jsonrpc: "2.0", method: "initialize", id: 1 },
      });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.headers["X-Response-Time"]).toMatch(/^\d+ms$/);
      expect(recordRequestMock).toHaveBeenCalledWith(
        expect.any(Number),
        true,
        "initialize"
      );
    });

    it("calls recordRequest with success=false for a >=400 status", async () => {
      const req = createMockRequest({
        method: "GET",
        headers: {
          host: "localhost:5000",
          "mcp-session-id": "unknown-session",
        },
      });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(400);
      expect(recordRequestMock).toHaveBeenCalledWith(
        expect.any(Number),
        false,
        undefined
      );
    });
  });
});

describe("session lifecycle", () => {
  describe("session reuse", () => {
    it("reuses the same transport instance for a second POST with the same mcp-session-id, without constructing a new transport or calling createMcpServer again", async () => {
      await initializeSession();

      expect(StreamableHTTPServerTransportMock).toHaveBeenCalledTimes(1);
      expect(createMcpServerMock).toHaveBeenCalledTimes(1);

      const secondReq = createMockRequest({
        method: "POST",
        headers: { host: "localhost:5000", "mcp-session-id": "session-1" },
        body: { jsonrpc: "2.0", method: "tools/call", id: 2 },
      });
      const secondRes = createMockResponse();
      await handler(secondReq, secondRes as unknown as NextApiResponse);

      expect(secondRes.statusCode).toBe(200);
      expect(transportInstances).toHaveLength(1);
      expect(transportInstances[0]?.handleRequest).toHaveBeenLastCalledWith(
        secondReq,
        secondRes,
        secondReq.body
      );
      expect(StreamableHTTPServerTransportMock).toHaveBeenCalledTimes(1);
      expect(createMcpServerMock).toHaveBeenCalledTimes(1);
    });

    it("updates lastActivityAt on reuse: touching a session twice, 29 minutes apart each time, never evicts it even though the total time since creation exceeds SESSION_TTL_MS (30 min)", async () => {
      await initializeSession();

      jest.setSystemTime(Date.now() + 29 * 60 * 1000);

      const firstReuseReq = createMockRequest({
        method: "GET",
        headers: { host: "localhost:5000", "mcp-session-id": "session-1" },
      });
      const firstReuseRes = createMockResponse();
      await handler(firstReuseReq, firstReuseRes as unknown as NextApiResponse);
      expect(firstReuseRes.statusCode).toBe(200);

      // Total elapsed since creation is now ~58 minutes, past SESSION_TTL_MS.
      // This only survives if the first reuse above bumped lastActivityAt.
      jest.setSystemTime(Date.now() + 29 * 60 * 1000);

      const secondReuseReq = createMockRequest({
        method: "GET",
        headers: { host: "localhost:5000", "mcp-session-id": "session-1" },
      });
      const secondReuseRes = createMockResponse();
      await handler(
        secondReuseReq,
        secondReuseRes as unknown as NextApiResponse
      );

      expect(secondReuseRes.statusCode).toBe(200);
      expect(transportInstances[0]?.close).not.toHaveBeenCalled();
    });
  });

  describe("expiry", () => {
    it("evicts a session whose lastActivityAt is more than SESSION_TTL_MS in the past on POST, closing its transport and returning 404 'Session expired'", async () => {
      await initializeSession();

      jest.setSystemTime(Date.now() + 30 * 60 * 1000 + 1);

      const staleReq = createMockRequest({
        method: "POST",
        headers: { host: "localhost:5000", "mcp-session-id": "session-1" },
        body: { jsonrpc: "2.0", method: "tools/call", id: 2 },
      });
      const staleRes = createMockResponse();
      await handler(staleReq, staleRes as unknown as NextApiResponse);

      expect(staleRes.statusCode).toBe(404);
      expect(staleRes.jsonBody).toEqual({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Session expired" },
        id: null,
      });
      expect(transportInstances[0]?.close).toHaveBeenCalledTimes(1);
      expect(transportInstances[0]?.handleRequest).not.toHaveBeenCalledWith(
        staleReq,
        staleRes,
        staleReq.body
      );
    });

    it("evicts and returns 404 'Session expired' for DELETE", async () => {
      await initializeSession();

      jest.setSystemTime(Date.now() + 30 * 60 * 1000 + 1);

      const staleReq = createMockRequest({
        method: "DELETE",
        headers: { host: "localhost:5000", "mcp-session-id": "session-1" },
      });
      const staleRes = createMockResponse();
      await handler(staleReq, staleRes as unknown as NextApiResponse);

      expect(staleRes.statusCode).toBe(404);
      expect(staleRes.jsonBody).toEqual({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Session expired" },
        id: null,
      });
      expect(transportInstances[0]?.close).toHaveBeenCalledTimes(1);
      expect(transportInstances[0]?.handleRequest).not.toHaveBeenCalledWith(
        staleReq,
        staleRes
      );
    });

    it("removes the session from the map on eviction: a later GET with the same id gets the unrecognized-session 400, not another 'Session expired' 404", async () => {
      await initializeSession();

      jest.setSystemTime(Date.now() + 30 * 60 * 1000 + 1);

      const firstReq = createMockRequest({
        method: "GET",
        headers: { host: "localhost:5000", "mcp-session-id": "session-1" },
      });
      const firstRes = createMockResponse();
      await handler(firstReq, firstRes as unknown as NextApiResponse);
      expect(firstRes.statusCode).toBe(404);

      const secondReq = createMockRequest({
        method: "GET",
        headers: { host: "localhost:5000", "mcp-session-id": "session-1" },
      });
      const secondRes = createMockResponse();
      await handler(secondReq, secondRes as unknown as NextApiResponse);

      expect(secondRes.statusCode).toBe(400);
      expect(secondRes.jsonBody).toEqual({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: Missing or invalid session ID for SSE stream",
        },
        id: null,
      });
      // Only the first (evicting) GET should have triggered a close() call —
      // if the map entry weren't actually removed, the second GET would hit
      // the eviction branch again and close() a second time.
      expect(transportInstances[0]?.close).toHaveBeenCalledTimes(1);
    });
  });
});

describe("new session creation", () => {
  it("passes a sessionIdGenerator function backed by crypto.randomUUID, and an onsessioninitialized callback, to the transport constructor", async () => {
    const req = createMockRequest({
      method: "POST",
      body: { jsonrpc: "2.0", method: "initialize", id: 1 },
    });
    const res = createMockResponse();
    await handler(req, res as unknown as NextApiResponse);

    const options = StreamableHTTPServerTransportMock.mock.calls[0]?.[0] as {
      sessionIdGenerator: () => string;
      onsessioninitialized: (sid: string) => void;
    };
    expect(typeof options.sessionIdGenerator).toBe("function");
    expect(typeof options.onsessioninitialized).toBe("function");

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const first = options.sessionIdGenerator();
    const second = options.sessionIdGenerator();
    expect(first).toMatch(uuidPattern);
    expect(second).toMatch(uuidPattern);
    expect(first).not.toBe(second);
  });

  it("constructs createMcpServer with exactly {apiKeyId: apiKey.id, pubkey: apiKey.pubkey}", async () => {
    await initializeSession();

    expect(createMcpServerMock).toHaveBeenCalledWith({
      apiKeyId: 1,
      pubkey: BUYER_PUBKEY,
    });
  });

  it("registers the seven purchase-flow tools, by name, before calling server.connect", async () => {
    await initializeSession();

    const toolNames = fakeServer.tool.mock.calls.map((call) => call[0]);
    expect(toolNames).toEqual([
      "create_order",
      "get_order_status",
      "list_orders",
      "verify_payment",
      "get_payment_methods",
      "get_notifications",
      "list_seller_orders",
    ]);

    const lastToolCallOrder = Math.max(
      ...fakeServer.tool.mock.invocationCallOrder
    );
    const connectCallOrder = fakeServer.connect.mock.invocationCallOrder[0]!;
    expect(lastToolCallOrder).toBeLessThan(connectCallOrder);
  });

  it("does not register write tools alongside purchase tools for a read_write (non full_access) key", async () => {
    await initializeSession();

    expect(registerWriteToolsMock).not.toHaveBeenCalled();
    expect(fakeServer.tool.mock.calls).toHaveLength(7);
  });

  it("calls server.connect(transport) before transport.handleRequest(req, res, req.body)", async () => {
    const req = createMockRequest({
      method: "POST",
      body: { jsonrpc: "2.0", method: "initialize", id: 1 },
    });
    const res = createMockResponse();
    await handler(req, res as unknown as NextApiResponse);

    const transport = transportInstances[0]!;
    expect(fakeServer.connect).toHaveBeenCalledWith(transport);

    const connectCallOrder = fakeServer.connect.mock.invocationCallOrder[0]!;
    const handleRequestCallOrder =
      transport.handleRequest.mock.invocationCallOrder[0]!;
    expect(connectCallOrder).toBeLessThan(handleRequestCallOrder);
    expect(transport.handleRequest).toHaveBeenCalledWith(req, res, req.body);
  });

  it("onsessioninitialized inserts the session with lastActivityAt set to the creation time: a GET exactly SESSION_TTL_MS later (not SESSION_TTL_MS + 1) is still within the strictly-greater-than eviction threshold and is not evicted", async () => {
    await initializeSession();

    jest.setSystemTime(Date.now() + 30 * 60 * 1000);

    const req = createMockRequest({
      method: "GET",
      headers: { host: "localhost:5000", "mcp-session-id": "session-1" },
    });
    const res = createMockResponse();
    await handler(req, res as unknown as NextApiResponse);

    expect(res.statusCode).toBe(200);
    expect(transportInstances[0]?.close).not.toHaveBeenCalled();
  });
});

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 30 * 60 * 1000;

describe("sweep interval", () => {
  it("does not evict a session younger than SESSION_TTL_MS when the sweep fires", async () => {
    await initializeSession();

    jest.advanceTimersByTime(SWEEP_INTERVAL_MS);

    expect(transportInstances[0]?.close).not.toHaveBeenCalled();

    const req = createMockRequest({
      method: "GET",
      headers: { host: "localhost:5000", "mcp-session-id": "session-1" },
    });
    const res = createMockResponse();
    await handler(req, res as unknown as NextApiResponse);

    expect(res.statusCode).toBe(200);
  });

  it("closes the transport and removes a session older than SESSION_TTL_MS when the sweep fires, independent of any request", async () => {
    await initializeSession();

    jest.advanceTimersByTime(SESSION_TTL_MS + SWEEP_INTERVAL_MS);

    expect(transportInstances[0]?.close).toHaveBeenCalledTimes(1);

    const req = createMockRequest({
      method: "GET",
      headers: { host: "localhost:5000", "mcp-session-id": "session-1" },
    });
    const res = createMockResponse();
    await handler(req, res as unknown as NextApiResponse);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: Missing or invalid session ID for SSE stream",
      },
      id: null,
    });
  });

  it("continues sweeping on every tick: two separate advances evict two different sessions independently", async () => {
    await initializeSession(); // session-1, created at t=0

    jest.advanceTimersByTime(SESSION_TTL_MS + SWEEP_INTERVAL_MS); // t=35min
    expect(transportInstances[0]?.close).toHaveBeenCalledTimes(1);

    await initializeSession(); // session-2, created "now" (t=35min)
    expect(transportInstances[1]?.close).not.toHaveBeenCalled();

    jest.advanceTimersByTime(SESSION_TTL_MS + SWEEP_INTERVAL_MS); // t=70min

    // session-2 evicted by a later, independent tick of the same interval.
    expect(transportInstances[1]?.close).toHaveBeenCalledTimes(1);
    // session-1 was already removed from the map on the first tick, so the
    // later ticks must not touch it again.
    expect(transportInstances[0]?.close).toHaveBeenCalledTimes(1);
  });

  it("swallows a transport.close() throw during sweep without crashing the interval, and keeps sweeping on later ticks", async () => {
    await initializeSession(); // session-1
    transportInstances[0]!.close.mockImplementation(() => {
      throw new Error("boom");
    });

    expect(() => {
      jest.advanceTimersByTime(SESSION_TTL_MS + SWEEP_INTERVAL_MS);
    }).not.toThrow();

    expect(transportInstances[0]?.close).toHaveBeenCalledTimes(1);

    const staleReq = createMockRequest({
      method: "GET",
      headers: { host: "localhost:5000", "mcp-session-id": "session-1" },
    });
    const staleRes = createMockResponse();
    await handler(staleReq, staleRes as unknown as NextApiResponse);
    expect(staleRes.statusCode).toBe(400);

    // The interval itself must still be alive for later ticks.
    await initializeSession(); // session-2, created "now"
    jest.advanceTimersByTime(SESSION_TTL_MS + SWEEP_INTERVAL_MS);
    expect(transportInstances[1]?.close).toHaveBeenCalledTimes(1);
  });
});
