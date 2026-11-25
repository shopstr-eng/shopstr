import type { NextApiRequest, NextApiResponse } from "next";
import type { ApiKeyRecord } from "@/utils/mcp/auth";
import type { McpOrder } from "@/mcp/tools/purchase-tools";

const authenticateRequestMock = jest.fn();
const initializeApiKeysTableMock = jest.fn();
const applyRateLimitMock = jest.fn();
const recordRequestMock = jest.fn();

const getMcpOrderMock = jest.fn();
const updateMcpOrderPaymentMock = jest.fn();
const getMcpLightningPaymentMock = jest.fn();
const claimMcpLightningMintMock = jest.fn();
const releaseMcpLightningClaimMock = jest.fn();
const setMcpLightningTokenMock = jest.fn();
const mintPaidQuoteMock = jest.fn();
const sendOrderPaymentDmMock = jest.fn();

const walletLoadMintMock = jest.fn();
const walletCheckMintQuoteBolt11Mock = jest.fn();
const withMintRetryMock = jest.fn();

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
  getMcpLightningPayment: (...args: unknown[]) =>
    getMcpLightningPaymentMock(...args),
  claimMcpLightningMint: (...args: unknown[]) =>
    claimMcpLightningMintMock(...args),
  releaseMcpLightningClaim: (...args: unknown[]) =>
    releaseMcpLightningClaimMock(...args),
  setMcpLightningToken: (...args: unknown[]) =>
    setMcpLightningTokenMock(...args),
}));

jest.mock("@/utils/mcp/order-payment", () => ({
  mintPaidQuote: (...args: unknown[]) => mintPaidQuoteMock(...args),
  sendOrderPaymentDm: (...args: unknown[]) => sendOrderPaymentDmMock(...args),
}));

jest.mock("@/utils/cashu/mint-retry-service", () => ({
  withMintRetry: (...args: unknown[]) => withMintRetryMock(...args),
}));

const cashuMintConstructorMock = jest.fn();

jest.mock("@cashu/cashu-ts", () => ({
  Mint: jest.fn().mockImplementation((...args: unknown[]) => {
    cashuMintConstructorMock(...args);
    return {};
  }),
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

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    order_id: "order-123",
    quote_id: "quote_abc",
    mint_url: DEFAULT_MINT,
    amount_sats: 1000,
    product_address: `30402:${SELLER_PUBKEY}:listing-1`,
    selected_specs: { size: "L" },
    seller_token: null,
    claim_age_seconds: null,
    ...overrides,
  };
}

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
    getMcpLightningPaymentMock.mockResolvedValue(makePayment());
    claimMcpLightningMintMock.mockResolvedValue(true);
    releaseMcpLightningClaimMock.mockResolvedValue(undefined);
    setMcpLightningTokenMock.mockResolvedValue(undefined);
    mintPaidQuoteMock.mockResolvedValue("cashuBminted");
    sendOrderPaymentDmMock.mockResolvedValue(undefined);

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

  describe("Lightning settlement", () => {
    async function verify() {
      const req = createMockRequest();
      const res = createMockResponse();
      await handler(req, res as unknown as NextApiResponse);
      return res;
    }

    const quoteState = (state: string) =>
      walletCheckMintQuoteBolt11Mock.mockResolvedValue({ state });

    it("looks the payment up in the database, not in memory", async () => {
      await verify();

      expect(getMcpLightningPaymentMock).toHaveBeenCalledWith("order-123");
    });

    it("returns 400 when the order has no Lightning payment", async () => {
      getMcpLightningPaymentMock.mockResolvedValue(null);

      const res = await verify();

      expect(res.statusCode).toBe(400);
      expect(mintPaidQuoteMock).not.toHaveBeenCalled();
    });

    it("reports unpaid while the invoice is open, and mints nothing", async () => {
      quoteState("UNPAID");

      const res = await verify();

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toMatchObject({
        status: "unpaid",
        payment: { mintUrl: DEFAULT_MINT, quoteId: "quote_abc" },
      });
      expect(claimMcpLightningMintMock).not.toHaveBeenCalled();
      expect(mintPaidQuoteMock).not.toHaveBeenCalled();
    });

    it("mints the paid invoice, saves the token, pays the seller, then marks the order paid", async () => {
      const res = await verify();

      expect(mintPaidQuoteMock).toHaveBeenCalledWith(
        DEFAULT_MINT,
        "quote_abc",
        1000
      );
      expect(setMcpLightningTokenMock).toHaveBeenNthCalledWith(
        1,
        "order-123",
        "cashuBminted"
      );
      expect(sendOrderPaymentDmMock).toHaveBeenCalledWith({
        orderId: "order-123",
        buyerPubkey: BUYER_PUBKEY,
        sellerPubkey: SELLER_PUBKEY,
        productAddress: `30402:${SELLER_PUBKEY}:listing-1`,
        productTitle: "Test Product",
        quantity: 1,
        amount: 1000,
        token: "cashuBminted",
        selectedSpecs: { size: "L" },
        shippingAddress: null,
        encryptedNsec: null,
      });
      expect(updateMcpOrderPaymentMock).toHaveBeenCalledWith(
        "order-123",
        "ln_quote_abc",
        "paid"
      );
      expect(setMcpLightningTokenMock).toHaveBeenLastCalledWith(
        "order-123",
        null
      );
      expect(setMcpLightningTokenMock.mock.invocationCallOrder[0]).toBeLessThan(
        sendOrderPaymentDmMock.mock.invocationCallOrder[0]!
      );
      expect(sendOrderPaymentDmMock.mock.invocationCallOrder[0]).toBeLessThan(
        updateMcpOrderPaymentMock.mock.invocationCallOrder[0]!
      );
      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toMatchObject({ success: true, status: "paid" });
    });

    it("does not mint twice when another request holds the claim", async () => {
      claimMcpLightningMintMock.mockResolvedValue(false);

      const res = await verify();

      expect(res.jsonBody).toMatchObject({ status: "processing" });
      expect(mintPaidQuoteMock).not.toHaveBeenCalled();
      expect(sendOrderPaymentDmMock).not.toHaveBeenCalled();
    });

    it("lets the next request retry when the mint did nothing", async () => {
      mintPaidQuoteMock.mockRejectedValue(new Error("mint down"));

      const res = await verify();

      expect(res.statusCode).toBe(500);
      expect(releaseMcpLightningClaimMock).toHaveBeenCalledWith("order-123");
      expect(sendOrderPaymentDmMock).not.toHaveBeenCalled();
    });

    it("keeps the claim when the mint may have gone through", async () => {
      mintPaidQuoteMock.mockRejectedValue(new Error("response lost"));
      walletCheckMintQuoteBolt11Mock
        .mockResolvedValueOnce({ state: "PAID" })
        .mockResolvedValueOnce({ state: "ISSUED" });

      const res = await verify();

      expect(res.statusCode).toBe(500);
      expect(releaseMcpLightningClaimMock).not.toHaveBeenCalled();
    });

    it("still delivers the token when saving it fails", async () => {
      setMcpLightningTokenMock.mockRejectedValueOnce(new Error("db down"));

      const res = await verify();

      expect(sendOrderPaymentDmMock).toHaveBeenCalledWith(
        expect.objectContaining({ token: "cashuBminted" })
      );
      expect(res.jsonBody).toMatchObject({ status: "paid" });
    });

    it("keeps the order unpaid and the token saved when the seller cannot be reached", async () => {
      sendOrderPaymentDmMock.mockRejectedValue(new Error("cache down"));

      const res = await verify();

      expect(res.statusCode).toBe(502);
      expect(updateMcpOrderPaymentMock).not.toHaveBeenCalled();
      expect(setMcpLightningTokenMock).not.toHaveBeenCalledWith(
        "order-123",
        null
      );
    });

    it("retries only the delivery when a saved token is waiting", async () => {
      getMcpLightningPaymentMock.mockResolvedValue(
        makePayment({ seller_token: "cashuBsaved", claim_age_seconds: 30 })
      );

      const res = await verify();

      expect(walletCheckMintQuoteBolt11Mock).not.toHaveBeenCalled();
      expect(mintPaidQuoteMock).not.toHaveBeenCalled();
      expect(sendOrderPaymentDmMock).toHaveBeenCalledWith(
        expect.objectContaining({ token: "cashuBsaved" })
      );
      expect(res.jsonBody).toMatchObject({ status: "paid" });
    });

    describe("invoice already minted", () => {
      beforeEach(() => quoteState("ISSUED"));

      it("fails the order when someone else minted it", async () => {
        const res = await verify();

        expect(res.statusCode).toBe(409);
        expect(updateMcpOrderPaymentMock).toHaveBeenCalledWith(
          "order-123",
          "failed_order-123",
          "failed"
        );
        expect(sendOrderPaymentDmMock).not.toHaveBeenCalled();
      });

      it("reports processing while our own mint is recent", async () => {
        getMcpLightningPaymentMock.mockResolvedValue(
          makePayment({ claim_age_seconds: 5 })
        );

        const res = await verify();

        expect(res.jsonBody).toMatchObject({ status: "processing" });
        expect(updateMcpOrderPaymentMock).not.toHaveBeenCalled();
      });

      it("fails the order when our own mint never finished", async () => {
        getMcpLightningPaymentMock.mockResolvedValue(
          makePayment({ claim_age_seconds: 600 })
        );

        const res = await verify();

        expect(res.statusCode).toBe(500);
        expect(updateMcpOrderPaymentMock).toHaveBeenCalledWith(
          "order-123",
          "failed_order-123",
          "failed"
        );
      });
    });
  });

  describe("Error handling and mint retry", () => {
    it("wraps checkMintQuoteBolt11 in withMintRetry with { maxAttempts: 2, perAttemptTimeoutMs: 5000 }", async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res as unknown as NextApiResponse);

      expect(withMintRetryMock).toHaveBeenCalledWith(expect.any(Function), {
        maxAttempts: 2,
        perAttemptTimeoutMs: 5000,
      });
    });

    it("returns 500 if checking mint quote throws an error", async () => {
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
