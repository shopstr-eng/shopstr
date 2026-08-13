import type { NextApiRequest, NextApiResponse } from "next";
import type { ApiKeyRecord } from "@/utils/mcp/auth";
import type { NostrEvent } from "@/utils/types/types";

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
const SELLER_PUBKEY = "c".repeat(64);

function makeProductEvent(
  tags: string[][],
  overrides: Partial<NostrEvent> = {}
): NostrEvent {
  return {
    id: "product-1",
    pubkey: SELLER_PUBKEY,
    created_at: Math.floor(Date.now() / 1000),
    kind: 30402,
    tags,
    content: "",
    sig: "sig",
    ...overrides,
  } as NostrEvent;
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

let handler: typeof import("@/pages/api/mcp/create-order").default;
let pendingLightningPayments: typeof import("@/pages/api/mcp/create-order").pendingLightningPayments;
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

  walletLoadMintMock.mockResolvedValue(undefined);
  walletCreateMintQuoteBolt11Mock.mockResolvedValue({
    quote: "quote-1",
    request: "lnbc1...",
  });
  getTrustedMintUrlMock.mockReturnValue("https://mint.example.com");
  createMcpOrderMock.mockImplementation(
    async (
      orderId: string,
      apiKeyId: number | null,
      buyerPubkey: string,
      sellerPubkey: string,
      productId: string,
      productTitle: string | null,
      quantity: number,
      amountTotal: number,
      currency: string,
      shippingAddress: Record<string, string> | null,
      paymentRef: string | null
    ) => ({
      id: 1,
      order_id: orderId,
      api_key_id: apiKeyId,
      buyer_pubkey: buyerPubkey,
      seller_pubkey: sellerPubkey,
      product_id: productId,
      product_title: productTitle,
      quantity,
      amount_total: amountTotal,
      currency,
      shipping_address: shippingAddress,
      payment_ref: paymentRef,
      payment_status: "pending",
      order_status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  );

  const mod = await import("@/pages/api/mcp/create-order");
  handler = mod.default;
  pendingLightningPayments = mod.pendingLightningPayments;
});

async function createOrder(body: Record<string, unknown>) {
  const req = createMockRequest({ method: "POST", body });
  const res = createMockResponse();
  await handler(req, res as unknown as NextApiResponse);
  return res;
}

describe("request gating & routing", () => {
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

describe("handleCreateOrder validation & pricing", () => {
  type PricingBlock = {
    unitPrice: number;
    quantity: number;
    subtotal: number;
    discountPercentage?: number;
    discountedSubtotal?: number;
    shippingCost: number;
    total: number;
    currency: string;
    selectedSpecs?: Record<string, unknown>;
  };

  function pricingOf(res: MockResponse): PricingBlock {
    return (res.jsonBody as { pricing: PricingBlock }).pricing;
  }

  describe("input validation", () => {
    it("rejects when productId is missing", async () => {
      const res = await createOrder({});

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toMatchObject({ error: "productId is required" });
      expect(fetchAllProductsFromDbMock).not.toHaveBeenCalled();
    });

    it.each([0, -1, 1.5])(
      "rejects quantity=%p as not a positive integer",
      async (quantity) => {
        const res = await createOrder({ productId: "product-1", quantity });

        expect(res.statusCode).toBe(400);
        expect(res.jsonBody).toMatchObject({
          error: "quantity must be a positive integer",
        });
        expect(fetchAllProductsFromDbMock).not.toHaveBeenCalled();
      }
    );

    it("rejects an unrecognized paymentMethod", async () => {
      const res = await createOrder({
        productId: "product-1",
        paymentMethod: "paypal",
      });

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toMatchObject({
        error: "Invalid paymentMethod. Must be one of: lightning, cashu",
      });
      expect(fetchAllProductsFromDbMock).not.toHaveBeenCalled();
    });

    it("returns 404 when productId does not resolve to any listing", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent([["title", "Other product"]], { id: "other" }),
      ]);

      const res = await createOrder({ productId: "product-1" });

      expect(res.statusCode).toBe(404);
      expect(res.jsonBody).toMatchObject({ error: "Product not found" });
    });

    it("returns 500 'Failed to parse product data' when parseTags returns undefined (event with no tags)", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent(undefined as unknown as string[][]),
      ]);

      const res = await createOrder({ productId: "product-1" });

      expect(res.statusCode).toBe(500);
      expect(res.jsonBody).toMatchObject({
        error: "Failed to parse product data",
      });
    });
  });

  describe("size selection", () => {
    it("rejects an unrecognized selectedSize, listing availableSizes", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent([
          ["price", "1000", "sats"],
          ["size", "S", "5"],
          ["size", "M", "2"],
        ]),
      ]);

      const res = await createOrder({
        productId: "product-1",
        selectedSize: "XL",
      });

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toMatchObject({
        error: 'Invalid size selection: "XL"',
        availableSizes: ["S", "M"],
      });
    });

    it("rejects when sizeQuantities stock for the selected size is less than quantity", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent([
          ["price", "1000", "sats"],
          ["size", "S", "5"],
        ]),
      ]);

      const res = await createOrder({
        productId: "product-1",
        selectedSize: "S",
        quantity: 10,
      });

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toMatchObject({
        error: 'Insufficient stock for size "S"',
        available: 5,
        requested: 10,
      });
    });

    it("falls back to the top-level quantity stock check only when selectedSize is not provided", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent([
          ["price", "1000", "sats"],
          ["quantity", "3"],
        ]),
      ]);

      const res = await createOrder({ productId: "product-1", quantity: 5 });

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toMatchObject({
        error: "Insufficient stock",
        available: 3,
        requested: 5,
      });
    });
  });

  describe("volume/weight pricing", () => {
    it("rejects an unrecognized selectedVolume, listing availableVolumes", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent([
          ["price", "1000", "sats"],
          ["volume", "250ml", "1500"],
        ]),
      ]);

      const res = await createOrder({
        productId: "product-1",
        selectedVolume: "1L",
      });

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toMatchObject({
        error: 'Invalid volume selection: "1L"',
        availableVolumes: ["250ml"],
      });
    });

    it("overrides unitPrice with volumePrices when a valid selectedVolume is given", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent([
          ["price", "1000", "sats"],
          ["volume", "250ml", "1500"],
        ]),
      ]);

      const res = await createOrder({
        productId: "product-1",
        selectedVolume: "250ml",
      });

      expect(res.statusCode).toBe(402);
      expect(pricingOf(res)).toMatchObject({
        unitPrice: 1500,
        subtotal: 1500,
        total: 1500,
      });
    });

    it("rejects an unrecognized selectedWeight, listing availableWeights", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent([
          ["price", "1000", "sats"],
          ["weight", "100g", "800"],
        ]),
      ]);

      const res = await createOrder({
        productId: "product-1",
        selectedWeight: "200g",
      });

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toMatchObject({
        error: 'Invalid weight selection: "200g"',
        availableWeights: ["100g"],
      });
    });

    it("uses volume pricing when both volume and weight are selected, matching shared pricing precedence", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent([
          ["price", "1000", "sats"],
          ["volume", "250ml", "1500"],
          ["weight", "100g", "800"],
        ]),
      ]);

      const res = await createOrder({
        productId: "product-1",
        selectedVolume: "250ml",
        selectedWeight: "100g",
      });

      expect(res.statusCode).toBe(402);
      expect(pricingOf(res)).toMatchObject({
        unitPrice: 1500,
        total: 1500,
        selectedSpecs: {
          volume: "250ml",
          volumePrice: 1500,
          weight: "100g",
          weightPrice: 800,
        },
      });
    });
  });

  describe("bulk pricing", () => {
    it("rejects an unrecognized selectedBulkUnits, listing availableBulkTiers", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent([
          ["price", "1000", "sats"],
          ["bulk", "10", "9000"],
        ]),
      ]);

      const res = await createOrder({
        productId: "product-1",
        selectedBulkUnits: 99,
      });

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toMatchObject({
        error: "Invalid bulk tier: 99 units",
        availableBulkTiers: [{ units: 10, totalPrice: 9000 }],
      });
    });

    it("computes subtotal as bulkTotalPrice * quantity and effectiveQuantity as selectedBulkUnits * quantity", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent([
          ["price", "1000", "sats"],
          ["bulk", "10", "9000"],
        ]),
      ]);

      const res = await createOrder({
        productId: "product-1",
        selectedBulkUnits: 10,
        quantity: 2,
      });

      expect(res.statusCode).toBe(402);
      expect(pricingOf(res)).toMatchObject({
        quantity: 20,
        subtotal: 18000,
        total: 18000,
      });
    });
  });

  describe("shipping cost", () => {
    it.each(["Free", "Free/Pickup", "Pickup", "N/A"])(
      "zeroes shippingCost for shippingType %s even if the listing's tag carries a nonzero cost",
      async (shippingType) => {
        fetchAllProductsFromDbMock.mockResolvedValue([
          makeProductEvent([
            ["price", "1000", "sats"],
            ["shipping", shippingType, "500", "sats"],
          ]),
        ]);

        const res = await createOrder({ productId: "product-1" });

        expect(res.statusCode).toBe(402);
        expect(pricingOf(res)).toMatchObject({
          shippingCost: 0,
          total: 1000,
        });
      }
    );

    it("keeps the listing's shippingCost for any other shippingType", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent([
          ["price", "1000", "sats"],
          ["shipping", "Added Cost", "300", "sats"],
        ]),
      ]);

      const res = await createOrder({ productId: "product-1" });

      expect(res.statusCode).toBe(402);
      expect(pricingOf(res)).toMatchObject({
        shippingCost: 300,
        total: 1300,
      });
    });
  });

  describe("discount code", () => {
    it("applies discountPercentage to subtotal when validateDiscountCode resolves valid", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent([["price", "1000", "sats"]]),
      ]);
      validateDiscountCodeMock.mockResolvedValue({
        valid: true,
        discount_percentage: 10,
      });

      const res = await createOrder({
        productId: "product-1",
        discountCode: "SAVE10",
      });

      expect(res.statusCode).toBe(402);
      expect(pricingOf(res)).toMatchObject({
        subtotal: 1000,
        discountPercentage: 10,
        discountedSubtotal: 900,
        total: 900,
      });
    });

    it("leaves subtotal unchanged when validateDiscountCode resolves invalid", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent([["price", "1000", "sats"]]),
      ]);
      validateDiscountCodeMock.mockResolvedValue({ valid: false });

      const res = await createOrder({
        productId: "product-1",
        discountCode: "BOGUS",
      });

      expect(res.statusCode).toBe(402);
      const pricing = pricingOf(res);
      expect(pricing.discountPercentage).toBeUndefined();
      expect(pricing.discountedSubtotal).toBeUndefined();
      expect(pricing.total).toBe(1000);
    });

    it("scopes the discount lookup to the product's pubkey (seller), not the buyer", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent([["price", "1000", "sats"]], {
          pubkey: SELLER_PUBKEY,
        }),
      ]);
      validateDiscountCodeMock.mockResolvedValue({ valid: false });

      await createOrder({ productId: "product-1", discountCode: "SAVE10" });

      expect(validateDiscountCodeMock).toHaveBeenCalledWith(
        "SAVE10",
        SELLER_PUBKEY
      );
      expect(validateDiscountCodeMock).not.toHaveBeenCalledWith(
        "SAVE10",
        BUYER_PUBKEY
      );
    });
  });

  describe("seller payment-method discount", () => {
    function withSellerProfile(content: string) {
      fetchAllProfilesFromDbMock.mockResolvedValue([
        {
          id: "profile-1",
          pubkey: SELLER_PUBKEY,
          created_at: Math.floor(Date.now() / 1000),
          kind: 0,
          tags: [],
          content,
          sig: "sig",
        },
      ]);
    }

    it("applies the seller bitcoin discount after a valid code discount", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent([["price", "1000", "sats"]]),
      ]);
      validateDiscountCodeMock.mockResolvedValue({
        valid: true,
        discount_percentage: 10,
      });
      withSellerProfile(
        JSON.stringify({ paymentMethodDiscounts: { bitcoin: 5 } })
      );

      const res = await createOrder({
        productId: "product-1",
        discountCode: "SAVE10",
      });

      expect(res.statusCode).toBe(402);
      expect(pricingOf(res)).toMatchObject({
        subtotal: 1000,
        discountPercentage: 10,
        discountedSubtotal: 855,
        total: 855,
      });
    });

    it.each([0, -5, "5"])(
      "ignores bitcoin discount value %p when it is not a positive number",
      async (methodDiscount) => {
        fetchAllProductsFromDbMock.mockResolvedValue([
          makeProductEvent([["price", "1000", "sats"]]),
        ]);
        withSellerProfile(
          JSON.stringify({
            paymentMethodDiscounts: { bitcoin: methodDiscount },
          })
        );

        const res = await createOrder({ productId: "product-1" });

        expect(res.statusCode).toBe(402);
        expect(pricingOf(res).total).toBe(1000);
      }
    );

    it("ignores a seller profile whose content isn't valid JSON (getSellerProfile catches and returns null)", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent([["price", "1000", "sats"]]),
      ]);
      withSellerProfile("not json");

      const res = await createOrder({ productId: "product-1" });

      expect(res.statusCode).toBe(402);
      expect(pricingOf(res).total).toBe(1000);
    });
  });

  describe("pricing block shape", () => {
    it("omits selectedSpecs when no size/volume/weight/bulk was selected", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent([["price", "1000", "sats"]]),
      ]);

      const res = await createOrder({ productId: "product-1" });

      expect(pricingOf(res).selectedSpecs).toBeUndefined();
    });

    it("includes selectedSpecs.size when selectedSize was selected", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent([
          ["price", "1000", "sats"],
          ["size", "S", "5"],
        ]),
      ]);

      const res = await createOrder({
        productId: "product-1",
        selectedSize: "S",
      });

      expect(pricingOf(res).selectedSpecs).toMatchObject({ size: "S" });
    });

    it("dispatches to handleCashuPayment when paymentMethod is 'cashu' (surfaces its own validation error instead of a Lightning invoice)", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent([["price", "1000", "sats"]]),
      ]);

      const res = await createOrder({
        productId: "product-1",
        paymentMethod: "cashu",
      });

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toMatchObject({
        error:
          "cashuToken is required for Cashu payments. Provide a serialized Cashu token string.",
      });
      expect(walletCreateMintQuoteBolt11Mock).not.toHaveBeenCalled();
    });

    it("dispatches to handleLightningPayment by default", async () => {
      fetchAllProductsFromDbMock.mockResolvedValue([
        makeProductEvent([["price", "1000", "sats"]]),
      ]);

      const res = await createOrder({ productId: "product-1" });

      expect(res.statusCode).toBe(402);
      expect(res.jsonBody).toMatchObject({ paymentMethod: "lightning" });
    });

    it("returns a generic 500 response when fetchAllProductsFromDb rejects", async () => {
      fetchAllProductsFromDbMock.mockRejectedValueOnce(
        new Error("db unavailable")
      );

      const res = await createOrder({ productId: "product-1" });

      expect(res.statusCode).toBe(500);
      expect(res.jsonBody).toEqual({
        error: "Failed to create order",
      });
    });
  });
});

describe("handleLightningPayment", () => {
  function withPricedProduct(tags: string[][] = [["price", "1000", "sats"]]) {
    fetchAllProductsFromDbMock.mockResolvedValue([
      makeProductEvent(tags, { pubkey: SELLER_PUBKEY }),
    ]);
  }

  it("rounds a fractional totalAmount to the nearest integer sats before requesting a mint quote", async () => {
    withPricedProduct([["price", "1000.6", "sats"]]);

    const res = await createOrder({ productId: "product-1" });

    expect(res.statusCode).toBe(402);
    expect(walletCreateMintQuoteBolt11Mock).toHaveBeenCalledWith(1001);
  });

  it("creates the order with payment_ref 'ln_<quote>' using the buyer/seller/product/quantity/amount/currency/shippingAddress computed by handleCreateOrder", async () => {
    withPricedProduct();
    walletCreateMintQuoteBolt11Mock.mockResolvedValue({
      quote: "quote-42",
      request: "lnbc42...",
    });
    const shippingAddress = {
      name: "Ada Lovelace",
      address: "1 Infinite Loop",
      city: "Cupertino",
      postalCode: "95014",
      stateProvince: "CA",
      country: "US",
    };

    await createOrder({
      productId: "product-1",
      quantity: 2,
      shippingAddress,
    });

    expect(createMcpOrderMock).toHaveBeenCalledWith(
      expect.stringMatching(/^mcp_\d+_[0-9a-f]{8}$/),
      1,
      BUYER_PUBKEY,
      SELLER_PUBKEY,
      "product-1",
      "",
      2,
      2000,
      "sats",
      shippingAddress,
      "ln_quote-42"
    );
  });

  it("stores the pending payment (quote/mintUrl/amount/orderId) in pendingLightningPayments keyed by the generated orderId", async () => {
    withPricedProduct();
    walletCreateMintQuoteBolt11Mock.mockResolvedValue({
      quote: "quote-7",
      request: "lnbc7...",
    });
    getTrustedMintUrlMock.mockReturnValue("https://mint.example.com");

    await createOrder({ productId: "product-1" });

    const orderId = createMcpOrderMock.mock.calls[0]?.[0] as string;
    expect(pendingLightningPayments.get(orderId)).toEqual({
      quote: "quote-7",
      mintUrl: "https://mint.example.com",
      amount: 1000,
      orderId,
    });
  });

  it("returns 402 payment_required with the bolt11 invoice, quoteId, amount, mintUrl, and a ~10-minute expiresAt", async () => {
    withPricedProduct();
    walletCreateMintQuoteBolt11Mock.mockResolvedValue({
      quote: "quote-9",
      request: "lnbc9...",
    });
    getTrustedMintUrlMock.mockReturnValue("https://mint.example.com");

    const before = Date.now();
    const res = await createOrder({ productId: "product-1" });
    const after = Date.now();

    expect(res.statusCode).toBe(402);
    const body = res.jsonBody as {
      status: string;
      paymentMethod: string;
      payment: {
        bolt11: string;
        quoteId: string;
        amount: number;
        currency: string;
        mintUrl: string;
        expiresAt: string;
      };
    };
    expect(body.status).toBe("payment_required");
    expect(body.paymentMethod).toBe("lightning");
    expect(body.payment).toMatchObject({
      bolt11: "lnbc9...",
      quoteId: "quote-9",
      amount: 1000,
      currency: "sats",
      mintUrl: "https://mint.example.com",
    });
    const expiresAt = new Date(body.payment.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + 10 * 60 * 1000);
    expect(expiresAt).toBeLessThanOrEqual(after + 10 * 60 * 1000);
  });

  it.each([
    [
      "wallet.loadMint",
      () => walletLoadMintMock.mockRejectedValueOnce(new Error("mint offline")),
    ],
    [
      "wallet.createMintQuoteBolt11",
      () =>
        walletCreateMintQuoteBolt11Mock.mockRejectedValueOnce(
          new Error("quote failed")
        ),
    ],
  ])(
    "returns 500 'Failed to generate Lightning invoice' with details when %s throws, without creating an order",
    async (_label, setupFailure) => {
      withPricedProduct();
      setupFailure();

      const res = await createOrder({ productId: "product-1" });

      expect(res.statusCode).toBe(500);
      expect(res.jsonBody).toMatchObject({
        error: "Failed to generate Lightning invoice",
      });
      expect(createMcpOrderMock).not.toHaveBeenCalled();
    }
  );

  it("returns the generic 500 'Failed to create order' (not an unhandled rejection) when the computed amount is invalid — handleCreateOrder awaits handleLightningPayment, so a synchronous throw from toCashuMintAmountSats is caught by handleCreateOrder's own try/catch", async () => {
    withPricedProduct([["price", "0", "sats"]]);

    const req = createMockRequest({
      method: "POST",
      body: { productId: "product-1" },
    });
    const res = createMockResponse();

    await handler(req, res as unknown as NextApiResponse);

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody).toEqual({ error: "Failed to create order" });
    expect(walletCreateMintQuoteBolt11Mock).not.toHaveBeenCalled();
    expect(createMcpOrderMock).not.toHaveBeenCalled();
  });
});

describe("handleCashuPayment", () => {
  const VALID_MINT = "https://mint.example.com";
  const CASHU_TOKEN = "cashuAbc123";

  function withPricedProduct(tags: string[][] = [["price", "1000", "sats"]]) {
    fetchAllProductsFromDbMock.mockResolvedValue([
      makeProductEvent(tags, { pubkey: SELLER_PUBKEY }),
    ]);
  }

  function decodedToken(
    overrides: Partial<{
      proofs: Array<{ amount: number }>;
      mint: string | undefined;
    }> = {}
  ) {
    return {
      proofs: [{ amount: 1000 }],
      mint: VALID_MINT,
      ...overrides,
    };
  }

  beforeEach(() => {
    withPricedProduct();
    getTrustedMintUrlMock.mockReturnValue(VALID_MINT);
    getDecodedTokenMock.mockReturnValue(decodedToken());
    withMintRetryMock.mockImplementation((fn: () => Promise<unknown>) => fn());
    walletReceiveMock.mockResolvedValue(undefined);
    updateMcpOrderPaymentMock.mockResolvedValue(undefined);
  });

  async function createCashuOrder(overrides: Record<string, unknown> = {}) {
    return createOrder({
      productId: "product-1",
      paymentMethod: "cashu",
      cashuToken: CASHU_TOKEN,
      ...overrides,
    });
  }

  describe("validation", () => {
    it("returns 400 with an example payload when cashuToken is missing", async () => {
      const res = await createOrder({
        productId: "product-1",
        paymentMethod: "cashu",
      });

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toMatchObject({
        error:
          "cashuToken is required for Cashu payments. Provide a serialized Cashu token string.",
        example: { paymentMethod: "cashu", cashuToken: "cashuBo2F0..." },
      });
      expect(getDecodedTokenMock).not.toHaveBeenCalled();
    });

    it("returns 500 'Failed to process Cashu payment' (not a 400) when getDecodedToken throws on a malformed token", async () => {
      getDecodedTokenMock.mockImplementationOnce(() => {
        throw new Error("malformed token");
      });

      const res = await createCashuOrder();

      expect(res.statusCode).toBe(500);
      expect(res.jsonBody).toMatchObject({
        error: "Failed to process Cashu payment",
        details: "malformed token",
      });
    });

    it("returns 400 'Invalid Cashu token: no proofs found' when getDecodedToken returns an empty proofs array", async () => {
      getDecodedTokenMock.mockReturnValueOnce(decodedToken({ proofs: [] }));

      const res = await createCashuOrder();

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toMatchObject({
        error: "Invalid Cashu token: no proofs found",
      });
    });

    it("returns 400 with provided/required amounts when the token's total proof amount is less than the order total", async () => {
      getDecodedTokenMock.mockReturnValueOnce(
        decodedToken({ proofs: [{ amount: 500 }] })
      );

      const res = await createCashuOrder();

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toMatchObject({
        error: "Insufficient Cashu token amount",
        provided: 500,
        required: 1000,
        currency: "sats",
      });
    });
  });

  describe("mint allowlist", () => {
    it("rejects a token whose decoded mint URL does not equal the trusted mint, listing supportedMints, without calling withMintRetry", async () => {
      getDecodedTokenMock.mockReturnValueOnce(
        decodedToken({ mint: "https://evil-mint.example" })
      );

      const res = await createCashuOrder();

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toMatchObject({
        error:
          "Cashu token issuer is not a supported mint. Only tokens from trusted mints are accepted.",
        supportedMints: [VALID_MINT],
      });
      expect(withMintRetryMock).not.toHaveBeenCalled();
    });

    it("rejects a token with no mint URL at all", async () => {
      getDecodedTokenMock.mockReturnValueOnce(
        decodedToken({ mint: undefined })
      );

      const res = await createCashuOrder();

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toMatchObject({
        error:
          "Cashu token issuer is not a supported mint. Only tokens from trusted mints are accepted.",
      });
    });

    it("accepts a token whose mint URL exactly matches the trusted mint", async () => {
      const res = await createCashuOrder();

      expect(res.statusCode).toBe(201);
    });
  });

  describe("redemption", () => {
    it("redeems via withMintRetry with the documented retry budget", async () => {
      await createCashuOrder();

      expect(withMintRetryMock).toHaveBeenCalledWith(expect.any(Function), {
        maxAttempts: 4,
        perAttemptTimeoutMs: 20000,
        totalTimeoutMs: 90000,
      });
      expect(walletReceiveMock).toHaveBeenCalledWith(CASHU_TOKEN);
    });

    it("returns 400 'Failed to redeem Cashu token' when withMintRetry/wallet.receive rejects, without creating an order", async () => {
      withMintRetryMock.mockRejectedValueOnce(new Error("mint unreachable"));

      const res = await createCashuOrder();

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toMatchObject({
        error:
          "Failed to redeem Cashu token. It may be invalid or already spent.",
        details: "mint unreachable",
      });
      expect(createMcpOrderMock).not.toHaveBeenCalled();
    });

    it("creates the order with payment_ref 'cashu_<orderId>' using the buyer/seller/product/quantity/amount/currency computed by handleCreateOrder, then immediately marks it paid", async () => {
      await createCashuOrder();

      const orderId = createMcpOrderMock.mock.calls[0]?.[0] as string;
      expect(createMcpOrderMock).toHaveBeenCalledWith(
        orderId,
        1,
        BUYER_PUBKEY,
        SELLER_PUBKEY,
        "product-1",
        "",
        1,
        1000,
        "sats",
        null,
        `cashu_${orderId}`
      );
      expect(updateMcpOrderPaymentMock).toHaveBeenCalledWith(
        orderId,
        `paid_${orderId}`,
        "paid"
      );
    });

    it("returns 201 with paymentMethod cashu, status paid, and change = tokenAmount - requiredAmount", async () => {
      getDecodedTokenMock.mockReturnValueOnce(
        decodedToken({ proofs: [{ amount: 1200 }] })
      );

      const res = await createCashuOrder();

      expect(res.statusCode).toBe(201);
      expect(res.jsonBody).toMatchObject({
        success: true,
        paymentMethod: "cashu",
        payment: {
          method: "cashu",
          amount: 1200,
          required: 1000,
          status: "paid",
          change: 200,
        },
      });
    });

    it("reports change:0 when the token amount exactly matches the required amount", async () => {
      const res = await createCashuOrder();

      expect(res.statusCode).toBe(201);
      expect(res.jsonBody).toMatchObject({ payment: { change: 0 } });
    });

    it.each([
      [
        "createMcpOrder",
        () =>
          createMcpOrderMock.mockRejectedValueOnce(
            new Error("db insert failed")
          ),
      ],
      [
        "updateMcpOrderPayment",
        () =>
          updateMcpOrderPaymentMock.mockRejectedValueOnce(
            new Error("payment status update failed")
          ),
      ],
    ])(
      "returns 500 'Failed to process Cashu payment' when %s throws after a successful token redemption — payment was already collected but the order write failed",
      async (_label, setupFailure) => {
        setupFailure();

        const res = await createCashuOrder();

        expect(res.statusCode).toBe(500);
        expect(res.jsonBody).toMatchObject({
          error: "Failed to process Cashu payment",
        });
      }
    );
  });
});

describe("handleGetOrder / handleListOrders", () => {
  function makeMcpOrder(overrides: Record<string, unknown> = {}) {
    return {
      id: 1,
      order_id: "mcp_1",
      api_key_id: 1,
      buyer_pubkey: BUYER_PUBKEY,
      seller_pubkey: SELLER_PUBKEY,
      product_id: "product-1",
      product_title: "Test Product",
      quantity: 1,
      amount_total: 1000,
      currency: "sats",
      shipping_address: null,
      payment_ref: "ln_quote-1",
      payment_status: "pending",
      order_status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  }

  async function getOrder(orderId: string) {
    const req = createMockRequest({ method: "GET", query: { orderId } });
    const res = createMockResponse();
    await handler(req, res as unknown as NextApiResponse);
    return res;
  }

  async function listOrders(query: Record<string, string> = {}) {
    const req = createMockRequest({ method: "GET", query });
    const res = createMockResponse();
    await handler(req, res as unknown as NextApiResponse);
    return res;
  }

  describe("handleGetOrder", () => {
    it("returns 404 'Order not found' when getMcpOrder resolves null", async () => {
      getMcpOrderMock.mockResolvedValueOnce(null);

      const res = await getOrder("mcp_missing");

      expect(res.statusCode).toBe(404);
      expect(res.jsonBody).toEqual({ error: "Order not found" });
    });

    it("returns 403 'Not authorized to view this order' when the order belongs to a different buyer", async () => {
      getMcpOrderMock.mockResolvedValueOnce(
        makeMcpOrder({ buyer_pubkey: SELLER_PUBKEY })
      );

      const res = await getOrder("mcp_1");

      expect(res.statusCode).toBe(403);
      expect(res.jsonBody).toEqual({
        error: "Not authorized to view this order",
      });
    });

    it("returns 200 with success:true and the formatted order when the buyer pubkeys match", async () => {
      const order = makeMcpOrder({ buyer_pubkey: BUYER_PUBKEY });
      getMcpOrderMock.mockResolvedValueOnce(order);

      const res = await getOrder("mcp_1");

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toEqual({ success: true, order });
      expect(formatOrderForResponseMock).toHaveBeenCalledWith(order);
    });

    it("returns 500 'Failed to get order' when getMcpOrder throws", async () => {
      getMcpOrderMock.mockRejectedValueOnce(new Error("db down"));

      const res = await getOrder("mcp_1");

      expect(res.statusCode).toBe(500);
      expect(res.jsonBody).toEqual({ error: "Failed to get order" });
    });
  });

  describe("handleListOrders", () => {
    it("defaults to limit=50 offset=0 when query params are absent", async () => {
      await listOrders({});

      expect(listMcpOrdersMock).toHaveBeenCalledWith(BUYER_PUBKEY, 50, 0);
    });

    it("parses limit/offset from query strings", async () => {
      await listOrders({ limit: "5", offset: "20" });

      expect(listMcpOrdersMock).toHaveBeenCalledWith(BUYER_PUBKEY, 5, 20);
    });

    it("falls back to defaults when limit/offset query params are non-numeric", async () => {
      await listOrders({ limit: "abc", offset: "xyz" });

      expect(listMcpOrdersMock).toHaveBeenCalledWith(BUYER_PUBKEY, 50, 0);
    });

    it("scopes the lookup to whichever pubkey authenticateRequest resolved for this request, not a fixed value", async () => {
      const otherPubkey = "d".repeat(64);
      authenticateRequestMock.mockImplementationOnce(async () =>
        makeApiKey({ pubkey: otherPubkey })
      );

      await listOrders({});

      expect(listMcpOrdersMock).toHaveBeenCalledWith(otherPubkey, 50, 0);
    });

    it("returns success:true, the formatted orders, and count equal to the returned array length", async () => {
      const orders = [
        makeMcpOrder({ order_id: "mcp_1" }),
        makeMcpOrder({ order_id: "mcp_2" }),
      ];
      listMcpOrdersMock.mockResolvedValueOnce(orders);

      const res = await listOrders({});

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toEqual({ success: true, orders, count: 2 });
    });

    it("returns 500 'Failed to list orders' when listMcpOrders throws", async () => {
      listMcpOrdersMock.mockRejectedValueOnce(new Error("db down"));

      const res = await listOrders({});

      expect(res.statusCode).toBe(500);
      expect(res.jsonBody).toEqual({ error: "Failed to list orders" });
    });
  });
});
