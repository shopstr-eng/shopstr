import type { NextApiRequest, NextApiResponse } from "next";
import type { ApiKeyRecord } from "@/utils/mcp/auth";
import type { McpOrder } from "@/mcp/tools/purchase-tools";

const authenticateRequestMock = jest.fn();
const initializeApiKeysTableMock = jest.fn();
const applyRateLimitMock = jest.fn();
const recordRequestMock = jest.fn();

const getMcpOrderMock = jest.fn();
const updateMcpOrderPaymentMock = jest.fn();

const walletLoadMintMock = jest.fn();
const walletCheckMintQuoteBolt11Mock = jest.fn();
const withMintRetryMock = jest.fn();
const getTrustedMintUrlMock = jest.fn();

const pendingLightningPaymentsMap = new Map<
  string,
  { quote: string; mintUrl: string; amount: number; orderId: string }
>();

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

jest.mock("@/mcp/tools/purchase-tools", () => ({
  getMcpOrder: (...args: unknown[]) => getMcpOrderMock(...args),
  updateMcpOrderPayment: (...args: unknown[]) =>
    updateMcpOrderPaymentMock(...args),
}));

jest.mock("@/pages/api/mcp/create-order", () => ({
  pendingLightningPayments: pendingLightningPaymentsMap,
}));

jest.mock("@/utils/cashu/trusted-mints", () => ({
  getTrustedMintUrl: (...args: unknown[]) => getTrustedMintUrlMock(...args),
}));

jest.mock("@/utils/cashu/mint-retry-service", () => ({
  withMintRetry: (...args: unknown[]) => withMintRetryMock(...args),
}));

jest.mock("@cashu/cashu-ts", () => ({
  Mint: jest.fn().mockImplementation(() => ({})),
  Wallet: jest.fn().mockImplementation(() => ({
    loadMint: (...args: unknown[]) => walletLoadMintMock(...args),
    checkMintQuoteBolt11: (...args: unknown[]) =>
      walletCheckMintQuoteBolt11Mock(...args),
  })),
  MintQuoteState: {
    UNPAID: "UNPAID",
    PAID: "PAID",
    ISSUED: "ISSUED",
  },
}));

// --- Helpers & Fixtures -----------------------------------------------------

const BUYER_PUBKEY = "b".repeat(64);
const SELLER_PUBKEY = "c".repeat(64);
const OTHER_PUBKEY = "d".repeat(64);
const DEFAULT_MINT = "https://mint.example.com";

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

function makeOrder(overrides: Partial<McpOrder> = {}): McpOrder {
  return {
    id: 1,
    order_id: "order-123",
    api_key_id: 1,
    buyer_pubkey: BUYER_PUBKEY,
    seller_pubkey: SELLER_PUBKEY,
    product_id: "prod-1",
    product_title: "Test Product",
    quantity: 1,
    amount_total: 1000,
    currency: "sat",
    shipping_address: null,
    payment_ref: "ln_quote_abc",
    payment_status: "pending",
    order_status: "pending",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
    method: "POST",
    headers: {
      host: "localhost:5000",
    },
    query: {},
    body: {
      orderId: "order-123",
    },
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

let handler: typeof import("@/pages/api/mcp/verify-payment").default;

describe("POST /api/mcp/verify-payment", () => {
  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    pendingLightningPaymentsMap.clear();

    applyRateLimitMock.mockReturnValue(true);
    recordRequestMock.mockImplementation(() => undefined);
    initializeApiKeysTableMock.mockResolvedValue(undefined);
    authenticateRequestMock.mockResolvedValue(makeApiKey());

    getMcpOrderMock.mockResolvedValue(makeOrder());
    updateMcpOrderPaymentMock.mockResolvedValue(undefined);

    walletLoadMintMock.mockResolvedValue(undefined);
    walletCheckMintQuoteBolt11Mock.mockResolvedValue({
      quote: "quote_abc",
      state: "PAID",
      amount: 1000,
    });
    withMintRetryMock.mockImplementation((fn: () => Promise<unknown>) => fn());
    getTrustedMintUrlMock.mockReturnValue(DEFAULT_MINT);

    const mod = await import("@/pages/api/mcp/verify-payment");
    handler = mod.default;
  });

  describe("HTTP method and auth guard", () => {
    it("rejects non-POST methods with 405 Method not allowed", async () => {
      const req = createMockRequest({ method: "GET" });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(405);
      expect(res.jsonBody).toEqual({ error: "Method not allowed. Use POST." });
    });

    it("enforces IP rate limit before authentication", async () => {
      applyRateLimitMock.mockReturnValueOnce(false);
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(authenticateRequestMock).not.toHaveBeenCalled();
      expect(recordRequestMock).toHaveBeenCalledWith(
        expect.any(Number),
        false,
        "verify-payment"
      );
    });

    it("returns early when authentication fails (401)", async () => {
      authenticateRequestMock.mockResolvedValueOnce(null);
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(getMcpOrderMock).not.toHaveBeenCalled();
      expect(recordRequestMock).toHaveBeenCalledWith(
        expect.any(Number),
        false,
        "verify-payment"
      );
    });

    it("enforces per-key rate limit", async () => {
      applyRateLimitMock
        .mockReturnValueOnce(true) // IP check
        .mockReturnValueOnce(false); // Key check
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(getMcpOrderMock).not.toHaveBeenCalled();
      expect(recordRequestMock).toHaveBeenCalledWith(
        expect.any(Number),
        false,
        "verify-payment"
      );
    });
  });

  describe("Validation and order existence", () => {
    it("returns 400 when orderId is missing", async () => {
      const req = createMockRequest({ body: {} });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toEqual({ error: "orderId is required" });
    });

    it("returns 404 when order does not exist", async () => {
      getMcpOrderMock.mockResolvedValueOnce(null);
      const req = createMockRequest({ body: { orderId: "missing-order" } });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(404);
      expect(res.jsonBody).toEqual({ error: "Order not found" });
    });
  });

  describe("Authorization (buyer and seller access)", () => {
    it("returns 403 Forbidden when an unrelated third party attempts verification", async () => {
      authenticateRequestMock.mockResolvedValueOnce(
        makeApiKey({ pubkey: OTHER_PUBKEY })
      );
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(403);
      expect(res.jsonBody).toEqual({
        error: "Not authorized to verify this order",
      });
      expect(walletCheckMintQuoteBolt11Mock).not.toHaveBeenCalled();
    });

    it("allows the buyer to verify the order", async () => {
      authenticateRequestMock.mockResolvedValueOnce(
        makeApiKey({ pubkey: BUYER_PUBKEY })
      );
      pendingLightningPaymentsMap.set("order-123", {
        quote: "quote_abc",
        mintUrl: DEFAULT_MINT,
        amount: 1000,
        orderId: "order-123",
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(200);
      expect((res.jsonBody as { status?: string }).status).toBe("paid");
      expect(updateMcpOrderPaymentMock).toHaveBeenCalledWith(
        "order-123",
        "ln_quote_abc",
        "paid"
      );
    });

    it("allows the seller to verify the order", async () => {
      authenticateRequestMock.mockResolvedValueOnce(
        makeApiKey({ pubkey: SELLER_PUBKEY })
      );
      pendingLightningPaymentsMap.set("order-123", {
        quote: "quote_abc",
        mintUrl: DEFAULT_MINT,
        amount: 1000,
        orderId: "order-123",
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(200);
      expect((res.jsonBody as { status?: string }).status).toBe("paid");
      expect(updateMcpOrderPaymentMock).toHaveBeenCalledWith(
        "order-123",
        "ln_quote_abc",
        "paid"
      );
    });
  });

  describe("Already paid orders", () => {
    it("returns 200 immediately if order is already marked paid", async () => {
      getMcpOrderMock.mockResolvedValueOnce(
        makeOrder({ payment_status: "paid" })
      );
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toEqual({
        success: true,
        status: "paid",
        message: "Payment has already been confirmed.",
        orderId: "order-123",
      });
      expect(withMintRetryMock).not.toHaveBeenCalled();
      expect(walletCheckMintQuoteBolt11Mock).not.toHaveBeenCalled();
    });
  });

  describe("In-memory pending payment flow", () => {
    it("verifies and transitions pending payment to paid when mint returns PAID", async () => {
      pendingLightningPaymentsMap.set("order-123", {
        quote: "quote_memory_1",
        mintUrl: "https://custom-mint.org",
        amount: 2500,
        orderId: "order-123",
      });
      walletCheckMintQuoteBolt11Mock.mockResolvedValueOnce({
        quote: "quote_memory_1",
        state: "PAID",
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toEqual({
        success: true,
        status: "paid",
        message:
          "Lightning payment confirmed! Your order is now being processed.",
        orderId: "order-123",
        payment: {
          method: "lightning",
          amount: 2500,
          currency: "sats",
          quoteId: "quote_memory_1",
        },
      });

      expect(updateMcpOrderPaymentMock).toHaveBeenCalledWith(
        "order-123",
        "ln_quote_memory_1",
        "paid"
      );
      expect(pendingLightningPaymentsMap.has("order-123")).toBe(false);
    });

    it("verifies and transitions pending payment to paid when mint returns ISSUED", async () => {
      pendingLightningPaymentsMap.set("order-123", {
        quote: "quote_memory_2",
        mintUrl: DEFAULT_MINT,
        amount: 500,
        orderId: "order-123",
      });
      walletCheckMintQuoteBolt11Mock.mockResolvedValueOnce({
        quote: "quote_memory_2",
        state: "ISSUED",
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(200);
      expect((res.jsonBody as { status?: string }).status).toBe("paid");
      expect(updateMcpOrderPaymentMock).toHaveBeenCalledWith(
        "order-123",
        "ln_quote_memory_2",
        "paid"
      );
      expect(pendingLightningPaymentsMap.has("order-123")).toBe(false);
    });

    it("returns unpaid status when mint reports quote is UNPAID without deleting pending map", async () => {
      pendingLightningPaymentsMap.set("order-123", {
        quote: "quote_memory_3",
        mintUrl: DEFAULT_MINT,
        amount: 1500,
        orderId: "order-123",
      });
      walletCheckMintQuoteBolt11Mock.mockResolvedValueOnce({
        quote: "quote_memory_3",
        state: "UNPAID",
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toEqual({
        success: true,
        status: "unpaid",
        message: "Payment has not been received yet. Please pay the invoice.",
        orderId: "order-123",
        payment: {
          method: "lightning",
          amount: 1500,
          currency: "sats",
          quoteId: "quote_memory_3",
          mintUrl: DEFAULT_MINT,
        },
      });

      expect(updateMcpOrderPaymentMock).not.toHaveBeenCalled();
      expect(pendingLightningPaymentsMap.has("order-123")).toBe(true);
    });
  });

  describe("Cold-start and persistence fallback (order.payment_ref)", () => {
    it("falls back to order.payment_ref (ln_<quote>) and getTrustedMintUrl when pending map is empty", async () => {
      // Map is empty (simulating server restart, cold start, or different instance)
      expect(pendingLightningPaymentsMap.size).toBe(0);

      getMcpOrderMock.mockResolvedValueOnce(
        makeOrder({
          payment_ref: "ln_quote_persisted_999",
          amount_total: 4200,
        })
      );
      walletCheckMintQuoteBolt11Mock.mockResolvedValueOnce({
        quote: "quote_persisted_999",
        state: "PAID",
        amount: 4200,
      });

      // Seller checks the payment on cold start
      authenticateRequestMock.mockResolvedValueOnce(
        makeApiKey({ pubkey: SELLER_PUBKEY })
      );

      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toEqual({
        success: true,
        status: "paid",
        message:
          "Lightning payment confirmed! Your order is now being processed.",
        orderId: "order-123",
        payment: {
          method: "lightning",
          amount: 4200,
          currency: "sats",
          quoteId: "quote_persisted_999",
        },
      });

      expect(getTrustedMintUrlMock).toHaveBeenCalled();
      expect(updateMcpOrderPaymentMock).toHaveBeenCalledWith(
        "order-123",
        "ln_quote_persisted_999",
        "paid"
      );
    });

    it("respects mintUrl passed in req.body on cold start fallback", async () => {
      getMcpOrderMock.mockResolvedValueOnce(
        makeOrder({
          payment_ref: "ln_quote_body_mint",
          amount_total: 800,
        })
      );
      walletCheckMintQuoteBolt11Mock.mockResolvedValueOnce({
        quote: "quote_body_mint",
        state: "PAID",
        amount: 800,
      });

      const req = createMockRequest({
        body: {
          orderId: "order-123",
          mintUrl: "https://mint-from-request.test",
        },
      });
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(200);
      expect((res.jsonBody as { status?: string }).status).toBe("paid");
      expect(updateMcpOrderPaymentMock).toHaveBeenCalledWith(
        "order-123",
        "ln_quote_body_mint",
        "paid"
      );
    });

    it("returns 400 if pending payment is missing from map and order has no payment_ref quote", async () => {
      getMcpOrderMock.mockResolvedValueOnce(
        makeOrder({
          payment_ref: null,
        })
      );

      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toEqual({
        error:
          "No pending Lightning payment found for this order. It may have expired.",
        orderId: "order-123",
      });
      expect(withMintRetryMock).not.toHaveBeenCalled();
    });
  });

  describe("Error handling and mint retry", () => {
    it("wraps checkMintQuoteBolt11 in withMintRetry with { maxAttempts: 2, perAttemptTimeoutMs: 5000 }", async () => {
      pendingLightningPaymentsMap.set("order-123", {
        quote: "quote_abc",
        mintUrl: DEFAULT_MINT,
        amount: 1000,
        orderId: "order-123",
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(withMintRetryMock).toHaveBeenCalledWith(expect.any(Function), {
        maxAttempts: 2,
        perAttemptTimeoutMs: 5000,
      });
    });

    it("returns 500 if checking mint quote throws an error", async () => {
      pendingLightningPaymentsMap.set("order-123", {
        quote: "quote_abc",
        mintUrl: DEFAULT_MINT,
        amount: 1000,
        orderId: "order-123",
      });
      withMintRetryMock.mockRejectedValueOnce(
        new Error("Connection refused to mint")
      );

      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(res.statusCode).toBe(500);
      expect(res.jsonBody).toEqual({
        error: "Failed to verify payment",
        details: "Connection refused to mint",
      });
    });
  });
});
