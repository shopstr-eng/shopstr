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
