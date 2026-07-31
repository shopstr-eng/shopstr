import type { NextApiRequest, NextApiResponse } from "next";
import type { ApiKeyRecord } from "@/utils/mcp/auth";

const authenticateRequestMock = jest.fn();
const initializeApiKeysTableMock = jest.fn();
const applyRateLimitMock = jest.fn();
const recordRequestMock = jest.fn();

const fetchAllProductsFromDbMock = jest.fn();
const fetchAllProfilesFromDbMock = jest.fn();
const validateDiscountCodeMock = jest.fn();

const createMcpOrderMock = jest.fn();
const getMcpOrderMock = jest.fn();
const listMcpOrdersMock = jest.fn();
const formatOrderForResponseMock = jest.fn();
const updateMcpOrderPaymentMock = jest.fn();

const getDecodedTokenMock = jest.fn();
const walletLoadMintMock = jest.fn();
const walletCreateMintQuoteBolt11Mock = jest.fn();
const walletReceiveMock = jest.fn();

const withMintRetryMock = jest.fn();
const getTrustedMintUrlMock = jest.fn();

jest.mock("@/utils/mcp/auth", () => ({
  authenticateRequest: (...args: unknown[]) => authenticateRequestMock(...args),
  initializeApiKeysTable: (...args: unknown[]) =>
    initializeApiKeysTableMock(...args),
}));

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));

jest.mock("@/utils/mcp/metrics", () => ({
  recordRequest: (...args: unknown[]) => recordRequestMock(...args),
}));

jest.mock("@/utils/db/db-service", () => ({
  fetchAllProductsFromDb: (...args: unknown[]) =>
    fetchAllProductsFromDbMock(...args),
  fetchAllProfilesFromDb: (...args: unknown[]) =>
    fetchAllProfilesFromDbMock(...args),
  validateDiscountCode: (...args: unknown[]) =>
    validateDiscountCodeMock(...args),
}));

jest.mock("@/mcp/tools/purchase-tools", () => ({
  createMcpOrder: (...args: unknown[]) => createMcpOrderMock(...args),
  getMcpOrder: (...args: unknown[]) => getMcpOrderMock(...args),
  listMcpOrders: (...args: unknown[]) => listMcpOrdersMock(...args),
  formatOrderForResponse: (...args: unknown[]) =>
    formatOrderForResponseMock(...args),
  updateMcpOrderPayment: (...args: unknown[]) =>
    updateMcpOrderPaymentMock(...args),
}));

jest.mock("@cashu/cashu-ts", () => ({
  Mint: jest.fn().mockImplementation(() => ({})),
  Wallet: jest.fn().mockImplementation(() => ({
    loadMint: (...args: unknown[]) => walletLoadMintMock(...args),
    createMintQuoteBolt11: (...args: unknown[]) =>
      walletCreateMintQuoteBolt11Mock(...args),
    receive: (...args: unknown[]) => walletReceiveMock(...args),
  })),
  getDecodedToken: (...args: unknown[]) => getDecodedTokenMock(...args),
}));

jest.mock("@/utils/cashu/mint-retry-service", () => ({
  withMintRetry: (...args: unknown[]) => withMintRetryMock(...args),
}));

jest.mock("@/utils/cashu/trusted-mints", () => ({
  getTrustedMintUrl: (...args: unknown[]) => getTrustedMintUrlMock(...args),
}));

// --- Fixtures ---------------------------------------------------------------

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
    query: {},
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

describe("pages/api/mcp/create-order — Phase 1: request gating & routing", () => {
  let handler: typeof import("@/pages/api/mcp/create-order").default;
  let callOrder: string[];

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    callOrder = [];

    applyRateLimitMock.mockReturnValue(true);
    recordRequestMock.mockImplementation(() => undefined);

    initializeApiKeysTableMock.mockImplementation(async () => {
      callOrder.push("initializeApiKeysTable");
    });
    authenticateRequestMock.mockImplementation(async () => {
      callOrder.push("authenticateRequest");
      return makeApiKey();
    });

    fetchAllProductsFromDbMock.mockResolvedValue([]);
    fetchAllProfilesFromDbMock.mockResolvedValue([]);
    validateDiscountCodeMock.mockResolvedValue({ valid: false });

    getMcpOrderMock.mockResolvedValue(null);
    listMcpOrdersMock.mockResolvedValue([]);
    formatOrderForResponseMock.mockImplementation((order: unknown) => order);

    handler = (await import("@/pages/api/mcp/create-order")).default;
  });

  describe("rate limiting", () => {
    it("returns 429 without calling authenticateRequest when the per-IP limit (mcp-create-order:ip) is exceeded", async () => {
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
      expect(authenticateRequestMock).not.toHaveBeenCalled();
    });

    it("returns 429 without reaching handleListOrders/handleGetOrder when the per-key limit (mcp-create-order:key) is exceeded, after auth succeeds", async () => {
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
      expect(authenticateRequestMock).toHaveBeenCalledTimes(1);
      expect(getMcpOrderMock).not.toHaveBeenCalled();
      expect(listMcpOrdersMock).not.toHaveBeenCalled();
    });

    it("records a failed request via recordRequest when either rate limit rejects", async () => {
      applyRateLimitMock.mockImplementationOnce(
        (_req: unknown, res: MockResponse) => {
          res.status(429).json({ error: "Too many requests" });
          return false;
        }
      );

      const req = createMockRequest({ method: "GET" });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(recordRequestMock).toHaveBeenCalledWith(
        expect.any(Number),
        false,
        "create-order"
      );
    });
  });

  describe("authentication", () => {
    it("returns whatever authenticateRequest already wrote (401) and does not call any handleX function when it resolves null", async () => {
      authenticateRequestMock.mockImplementationOnce(
        async (_req: unknown, res: MockResponse) => {
          res.status(401).json({ error: "Missing API key" });
          return null;
        }
      );

      const req = createMockRequest({ method: "GET" });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(401);
      expect(getMcpOrderMock).not.toHaveBeenCalled();
      expect(listMcpOrdersMock).not.toHaveBeenCalled();
      expect(fetchAllProductsFromDbMock).not.toHaveBeenCalled();
    });

    it("calls ensureTables/initializeApiKeysTable before authenticateRequest", async () => {
      const req = createMockRequest({ method: "GET" });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(callOrder).toEqual([
        "initializeApiKeysTable",
        "authenticateRequest",
      ]);
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
    it("routes POST to handleCreateOrder", async () => {
      const req = createMockRequest({
        method: "POST",
        body: { productId: "missing-product" },
      });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(fetchAllProductsFromDbMock).toHaveBeenCalledTimes(1);
      expect(getMcpOrderMock).not.toHaveBeenCalled();
      expect(listMcpOrdersMock).not.toHaveBeenCalled();
      // No matching product -> 404, proving the request actually flowed
      // through handleCreateOrder rather than short-circuiting elsewhere.
      expect(res.statusCode).toBe(404);
    });

    it("routes GET with ?orderId= to handleGetOrder", async () => {
      const req = createMockRequest({
        method: "GET",
        query: { orderId: "mcp_123" },
      });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(getMcpOrderMock).toHaveBeenCalledWith("mcp_123");
      expect(listMcpOrdersMock).not.toHaveBeenCalled();
      expect(fetchAllProductsFromDbMock).not.toHaveBeenCalled();
    });

    it("routes GET without orderId to handleListOrders", async () => {
      const req = createMockRequest({ method: "GET", query: {} });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(listMcpOrdersMock).toHaveBeenCalledWith(BUYER_PUBKEY, 50, 0);
      expect(getMcpOrderMock).not.toHaveBeenCalled();
      expect(fetchAllProductsFromDbMock).not.toHaveBeenCalled();
    });

    it("returns 405 for unsupported methods (e.g. PUT/DELETE) without calling any handleX function", async () => {
      const req = createMockRequest({ method: "PUT" });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(405);
      expect(fetchAllProductsFromDbMock).not.toHaveBeenCalled();
      expect(getMcpOrderMock).not.toHaveBeenCalled();
      expect(listMcpOrdersMock).not.toHaveBeenCalled();
    });
  });

  describe("response instrumentation", () => {
    it("sets X-Response-Time header on res.end and calls recordRequest with success=true for a <500 status", async () => {
      const req = createMockRequest({ method: "GET", query: {} });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(200);
      expect(res.headers["X-Response-Time"]).toMatch(/^\d+ms$/);
      expect(recordRequestMock).toHaveBeenCalledWith(
        expect.any(Number),
        true,
        "create-order"
      );
    });

    it("calls recordRequest with success=false for a >=500 status", async () => {
      listMcpOrdersMock.mockRejectedValueOnce(new Error("db exploded"));

      const req = createMockRequest({ method: "GET", query: {} });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(500);
      expect(recordRequestMock).toHaveBeenCalledWith(
        expect.any(Number),
        false,
        "create-order"
      );
    });
  });
});
