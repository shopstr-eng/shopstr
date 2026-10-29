const applyRateLimitMock = jest.fn();
const verifyNip98RequestMock = jest.fn();
const fetchProductByDTagAndPubkeyMock = jest.fn();
const registerOrderParticipantsMock = jest.fn();
const verifyEventMock = jest.fn();

jest.mock("nostr-tools", () => ({
  ...jest.requireActual("nostr-tools"),
  verifyEvent: (...args: unknown[]) => verifyEventMock(...args),
}));

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));

jest.mock("@/utils/nostr/nip98-auth", () => ({
  verifyNip98Request: (...args: unknown[]) => verifyNip98RequestMock(...args),
}));

jest.mock("@/utils/db/db-service", () => ({
  fetchProductByDTagAndPubkey: (...args: unknown[]) =>
    fetchProductByDTagAndPubkeyMock(...args),
  registerOrderParticipants: (...args: unknown[]) =>
    registerOrderParticipantsMock(...args),
}));

import handler from "@/pages/api/db/register-order-participants";

const BUYER = "1".repeat(64);
const SELLER = "2".repeat(64);
const ORDER_ID = "7f0c1a52-3d4e-4b6f-8a9b-0c1d2e3f4a5b";
const PRODUCT_ADDRESS = `30402:${SELLER}:listing-1`;

const validBody = { orderId: ORDER_ID, productAddress: PRODUCT_ADDRESS };

const ZAPSNAG_NOTE = {
  id: "a".repeat(64),
  pubkey: SELLER,
  created_at: 1_700_000_000,
  kind: 1,
  tags: [["t", "zapsnag"]],
  content: "Flash sale price: 5000 sats #zapsnag",
  sig: "b".repeat(128),
};

function createResponse() {
  return {
    statusCode: 200,
    jsonBody: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.jsonBody = payload;
      return this;
    },
  };
}

function createRequest(body: unknown = validBody) {
  return {
    method: "POST",
    headers: { authorization: "Nostr signed-event" },
    body,
  } as any;
}

describe("/api/db/register-order-participants", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    applyRateLimitMock.mockReturnValue(true);
    verifyNip98RequestMock.mockResolvedValue({ ok: true, pubkey: BUYER });
    fetchProductByDTagAndPubkeyMock.mockResolvedValue({
      id: "product-1",
      pubkey: SELLER,
      kind: 30402,
      tags: [["d", "listing-1"]],
    });
    registerOrderParticipantsMock.mockResolvedValue("created");
    verifyEventMock.mockReturnValue(true);
  });

  it("rejects unsupported methods", async () => {
    const res = createResponse();
    await handler({ method: "GET" } as any, res as any);

    expect(res.statusCode).toBe(405);
    expect(registerOrderParticipantsMock).not.toHaveBeenCalled();
  });

  it("requires a NIP-98 signature over the request body", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: false,
      error: "Authorization payload mismatch",
    });
    const req = createRequest();
    const res = createResponse();

    await handler(req, res as any);

    expect(verifyNip98RequestMock).toHaveBeenCalledWith(req, "POST", req.body);
    expect(res.statusCode).toBe(401);
    expect(registerOrderParticipantsMock).not.toHaveBeenCalled();
  });

  it("registers the authenticated pubkey as buyer and the listing author as seller", async () => {
    const res = createResponse();
    await handler(
      createRequest({ ...validBody, buyerPubkey: "9".repeat(64) }),
      res as any
    );

    expect(fetchProductByDTagAndPubkeyMock).toHaveBeenCalledWith(
      "listing-1",
      SELLER,
      { rethrow: true }
    );
    expect(registerOrderParticipantsMock).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      buyerPubkey: BUYER,
      sellerPubkey: SELLER,
      productAddress: PRODUCT_ADDRESS,
    });
    expect(res.statusCode).toBe(201);
    expect(res.jsonBody).toEqual({
      success: true,
      orderId: ORDER_ID,
      buyerPubkey: BUYER,
      sellerPubkey: SELLER,
    });
  });

  it("keeps colons inside the d tag", async () => {
    const res = createResponse();
    await handler(
      createRequest({
        ...validBody,
        productAddress: `30402:${SELLER}:shop:listing:1`,
      }),
      res as any
    );

    expect(fetchProductByDTagAndPubkeyMock).toHaveBeenCalledWith(
      "shop:listing:1",
      SELLER,
      { rethrow: true }
    );
    expect(res.statusCode).toBe(201);
  });

  it("answers an identical retry with 200", async () => {
    registerOrderParticipantsMock.mockResolvedValue("existing");
    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(200);
  });

  it("answers a conflicting claim with 409", async () => {
    registerOrderParticipantsMock.mockResolvedValue("conflict");
    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(409);
  });

  it.each([
    ["a non-UUID order id", { orderId: "order-1" }],
    ["an MCP order id", { orderId: "mcp_1700000000000_deadbeef" }],
    ["an uppercase UUID", { orderId: ORDER_ID.toUpperCase() }],
    ["a missing product address", { productAddress: undefined }],
    [
      "an oversized product address",
      { productAddress: `30402:${SELLER}:${"d".repeat(600)}` },
    ],
  ])("rejects %s", async (_label, change) => {
    const res = createResponse();
    await handler(createRequest({ ...validBody, ...change }), res as any);

    expect(res.statusCode).toBe(400);
    expect(registerOrderParticipantsMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a non-listing kind", `1:${SELLER}:listing-1`],
    ["a malformed seller pubkey", "30402:not-a-pubkey:listing-1"],
    ["an uppercase seller pubkey", `30402:${"A".repeat(64)}:listing-1`],
    ["a missing d tag", `30402:${SELLER}:`],
  ])("rejects %s in the product address", async (_label, productAddress) => {
    const res = createResponse();
    await handler(createRequest({ ...validBody, productAddress }), res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ error: "Invalid product address" });
    expect(fetchProductByDTagAndPubkeyMock).not.toHaveBeenCalled();
  });

  it("rejects buyers registering an order for their own listing", async () => {
    verifyNip98RequestMock.mockResolvedValue({ ok: true, pubkey: SELLER });
    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(400);
    expect(registerOrderParticipantsMock).not.toHaveBeenCalled();
  });

  it("rejects listings that are not in the verified product cache", async () => {
    fetchProductByDTagAndPubkeyMock.mockResolvedValue(null);
    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(404);
    expect(registerOrderParticipantsMock).not.toHaveBeenCalled();
  });

  it("rejects a cached listing authored by someone else", async () => {
    fetchProductByDTagAndPubkeyMock.mockResolvedValue({
      id: "product-1",
      pubkey: "3".repeat(64),
      kind: 30402,
      tags: [["d", "listing-1"]],
    });
    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(404);
    expect(registerOrderParticipantsMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the database fails", async () => {
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    registerOrderParticipantsMock.mockRejectedValue(new Error("db down"));
    const res = createResponse();

    try {
      await handler(createRequest(), res as any);
    } finally {
      errorSpy.mockRestore();
    }

    expect(res.statusCode).toBe(500);
  });

  it("stops when rate limited", async () => {
    applyRateLimitMock.mockReturnValue(false);
    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(verifyNip98RequestMock).not.toHaveBeenCalled();
    expect(registerOrderParticipantsMock).not.toHaveBeenCalled();
  });

  describe("zapsnag notes", () => {
    const zapsnagBody = { orderId: ORDER_ID, productEvent: ZAPSNAG_NOTE };

    it("takes the seller from the signed note", async () => {
      const res = createResponse();
      await handler(createRequest(zapsnagBody), res as any);

      expect(verifyEventMock).toHaveBeenCalledWith(ZAPSNAG_NOTE);
      expect(fetchProductByDTagAndPubkeyMock).not.toHaveBeenCalled();
      expect(registerOrderParticipantsMock).toHaveBeenCalledWith({
        orderId: ORDER_ID,
        buyerPubkey: BUYER,
        sellerPubkey: SELLER,
        productAddress: ZAPSNAG_NOTE.id,
      });
      expect(res.statusCode).toBe(201);
    });

    it("rejects a note with an invalid signature", async () => {
      verifyEventMock.mockReturnValue(false);
      const res = createResponse();
      await handler(createRequest(zapsnagBody), res as any);

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toEqual({ error: "Invalid product event" });
      expect(registerOrderParticipantsMock).not.toHaveBeenCalled();
    });

    it.each([
      ["a non-note kind", { productEvent: { ...ZAPSNAG_NOTE, kind: 30402 } }],
      [
        "a malformed author",
        { productEvent: { ...ZAPSNAG_NOTE, pubkey: "not-a-pubkey" } },
      ],
      [
        "both a note and an address",
        { productEvent: ZAPSNAG_NOTE, productAddress: PRODUCT_ADDRESS },
      ],
    ])("rejects %s", async (_label, change) => {
      const res = createResponse();
      await handler(
        createRequest({ orderId: ORDER_ID, ...change }),
        res as any
      );

      expect(res.statusCode).toBe(400);
      expect(verifyEventMock).not.toHaveBeenCalled();
      expect(registerOrderParticipantsMock).not.toHaveBeenCalled();
    });

    it("rejects buyers ordering from their own note", async () => {
      verifyNip98RequestMock.mockResolvedValue({ ok: true, pubkey: SELLER });
      const res = createResponse();
      await handler(createRequest(zapsnagBody), res as any);

      expect(res.statusCode).toBe(400);
      expect(registerOrderParticipantsMock).not.toHaveBeenCalled();
    });
  });
});
