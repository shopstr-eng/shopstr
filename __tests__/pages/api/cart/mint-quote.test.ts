import type { NextApiRequest, NextApiResponse } from "next";

const fetchProductByIdFromDbMock = jest.fn();
const fetchProductByDTagAndPubkeyMock = jest.fn();
const fetchAllProfilesFromDbMock = jest.fn();
const validateDiscountCodeMock = jest.fn();
const createMintQuoteBolt11Mock = jest.fn();
const loadMintMock = jest.fn();
const getSatoshiValueMock = jest.fn();
var mockCashuMint: jest.Mock;

jest.mock("@/utils/db/db-service", () => ({
  fetchProductByDTagAndPubkey: (...args: unknown[]) =>
    fetchProductByDTagAndPubkeyMock(...args),
  fetchProductByIdFromDb: (...args: unknown[]) =>
    fetchProductByIdFromDbMock(...args),
  fetchAllProfilesFromDb: (...args: unknown[]) =>
    fetchAllProfilesFromDbMock(...args),
  validateDiscountCode: (...args: unknown[]) =>
    validateDiscountCodeMock(...args),
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
    })),
  };
});

import handler from "@/pages/api/cart/mint-quote";
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
    socket: { remoteAddress: "8.8.4.4" },
    body,
  } as NextApiRequest;
}

function productEvent(overrides: Partial<{ tags: string[][] }> = {}) {
  return {
    id: "product-1",
    pubkey: "seller-pubkey",
    created_at: 1,
    kind: 30402,
    content: "",
    sig: "sig",
    tags: overrides.tags ?? [
      ["title", "Cart listing"],
      ["d", "cart-listing"],
      ["price", "100", "sats"],
      ["shipping", "Added Cost", "10", "sats"],
    ],
  };
}

describe("/api/cart/mint-quote", () => {
  beforeEach(() => {
    fetchProductByIdFromDbMock.mockReset();
    fetchProductByDTagAndPubkeyMock.mockReset();
    fetchAllProfilesFromDbMock.mockReset();
    validateDiscountCodeMock.mockReset();
    createMintQuoteBolt11Mock.mockReset();
    loadMintMock.mockReset();
    getSatoshiValueMock.mockReset();
    mockCashuMint.mockClear();
    __resetRateLimitBuckets();

    fetchProductByIdFromDbMock.mockResolvedValue(productEvent());
    fetchProductByDTagAndPubkeyMock.mockResolvedValue(productEvent());
    fetchAllProfilesFromDbMock.mockResolvedValue([]);
    validateDiscountCodeMock.mockResolvedValue({
      valid: true,
      discount_percentage: 10,
    });
    createMintQuoteBolt11Mock.mockResolvedValue({
      request: "lnbc200",
      quote: "quote-200",
    });
    loadMintMock.mockResolvedValue(undefined);
  });

  it("recomputes cart totals server-side before creating a mint quote", async () => {
    const res = createResponse();

    await handler(
      createRequest({
        items: [{ productId: "product-1", quantity: 2 }],
        formType: "shipping",
        discountCodes: { "seller-pubkey": "SAVE10" },
      }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(200);
    expect(validateDiscountCodeMock).toHaveBeenCalledWith(
      "SAVE10",
      "seller-pubkey"
    );
    expect(createMintQuoteBolt11Mock).toHaveBeenCalledWith(200);
    expect(mockCashuMint).toHaveBeenCalledWith(
      "https://mint.minibits.cash/Bitcoin"
    );
    expect(res.jsonBody).toMatchObject({
      request: "lnbc200",
      quote: "quote-200",
      amount: 200,
      mintUrl: "https://mint.minibits.cash/Bitcoin",
      pricing: {
        total: 200,
        productTotalsInSats: { "product-1": 200 },
      },
    });
  });

  it("waives shipping when the server-side seller threshold is met", async () => {
    fetchAllProfilesFromDbMock.mockResolvedValue([
      {
        id: "shop-profile",
        pubkey: "seller-pubkey",
        created_at: 2,
        kind: 30019,
        tags: [],
        content: JSON.stringify({
          name: "Seller",
          freeShippingThreshold: 150,
        }),
        sig: "sig",
      },
    ]);
    const res = createResponse();

    await handler(
      createRequest({
        items: [{ productId: "product-1", quantity: 2 }],
        formType: "shipping",
      }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(200);
    expect(createMintQuoteBolt11Mock).toHaveBeenCalledWith(200);
    expect(res.jsonBody).toMatchObject({
      pricing: {
        shippingCost: 0,
        total: 200,
      },
    });
  });

  it("converts non-sat cart prices and shipping before quote creation", async () => {
    fetchProductByIdFromDbMock.mockResolvedValue(
      productEvent({
        tags: [
          ["title", "USD cart listing"],
          ["d", "usd-cart-listing"],
          ["price", "5", "USD"],
          ["shipping", "Added Cost", "1", "USD"],
        ],
      })
    );
    fetchProductByDTagAndPubkeyMock.mockResolvedValue(
      productEvent({
        tags: [
          ["title", "USD cart listing"],
          ["d", "usd-cart-listing"],
          ["price", "5", "USD"],
          ["shipping", "Added Cost", "1", "USD"],
        ],
      })
    );
    getSatoshiValueMock.mockImplementation(({ amount }) => amount * 100);
    const res = createResponse();

    await handler(
      createRequest({
        items: [{ productId: "product-1", quantity: 1 }],
        formType: "shipping",
      }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(200);
    expect(createMintQuoteBolt11Mock).toHaveBeenCalledWith(600);
  });

  it("rejects invalid cart selections before quote creation", async () => {
    fetchProductByIdFromDbMock.mockResolvedValue(
      productEvent({
        tags: [
          ["title", "Sized cart listing"],
          ["d", "sized-cart-listing"],
          ["price", "100", "sats"],
          ["size", "M", "1"],
        ],
      })
    );
    fetchProductByDTagAndPubkeyMock.mockResolvedValue(
      productEvent({
        tags: [
          ["title", "Sized cart listing"],
          ["d", "sized-cart-listing"],
          ["price", "100", "sats"],
          ["size", "M", "1"],
        ],
      })
    );
    const res = createResponse();

    await handler(
      createRequest({
        items: [{ productId: "product-1", quantity: 1, selectedSize: "XL" }],
        formType: "contact",
      }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(400);
    expect(createMintQuoteBolt11Mock).not.toHaveBeenCalled();
  });

  it("rejects invalid cart order types before fetching products", async () => {
    const res = createResponse();

    await handler(
      createRequest({
        items: [{ productId: "product-1", quantity: 1 }],
        formType: "not-a-real-order-type",
      }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toMatchObject({
      error: "Invalid cart order type",
    });
    expect(fetchProductByIdFromDbMock).not.toHaveBeenCalled();
    expect(createMintQuoteBolt11Mock).not.toHaveBeenCalled();
  });

  it("rejects malformed discount code maps before quote creation", async () => {
    const res = createResponse();

    await handler(
      createRequest({
        items: [{ productId: "product-1", quantity: 1 }],
        formType: "shipping",
        discountCodes: { "seller-pubkey": 123 },
      }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toMatchObject({
      error: "Discount codes are invalid",
    });
    expect(createMintQuoteBolt11Mock).not.toHaveBeenCalled();
  });
});
