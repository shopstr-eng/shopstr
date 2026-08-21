import type { NextApiRequest, NextApiResponse } from "next";

const fetchProductByIdFromDbMock = jest.fn();
const fetchProductByDTagAndPubkeyMock = jest.fn();
const fetchShopProfileByPubkeyFromDbMock = jest.fn();
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
    fetchShopProfileByPubkeyFromDb: (...args: unknown[]) =>
      fetchShopProfileByPubkeyFromDbMock(...args),
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

import handler from "@/pages/api/cart/mint-quote";
import { DatabaseUnavailableError } from "@/utils/db/db-service";
import { __resetRateLimitBuckets } from "@/utils/rate-limit";

function createResponse() {
  return {
    statusCode: 200,
    jsonBody: undefined as any,
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

function makeProductEvent({
  id,
  pubkey,
  dTag,
  price,
  shippingType,
  shippingCost,
  extraTags = [],
}: {
  id: string;
  pubkey: string;
  dTag: string;
  price: number;
  shippingType: string;
  shippingCost?: number;
  extraTags?: string[][];
}) {
  const shippingTag =
    shippingCost !== undefined
      ? ["shipping", shippingType, String(shippingCost), "sats"]
      : ["shipping", shippingType, "0", "sats"];
  return {
    id,
    pubkey,
    created_at: 1,
    kind: 30402,
    content: "",
    sig: "sig",
    tags: [
      ["title", `Product ${id}`],
      ["d", dTag],
      ["price", String(price), "sats"],
      shippingTag,
      ...extraTags,
    ],
  };
}

const productA = makeProductEvent({
  id: "prod-a",
  pubkey: "seller-1",
  dTag: "d-a",
  price: 100,
  shippingType: "Added Cost",
  shippingCost: 10,
});
const productB = makeProductEvent({
  id: "prod-b",
  pubkey: "seller-1",
  dTag: "d-b",
  price: 200,
  shippingType: "Free",
});
const productC = makeProductEvent({
  id: "prod-c",
  pubkey: "seller-2",
  dTag: "d-c",
  price: 50,
  shippingType: "Free/Pickup",
});

const eventsById: Record<string, unknown> = {
  "prod-a": productA,
  "prod-b": productB,
  "prod-c": productC,
};
const eventsByDTag: Record<string, unknown> = {
  "d-a": productA,
  "d-b": productB,
  "d-c": productC,
};

describe("/api/cart/mint-quote", () => {
  beforeEach(() => {
    fetchProductByIdFromDbMock.mockReset();
    fetchProductByDTagAndPubkeyMock.mockReset();
    fetchShopProfileByPubkeyFromDbMock.mockReset();
    validateDiscountCodeMock.mockReset();
    createMintQuoteBolt11Mock.mockReset();
    loadMintMock.mockReset();
    getSatoshiValueMock.mockReset();
    mockCashuMint.mockClear();
    __resetRateLimitBuckets();

    fetchProductByIdFromDbMock.mockImplementation(async (id: string) =>
      eventsById[id] ? eventsById[id] : null
    );
    fetchProductByDTagAndPubkeyMock.mockImplementation(
      async (dTag: string) => eventsByDTag[dTag] ?? null
    );
    fetchShopProfileByPubkeyFromDbMock.mockResolvedValue(null);
    validateDiscountCodeMock.mockResolvedValue({ valid: false });
    createMintQuoteBolt11Mock.mockResolvedValue({
      request: "lnbc-cart",
      quote: "quote-cart",
    });
    loadMintMock.mockResolvedValue(undefined);
  });

  it("prices a multi-item cart server-side with shipping and a per-product breakdown", async () => {
    const res = createResponse();

    await handler(
      createRequest({
        items: [
          { productId: "prod-a", quantity: 2 },
          { productId: "prod-b", quantity: 1 },
        ],
        formType: "shipping",
      }),
      res as unknown as NextApiResponse
    );

    // prod-a: 100*2 + ceil(10*2) = 220; prod-b: 200 + 0 = 200
    expect(res.statusCode).toBe(200);
    expect(createMintQuoteBolt11Mock).toHaveBeenCalledWith(420);
    expect(res.jsonBody).toMatchObject({
      request: "lnbc-cart",
      quote: "quote-cart",
      amount: 420,
      mintUrl: "https://mint.minibits.cash/Bitcoin",
      breakdown: { "prod-a": 220, "prod-b": 200 },
    });
    const breakdownSum = Object.values(
      res.jsonBody.breakdown as Record<string, number>
    ).reduce((a, b) => a + b, 0);
    expect(breakdownSum).toBe(res.jsonBody.amount);
  });

  it("waives shipping when a seller's free-shipping threshold is met", async () => {
    fetchShopProfileByPubkeyFromDbMock.mockImplementation(
      async (pubkey: string) =>
        pubkey === "seller-1"
          ? {
              id: "profile-1",
              pubkey,
              created_at: 1,
              kind: 30019,
              tags: [],
              sig: "sig",
              content: JSON.stringify({
                name: "Seller One",
                freeShippingThreshold: 250,
                freeShippingCurrency: "SATS",
              }),
            }
          : null
    );
    const res = createResponse();

    await handler(
      createRequest({
        items: [
          { productId: "prod-a", quantity: 2 },
          { productId: "prod-b", quantity: 1 },
        ],
        formType: "shipping",
      }),
      res as unknown as NextApiResponse
    );

    // seller-1 subtotal 400 >= 250, so prod-a shipping is waived
    expect(res.statusCode).toBe(200);
    expect(createMintQuoteBolt11Mock).toHaveBeenCalledWith(400);
    expect(res.jsonBody.breakdown).toEqual({ "prod-a": 200, "prod-b": 200 });
  });

  it("applies validated discount codes per seller with cart rounding", async () => {
    validateDiscountCodeMock.mockResolvedValue({
      valid: true,
      discount_percentage: 10,
    });
    const res = createResponse();

    await handler(
      createRequest({
        items: [{ productId: "prod-a", quantity: 1 }],
        formType: "shipping",
        discountCodes: { "seller-1": "SAVE10" },
      }),
      res as unknown as NextApiResponse
    );

    // ceil(100 * 0.9) = 90 + shipping 10 = 100
    expect(res.statusCode).toBe(200);
    expect(validateDiscountCodeMock).toHaveBeenCalledWith(
      "SAVE10",
      "seller-1",
      { rethrow: true }
    );
    expect(createMintQuoteBolt11Mock).toHaveBeenCalledWith(100);
    expect(res.jsonBody.appliedDiscounts).toEqual({ "seller-1": 10 });
  });

  it("rejects invalid discount codes", async () => {
    validateDiscountCodeMock.mockResolvedValue({ valid: false });
    const res = createResponse();

    await handler(
      createRequest({
        items: [{ productId: "prod-a", quantity: 1 }],
        formType: "shipping",
        discountCodes: { "seller-1": "BOGUS" },
      }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(400);
    expect(createMintQuoteBolt11Mock).not.toHaveBeenCalled();
  });

  it("adds no shipping for contact orders", async () => {
    const res = createResponse();

    await handler(
      createRequest({
        items: [{ productId: "prod-a", quantity: 2 }],
        formType: "contact",
      }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(200);
    expect(createMintQuoteBolt11Mock).toHaveBeenCalledWith(200);
  });

  it("ships Free/Pickup products when the buyer prefers shipping in a mixed cart", async () => {
    const res = createResponse();

    await handler(
      createRequest({
        items: [
          { productId: "prod-a", quantity: 1 },
          { productId: "prod-c", quantity: 1 },
        ],
        formType: "combined",
        shippingPickupPreference: "shipping",
      }),
      res as unknown as NextApiResponse
    );

    // prod-a ships (110), prod-c Free/Pickup ships with 0 cost (50)
    expect(res.statusCode).toBe(200);
    expect(createMintQuoteBolt11Mock).toHaveBeenCalledWith(160);
    expect(res.jsonBody.breakdown).toEqual({ "prod-a": 110, "prod-c": 50 });
  });

  it("reprices from the latest event version of each listing", async () => {
    fetchProductByDTagAndPubkeyMock.mockImplementation(async (dTag: string) =>
      dTag === "d-a"
        ? {
            ...productA,
            id: "prod-a-v2",
            created_at: 2,
            tags: productA.tags.map((tag) =>
              tag[0] === "price" ? ["price", "150", "sats"] : tag
            ),
          }
        : (eventsByDTag[dTag] ?? null)
    );
    const res = createResponse();

    await handler(
      createRequest({
        items: [{ productId: "prod-a", quantity: 1 }],
        formType: "shipping",
      }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(200);
    expect(createMintQuoteBolt11Mock).toHaveBeenCalledWith(160);
  });

  it("rejects empty carts, bad quantities, and duplicates", async () => {
    for (const body of [
      { items: [], formType: "shipping" },
      {
        items: [{ productId: "prod-a", quantity: 0 }],
        formType: "shipping",
      },
      {
        items: [{ productId: "prod-a", quantity: 1.5 }],
        formType: "shipping",
      },
      {
        items: [
          { productId: "prod-a", quantity: 1 },
          { productId: "prod-a", quantity: 2 },
        ],
        formType: "shipping",
      },
      {
        items: [{ productId: "prod-a", quantity: 1 }],
        formType: "not-a-form-type",
      },
    ]) {
      const res = createResponse();
      await handler(createRequest(body), res as unknown as NextApiResponse);
      expect(res.statusCode).toBe(400);
    }
    expect(createMintQuoteBolt11Mock).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown products and 503 when the database is down", async () => {
    const notFound = createResponse();
    await handler(
      createRequest({
        items: [{ productId: "missing", quantity: 1 }],
        formType: "shipping",
      }),
      notFound as unknown as NextApiResponse
    );
    expect(notFound.statusCode).toBe(404);

    fetchProductByIdFromDbMock.mockRejectedValue(
      new DatabaseUnavailableError()
    );
    const dbDown = createResponse();
    await handler(
      createRequest({
        items: [{ productId: "prod-a", quantity: 1 }],
        formType: "shipping",
      }),
      dbDown as unknown as NextApiResponse
    );
    expect(dbDown.statusCode).toBe(503);
  });

  it("returns price and breakdown without creating a quote in priceOnly mode", async () => {
    const res = createResponse();

    await handler(
      createRequest({
        items: [{ productId: "prod-a", quantity: 1 }],
        formType: "shipping",
        priceOnly: true,
      }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toMatchObject({
      amount: 110,
      mintUrl: "https://mint.minibits.cash/Bitcoin",
      breakdown: { "prod-a": 110 },
    });
    expect(loadMintMock).not.toHaveBeenCalled();
    expect(createMintQuoteBolt11Mock).not.toHaveBeenCalled();
  });
});
