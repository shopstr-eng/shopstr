import type { NextApiRequest, NextApiResponse } from "next";

const fetchProductByIdFromDbMock = jest.fn();
const fetchProductByDTagAndPubkeyMock = jest.fn();
const validateDiscountCodeMock = jest.fn();
const createMintQuoteBolt11Mock = jest.fn();
const loadMintMock = jest.fn();
const getSatoshiValueMock = jest.fn();
var mockCashuMint: jest.Mock;

jest.mock("@/utils/db/db-service", () => {
  class DatabaseUnavailableError extends Error {
    constructor(message = "Database unavailable") {
      super(message);
      this.name = "DatabaseUnavailableError";
    }
  }
  return {
    DatabaseUnavailableError,
    fetchProductByDTagAndPubkey: (...args: unknown[]) =>
      fetchProductByDTagAndPubkeyMock(...args),
    fetchProductByIdFromDb: (...args: unknown[]) =>
      fetchProductByIdFromDbMock(...args),
    validateDiscountCode: (...args: unknown[]) =>
      validateDiscountCodeMock(...args),
  };
});

jest.mock("@getalby/lightning-tools", () => ({
  getSatoshiValue: (...args: unknown[]) => getSatoshiValueMock(...args),
}));

jest.mock("@cashu/cashu-ts", () => {
  mockCashuMint = jest.fn().mockImplementation((url: string) => ({ url }));
  class HttpResponseError extends Error {}
  class RateLimitError extends Error {}
  return {
    Mint: mockCashuMint,
    Wallet: jest.fn().mockImplementation(() => ({
      loadMint: (...args: unknown[]) => loadMintMock(...args),
      createMintQuoteBolt11: (...args: unknown[]) =>
        createMintQuoteBolt11Mock(...args),
    })),
    HttpResponseError,
    RateLimitError,
  };
});

import handler from "@/pages/api/listing/mint-quote";
import { DatabaseUnavailableError } from "@/utils/db/db-service";
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
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
  };
}

function createRequest(body: unknown): NextApiRequest {
  return {
    method: "POST",
    headers: {},
    socket: { remoteAddress: "8.8.8.8" },
    body,
  } as NextApiRequest;
}

const productEvent = {
  id: "product-1",
  pubkey: "seller-pubkey",
  created_at: 1,
  kind: 30402,
  content: "",
  sig: "sig",
  tags: [
    ["title", "Server priced listing"],
    ["d", "listing-d"],
    ["price", "100", "sats"],
    ["shipping", "Added Cost", "10", "sats"],
    ["bulk", "3", "250"],
  ],
};

describe("/api/listing/mint-quote", () => {
  beforeEach(() => {
    fetchProductByIdFromDbMock.mockReset();
    fetchProductByDTagAndPubkeyMock.mockReset();
    validateDiscountCodeMock.mockReset();
    createMintQuoteBolt11Mock.mockReset();
    loadMintMock.mockReset();
    getSatoshiValueMock.mockReset();
    mockCashuMint.mockClear();
    __resetRateLimitBuckets();

    fetchProductByIdFromDbMock.mockResolvedValue(productEvent);
    fetchProductByDTagAndPubkeyMock.mockResolvedValue(productEvent);
    validateDiscountCodeMock.mockResolvedValue({
      valid: true,
      discount_percentage: 10,
    });
    createMintQuoteBolt11Mock.mockResolvedValue({
      request: "lnbc110",
      quote: "quote-110",
    });
    loadMintMock.mockResolvedValue(undefined);
  });

  it("recomputes the listing amount server-side before creating a mint quote", async () => {
    const res = createResponse();

    await handler(
      createRequest({
        productId: "product-1",
        formType: "shipping",
        discountCode: "SAVE10",
      }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(200);
    expect(fetchProductByIdFromDbMock).toHaveBeenCalledWith("product-1", {
      rethrow: true,
    });
    expect(fetchProductByDTagAndPubkeyMock).toHaveBeenCalledWith(
      "listing-d",
      "seller-pubkey",
      { rethrow: true }
    );
    expect(validateDiscountCodeMock).toHaveBeenCalledWith(
      "SAVE10",
      "seller-pubkey",
      { rethrow: true }
    );
    expect(createMintQuoteBolt11Mock).toHaveBeenCalledWith(100);
    expect(mockCashuMint).toHaveBeenCalledWith(
      "https://mint.minibits.cash/Bitcoin"
    );
    expect(res.jsonBody).toMatchObject({
      request: "lnbc110",
      quote: "quote-110",
      amount: 100,
      mintUrl: "https://mint.minibits.cash/Bitcoin",
    });
  });

  it("rejects invalid listing selections before quote creation", async () => {
    const res = createResponse();

    await handler(
      createRequest({
        productId: "product-1",
        formType: "shipping",
        selectedBulkOption: 2,
      }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(400);
    expect(createMintQuoteBolt11Mock).not.toHaveBeenCalled();
  });

  it("prices the latest event for the listing d-tag", async () => {
    fetchProductByDTagAndPubkeyMock.mockResolvedValue({
      ...productEvent,
      id: "product-2",
      created_at: 2,
      tags: productEvent.tags.map((tag) =>
        tag[0] === "price" ? ["price", "200", "sats"] : tag
      ),
    });
    const res = createResponse();

    await handler(
      createRequest({
        productId: "product-1",
        formType: "shipping",
      }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(200);
    expect(createMintQuoteBolt11Mock).toHaveBeenCalledWith(210);
  });

  it("requires listing variant selections that affect the order", async () => {
    const productWithVolume = {
      ...productEvent,
      tags: [...productEvent.tags, ["volume", "1L", "150"]],
    };
    fetchProductByIdFromDbMock.mockResolvedValue(productWithVolume);
    fetchProductByDTagAndPubkeyMock.mockResolvedValue(productWithVolume);
    const res = createResponse();

    await handler(
      createRequest({
        productId: "product-1",
        formType: "shipping",
      }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toMatchObject({
      error: "Volume selection is required",
    });
    expect(createMintQuoteBolt11Mock).not.toHaveBeenCalled();
  });

  it("returns price without creating a quote in priceOnly mode", async () => {
    const res = createResponse();

    await handler(
      createRequest({
        productId: "product-1",
        formType: "shipping",
        priceOnly: true,
      }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toMatchObject({
      amount: 110,
      mintUrl: "https://mint.minibits.cash/Bitcoin",
    });
    expect(loadMintMock).not.toHaveBeenCalled();
    expect(createMintQuoteBolt11Mock).not.toHaveBeenCalled();
  });

  it("returns 404 when the listing does not exist", async () => {
    fetchProductByIdFromDbMock.mockResolvedValue(null);
    const res = createResponse();

    await handler(
      createRequest({ productId: "missing", formType: "shipping" }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(404);
    expect(res.jsonBody).toMatchObject({ error: "Product not found" });
  });

  it("returns 503 when the database is unavailable instead of 404", async () => {
    fetchProductByIdFromDbMock.mockRejectedValue(
      new DatabaseUnavailableError()
    );
    const res = createResponse();

    await handler(
      createRequest({ productId: "product-1", formType: "shipping" }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(503);
    expect(createMintQuoteBolt11Mock).not.toHaveBeenCalled();
  });

  it("returns 502 when the mint operation fails", async () => {
    createMintQuoteBolt11Mock.mockRejectedValue(new Error("mint exploded"));
    const res = createResponse();

    await handler(
      createRequest({ productId: "product-1", formType: "shipping" }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(502);
    expect(JSON.stringify(res.jsonBody)).not.toContain("mint exploded");
  });

  it("returns a generic 500 without leaking internal error details", async () => {
    fetchProductByIdFromDbMock.mockRejectedValue(
      new Error("connection string postgres://secret")
    );
    const res = createResponse();

    await handler(
      createRequest({ productId: "product-1", formType: "shipping" }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody).toEqual({ error: "Failed to create invoice" });
    expect(JSON.stringify(res.jsonBody)).not.toContain("postgres://");
  });

  it("ignores buyer-supplied mint URLs and uses the trusted server mint", async () => {
    const res = createResponse();

    await handler(
      createRequest({
        productId: "product-1",
        mintUrl: "https://buyer-controlled.example",
        formType: "shipping",
      }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(200);
    expect(mockCashuMint).toHaveBeenCalledWith(
      "https://mint.minibits.cash/Bitcoin"
    );
    expect(res.jsonBody).toMatchObject({
      mintUrl: "https://mint.minibits.cash/Bitcoin",
    });
  });
});
