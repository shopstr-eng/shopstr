import type { NextApiRequest, NextApiResponse } from "next";

const fetchProductByIdFromDbMock = jest.fn();
const fetchProductByDTagAndPubkeyMock = jest.fn();
const validateDiscountCodeMock = jest.fn();
const createMintQuoteBolt11Mock = jest.fn();
const loadMintMock = jest.fn();
const getSatoshiValueMock = jest.fn();

jest.mock("@/utils/db/db-service", () => ({
  fetchProductByDTagAndPubkey: (...args: unknown[]) =>
    fetchProductByDTagAndPubkeyMock(...args),
  fetchProductByIdFromDb: (...args: unknown[]) =>
    fetchProductByIdFromDbMock(...args),
  validateDiscountCode: (...args: unknown[]) =>
    validateDiscountCodeMock(...args),
}));

jest.mock("@getalby/lightning-tools", () => ({
  getSatoshiValue: (...args: unknown[]) => getSatoshiValueMock(...args),
}));

jest.mock("@cashu/cashu-ts", () => ({
  Mint: jest.fn().mockImplementation((url: string) => ({ url })),
  Wallet: jest.fn().mockImplementation(() => ({
    loadMint: (...args: unknown[]) => loadMintMock(...args),
    createMintQuoteBolt11: (...args: unknown[]) =>
      createMintQuoteBolt11Mock(...args),
  })),
}));

import handler from "@/pages/api/listing/mint-quote";
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
        mintUrl: "https://1.1.1.1",
        formType: "shipping",
        discountCode: "SAVE10",
      }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(200);
    expect(fetchProductByIdFromDbMock).toHaveBeenCalledWith("product-1");
    expect(fetchProductByDTagAndPubkeyMock).toHaveBeenCalledWith(
      "listing-d",
      "seller-pubkey"
    );
    expect(validateDiscountCodeMock).toHaveBeenCalledWith(
      "SAVE10",
      "seller-pubkey"
    );
    expect(createMintQuoteBolt11Mock).toHaveBeenCalledWith(100);
    expect(res.jsonBody).toMatchObject({
      request: "lnbc110",
      quote: "quote-110",
      amount: 100,
    });
  });

  it("rejects invalid listing selections before quote creation", async () => {
    const res = createResponse();

    await handler(
      createRequest({
        productId: "product-1",
        mintUrl: "https://1.1.1.1",
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
        mintUrl: "https://1.1.1.1",
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
        mintUrl: "https://1.1.1.1",
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

  it("rejects private mint URLs before contacting the mint", async () => {
    const res = createResponse();

    await handler(
      createRequest({
        productId: "product-1",
        mintUrl: "http://127.0.0.1:3338",
        formType: "shipping",
      }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toMatchObject({ error: "Invalid mint URL" });
    expect(loadMintMock).not.toHaveBeenCalled();
    expect(createMintQuoteBolt11Mock).not.toHaveBeenCalled();
  });
});
