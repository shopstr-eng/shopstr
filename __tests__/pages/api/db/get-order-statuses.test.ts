import type { NextApiRequest, NextApiResponse } from "next";
import { IncomingMessage, ServerResponse } from "http";
import { Socket } from "net";

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

type MockResponse = NextApiResponse & {
  jsonBody: unknown;
  headers: Record<string, string>;
};

function createResponse(): MockResponse {
  const response = new ServerResponse(
    new IncomingMessage(new Socket())
  ) as MockResponse;
  response.statusCode = 200;
  response.jsonBody = undefined;
  response.headers = {};
  response.status = function status(code: number) {
    this.statusCode = code;
    return this;
  };
  response.setHeader = function setHeader(key: string, value: number | string) {
    this.headers[key] = String(value);
    return this;
  };
  response.json = function json(payload: unknown) {
    this.jsonBody = payload;
    return this;
  };
  return response;
}

function createRequest(body: unknown): NextApiRequest {
  const request = new IncomingMessage(new Socket()) as NextApiRequest;
  request.method = "POST";
  request.headers = {};
  request.body = body;
  return request;
}

describe("/api/db/get-order-statuses", () => {
  beforeEach(() => {
    getOrderStatusesMock.mockReset();
  });

  it("rejects non-string orderIds payloads", async () => {
    const req = createRequest({ orderIds: ["order-1", 123] });
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: "Invalid orderIds. Expected a string or array of strings.",
    });
  });

  it("rejects requests with too many order IDs", async () => {
    const maxOrderIds = getExpectedMaxOrderIds();
    const req = createRequest({
      orderIds: Array.from(
        { length: maxOrderIds + 1 },
        (_, index) => `order-${index}`
      ),
    });
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(413);
    expect(res.jsonBody).toEqual({
      error: `Too many order IDs. Maximum allowed is ${maxOrderIds}.`,
    });
  });

  it("returns empty statuses when orderIds is omitted", async () => {
    const req = createRequest({});
    const res = createResponse();

    await handler(req, res);

    expect(getOrderStatusesMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ statuses: {} });
  });

  it("dedupes IDs before querying", async () => {
    getOrderStatusesMock.mockResolvedValue({ "order-1": "shipped" });

    const req = createRequest({
      orderIds: ["order-1", "order-1", " order-2 "],
    });
    const res = createResponse();

    await handler(req, res);

    expect(getOrderStatusesMock).toHaveBeenCalledWith(["order-1", "order-2"]);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ statuses: { "order-1": "shipped" } });
  });
});
