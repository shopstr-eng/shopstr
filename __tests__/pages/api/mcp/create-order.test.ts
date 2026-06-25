import type { NextApiRequest, NextApiResponse } from "next";

const authenticateRequestMock = jest.fn();
const initializeApiKeysTableMock = jest.fn();
const fetchAllProductsFromDbMock = jest.fn();
const fetchAllProfilesFromDbMock = jest.fn();
const validateDiscountCodeMock = jest.fn();
const recordRequestMock = jest.fn();
const createMcpOrderMock = jest.fn();
const getMcpOrderMock = jest.fn();
const listMcpOrdersMock = jest.fn();
const updateMcpOrderPaymentMock = jest.fn();
const createMintQuoteBolt11Mock = jest.fn();
const receiveMock = jest.fn();
const loadMintMock = jest.fn();
const getDecodedTokenMock = jest.fn();
const getSatoshiValueMock = jest.fn();
var mockCashuMint: jest.Mock;

jest.mock("@/utils/mcp/auth", () => ({
  authenticateRequest: (...args: unknown[]) => authenticateRequestMock(...args),
  initializeApiKeysTable: (...args: unknown[]) =>
    initializeApiKeysTableMock(...args),
}));

jest.mock("@/utils/db/db-service", () => ({
  fetchAllProductsFromDb: (...args: unknown[]) =>
    fetchAllProductsFromDbMock(...args),
  fetchAllProfilesFromDb: (...args: unknown[]) =>
    fetchAllProfilesFromDbMock(...args),
  validateDiscountCode: (...args: unknown[]) =>
    validateDiscountCodeMock(...args),
}));

jest.mock("@/utils/mcp/metrics", () => ({
  recordRequest: (...args: unknown[]) => recordRequestMock(...args),
}));

jest.mock("@/mcp/tools/purchase-tools", () => ({
  createMcpOrder: (...args: unknown[]) => createMcpOrderMock(...args),
  getMcpOrder: (...args: unknown[]) => getMcpOrderMock(...args),
  listMcpOrders: (...args: unknown[]) => listMcpOrdersMock(...args),
  updateMcpOrderPayment: (...args: unknown[]) =>
    updateMcpOrderPaymentMock(...args),
  formatOrderForResponse: (order: { order_id: string }) => ({
    orderId: order.order_id,
  }),
}));

jest.mock("@getalby/lightning-tools", () => ({
  getSatoshiValue: (...args: unknown[]) => getSatoshiValueMock(...args),
}));

jest.mock("@cashu/cashu-ts", () => {
  mockCashuMint = jest.fn().mockImplementation((url: string) => ({ url }));
  return {
    Mint: mockCashuMint,
    Wallet: jest.fn().mockImplementation(() => ({
      loadMint: (...args: unknown[]) => loadMintMock(...args),
      createMintQuoteBolt11: (...args: unknown[]) =>
        createMintQuoteBolt11Mock(...args),
      receive: (...args: unknown[]) => receiveMock(...args),
    })),
    getDecodedToken: (...args: unknown[]) => getDecodedTokenMock(...args),
  };
});

import handler from "@/pages/api/mcp/create-order";
import { __resetRateLimitBuckets } from "@/utils/rate-limit";

function createResponse() {
  return {
    statusCode: 200,
    jsonBody: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.jsonBody = payload;
      this.end();
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    end: jest.fn(),
  };
}

function createRequest(body: unknown): NextApiRequest {
  return {
    method: "POST",
    headers: {},
    socket: { remoteAddress: "8.8.8.8" },
    body,
    query: {},
  } as NextApiRequest;
}

function productEvent() {
  return {
    id: "product-1",
    pubkey: "seller-pubkey",
    created_at: 1,
    kind: 30402,
    content: "",
    sig: "sig",
    tags: [
      ["title", "MCP USD listing"],
      ["d", "mcp-usd-listing"],
      ["price", "5", "USD"],
      ["shipping", "Added Cost", "1", "USD"],
    ],
  };
}

function mcpOrder() {
  return {
    order_id: "mcp_test_order",
    product_id: "product-1",
    product_title: "MCP USD listing",
    quantity: 1,
    amount_total: 6,
    currency: "USD",
    shipping_address: null,
    payment_ref: "ln_quote-600",
    payment_status: "pending",
    order_status: "pending",
    created_at: "2026-06-10T00:00:00.000Z",
  };
}

describe("/api/mcp/create-order", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetRateLimitBuckets();

    authenticateRequestMock.mockResolvedValue({
      id: 42,
      pubkey: "buyer-pubkey",
    });
    initializeApiKeysTableMock.mockResolvedValue(undefined);
    fetchAllProductsFromDbMock.mockResolvedValue([productEvent()]);
    fetchAllProfilesFromDbMock.mockResolvedValue([]);
    validateDiscountCodeMock.mockResolvedValue({
      valid: false,
      discount_percentage: 0,
    });
    createMcpOrderMock.mockResolvedValue(mcpOrder());
    updateMcpOrderPaymentMock.mockResolvedValue(mcpOrder());
    loadMintMock.mockResolvedValue(undefined);
    createMintQuoteBolt11Mock.mockResolvedValue({
      request: "lnbc600",
      quote: "quote-600",
    });
    receiveMock.mockResolvedValue([]);
    getDecodedTokenMock.mockReturnValue({
      mint: "https://mint.minibits.cash/Bitcoin",
      proofs: [{ amount: 600 }],
    });
    getSatoshiValueMock.mockImplementation(({ amount }) => amount * 100);
  });

  it("creates Lightning mint quotes in sats after converting non-sat listing totals", async () => {
    const res = createResponse();

    await handler(
      createRequest({
        productId: "product-1",
        quantity: 1,
        paymentMethod: "lightning",
      }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(402);
    expect(getSatoshiValueMock).toHaveBeenCalledWith({
      amount: 6,
      currency: "USD",
    });
    expect(createMintQuoteBolt11Mock).toHaveBeenCalledWith(600);
    expect(res.jsonBody).toMatchObject({
      status: "payment_required",
      payment: {
        amount: 600,
        currency: "sats",
      },
      pricing: {
        total: 6,
        currency: "USD",
      },
    });
  });

  it("checks Cashu tokens against the converted sat amount for non-sat listings", async () => {
    const res = createResponse();

    await handler(
      createRequest({
        productId: "product-1",
        quantity: 1,
        paymentMethod: "cashu",
        cashuToken: "cashu-token",
      }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(201);
    expect(getSatoshiValueMock).toHaveBeenCalledWith({
      amount: 6,
      currency: "USD",
    });
    expect(receiveMock).toHaveBeenCalledWith("cashu-token");
    expect(res.jsonBody).toMatchObject({
      success: true,
      payment: {
        amount: 600,
        required: 600,
        status: "paid",
      },
    });
  });
});
