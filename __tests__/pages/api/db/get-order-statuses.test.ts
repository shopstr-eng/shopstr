const getOrderStatusesMock = jest.fn();
const getOrderParticipantsForOrdersMock = jest.fn();
const verifyNip98RequestMock = jest.fn();

jest.mock("@/utils/db/db-service", () => ({
  getOrderStatuses: (...args: unknown[]) => getOrderStatusesMock(...args),
  getOrderParticipantsForOrders: (...args: unknown[]) =>
    getOrderParticipantsForOrdersMock(...args),
}));

jest.mock("@/utils/nostr/nip98-auth", () => ({
  verifyNip98Request: (...args: unknown[]) => verifyNip98RequestMock(...args),
}));

import handler from "@/pages/api/db/get-order-statuses";

const CALLER = "1".repeat(64);
const OTHER = "2".repeat(64);

const getExpectedMaxOrderIds = () => {
  const configured = Number.parseInt(
    process.env.MAX_ORDER_IDS_PER_REQUEST || "",
    10
  );
  return Number.isFinite(configured) && configured > 0 ? configured : 200;
};

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

describe("/api/db/get-order-statuses", () => {
  beforeEach(() => {
    getOrderStatusesMock.mockReset();
    getOrderParticipantsForOrdersMock.mockReset();
    verifyNip98RequestMock.mockReset();
    verifyNip98RequestMock.mockResolvedValue({ ok: true, pubkey: CALLER });
    getOrderParticipantsForOrdersMock.mockResolvedValue(new Map());
  });

  it("rejects unauthenticated requests", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: false,
      error: "Missing NIP-98 authorization header",
    });
    const req = createRequest({ orderIds: ["order-1"] });
    const res = createResponse();

    await handler(req, res as any);

    expect(verifyNip98RequestMock).toHaveBeenCalledWith(req, "POST");
    expect(res.statusCode).toBe(401);
    expect(getOrderStatusesMock).not.toHaveBeenCalled();
  });

  it("rejects non-string orderIds payloads", async () => {
    const res = createResponse();

    await handler(createRequest({ orderIds: ["order-1", 123] }), res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: "Invalid orderIds. Expected a string or array of strings.",
    });
  });

  it("rejects requests with too many order IDs", async () => {
    const maxOrderIds = getExpectedMaxOrderIds();
    const res = createResponse();

    await handler(
      createRequest({
        orderIds: Array.from(
          { length: maxOrderIds + 1 },
          (_, index) => `order-${index}`
        ),
      }),
      res as any
    );

    expect(res.statusCode).toBe(413);
    expect(res.jsonBody).toEqual({
      error: `Too many order IDs. Maximum allowed is ${maxOrderIds}.`,
    });
  });

  it("returns empty statuses when orderIds is omitted", async () => {
    const res = createResponse();

    await handler(createRequest({}), res as any);

    expect(getOrderStatusesMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ statuses: {} });
  });

  it("dedupes IDs and resolves participants with the legacy fallback", async () => {
    getOrderParticipantsForOrdersMock.mockResolvedValue(
      new Map([
        [
          "order-1",
          {
            buyerPubkey: CALLER,
            sellerPubkey: OTHER,
            source: "order_participants",
          },
        ],
        [
          "order-2",
          {
            buyerPubkey: OTHER,
            sellerPubkey: CALLER,
            source: "legacy_message_tags",
          },
        ],
      ])
    );
    getOrderStatusesMock.mockResolvedValue({ "order-1": "shipped" });
    const res = createResponse();

    await handler(
      createRequest({ orderIds: ["order-1", "order-1", " order-2 "] }),
      res as any
    );

    expect(getOrderParticipantsForOrdersMock).toHaveBeenCalledWith(
      ["order-1", "order-2"],
      { includeLegacy: true }
    );
    expect(getOrderStatusesMock).toHaveBeenCalledWith(["order-1", "order-2"]);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ statuses: { "order-1": "shipped" } });
  });

  it("only returns statuses for orders the caller is a party to", async () => {
    getOrderParticipantsForOrdersMock.mockResolvedValue(
      new Map([
        [
          "mine",
          {
            buyerPubkey: CALLER,
            sellerPubkey: OTHER,
            source: "order_participants",
          },
        ],
        [
          "theirs",
          {
            buyerPubkey: OTHER,
            sellerPubkey: "3".repeat(64),
            source: "order_participants",
          },
        ],
      ])
    );
    getOrderStatusesMock.mockResolvedValue({ mine: "confirmed" });
    const res = createResponse();

    await handler(
      createRequest({ orderIds: ["mine", "theirs", "unknown"] }),
      res as any
    );

    expect(getOrderStatusesMock).toHaveBeenCalledWith(["mine"]);
    expect(res.jsonBody).toEqual({ statuses: { mine: "confirmed" } });
  });

  it("returns 500 when participants cannot be resolved", async () => {
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
    expect(getOrderStatusesMock).not.toHaveBeenCalled();
  });
});
