const getOrderParticipantsForOrdersMock = jest.fn();
const verifyNip98RequestMock = jest.fn();

jest.mock("@/utils/db/db-service", () => ({
  getOrderParticipantsForOrders: (...args: unknown[]) =>
    getOrderParticipantsForOrdersMock(...args),
}));

jest.mock("@/utils/nostr/nip98-auth", () => ({
  verifyNip98Request: (...args: unknown[]) => verifyNip98RequestMock(...args),
}));

import handler from "@/pages/api/db/get-order-participants";

const CALLER = "1".repeat(64);
const OTHER = "2".repeat(64);
const THIRD = "3".repeat(64);

function createResponse() {
  return {
    statusCode: 200,
    jsonBody: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value;
      return this;
    },
    json(payload: unknown) {
      this.jsonBody = payload;
      return this;
    },
  };
}

function createRequest(body: unknown) {
  return { method: "POST", headers: {}, body } as any;
}

describe("/api/db/get-order-participants", () => {
  beforeEach(() => {
    getOrderParticipantsForOrdersMock.mockReset();
    verifyNip98RequestMock.mockReset();
    verifyNip98RequestMock.mockResolvedValue({ ok: true, pubkey: CALLER });
    getOrderParticipantsForOrdersMock.mockResolvedValue(new Map());
  });

  it("rejects unsupported methods", async () => {
    const res = createResponse();
    await handler({ method: "GET", headers: {} } as any, res as any);

    expect(res.statusCode).toBe(405);
  });

  it("requires a NIP-98 signature over the request body", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: false,
      error: "Authorization payload mismatch",
    });
    const req = createRequest({ orderIds: ["order-1"] });
    const res = createResponse();

    await handler(req, res as any);

    expect(verifyNip98RequestMock).toHaveBeenCalledWith(req, "POST", req.body);
    expect(res.statusCode).toBe(401);
    expect(getOrderParticipantsForOrdersMock).not.toHaveBeenCalled();
  });

  it("rejects invalid order id lists", async () => {
    const res = createResponse();
    await handler(createRequest({ orderIds: [42] }), res as any);

    expect(res.statusCode).toBe(400);
    expect(getOrderParticipantsForOrdersMock).not.toHaveBeenCalled();
  });

  it("returns only authoritative participants of the caller's own orders", async () => {
    getOrderParticipantsForOrdersMock.mockResolvedValue(
      new Map([
        [
          "as-buyer",
          {
            buyerPubkey: CALLER,
            sellerPubkey: OTHER,
            source: "order_participants",
          },
        ],
        [
          "as-seller",
          { buyerPubkey: OTHER, sellerPubkey: CALLER, source: "mcp_orders" },
        ],
        [
          "not-mine",
          {
            buyerPubkey: OTHER,
            sellerPubkey: THIRD,
            source: "order_participants",
          },
        ],
      ])
    );
    const res = createResponse();

    await handler(
      createRequest({
        orderIds: ["as-buyer", "as-seller", "not-mine", "unknown"],
      }),
      res as any
    );

    expect(getOrderParticipantsForOrdersMock).toHaveBeenCalledWith(
      ["as-buyer", "as-seller", "not-mine", "unknown"],
      { includeLegacy: false }
    );
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({
      participants: {
        "as-buyer": {
          buyerPubkey: CALLER,
          sellerPubkey: OTHER,
          source: "order_participants",
        },
        "as-seller": {
          buyerPubkey: OTHER,
          sellerPubkey: CALLER,
          source: "mcp_orders",
        },
      },
    });
  });

  it("returns 500 when the database fails", async () => {
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    getOrderParticipantsForOrdersMock.mockRejectedValue(new Error("db down"));
    const res = createResponse();

    try {
      await handler(createRequest({ orderIds: ["order-1"] }), res as any);
    } finally {
      errorSpy.mockRestore();
    }

    expect(res.statusCode).toBe(500);
  });
});
