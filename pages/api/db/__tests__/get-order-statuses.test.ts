const getOrderStatusesMock = jest.fn();

jest.mock("@/utils/db/db-service", () => ({
  getOrderStatuses: (...args: unknown[]) => getOrderStatusesMock(...args),
}));

import handler from "@/pages/api/db/get-order-statuses";

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

describe("/api/db/get-order-statuses", () => {
  beforeEach(() => {
    getOrderStatusesMock.mockReset();
  });

  it("rejects non-string orderIds payloads", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: { orderIds: ["order-1", 123] },
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: "Invalid orderIds. Expected a string or array of strings.",
    });
  });

  it("rejects requests with too many order IDs", async () => {
    const maxOrderIds = getExpectedMaxOrderIds();
    const req = {
      method: "POST",
      headers: {},
      body: {
        orderIds: Array.from(
          { length: maxOrderIds + 1 },
          (_, index) => `order-${index}`
        ),
      },
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(res.statusCode).toBe(413);
    expect(res.jsonBody).toEqual({
      error: `Too many order IDs. Maximum allowed is ${maxOrderIds}.`,
    });
  });

  it("returns empty statuses when orderIds is omitted", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {},
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(getOrderStatusesMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ statuses: {} });
  });

  it("dedupes IDs before querying", async () => {
    getOrderStatusesMock.mockResolvedValue({ "order-1": "shipped" });

    const req = {
      method: "POST",
      headers: {},
      body: { orderIds: ["order-1", "order-1", " order-2 "] },
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(getOrderStatusesMock).toHaveBeenCalledWith(["order-1", "order-2"]);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ statuses: { "order-1": "shipped" } });
  });
});