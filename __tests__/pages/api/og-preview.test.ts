import type { NextApiRequest, NextApiResponse } from "next";

const lookupMock = jest.fn();

jest.mock("dns/promises", () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}));

import handler from "@/pages/api/og-preview";
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
    setHeader(key: string, value: string) {
      this.headers[key] = value;
      return this;
    },
  };
}

function createRequest(url: string): NextApiRequest {
  return {
    method: "GET",
    query: { url },
    headers: {},
    socket: { remoteAddress: "203.0.113.10" },
  } as unknown as NextApiRequest;
}

describe("/api/og-preview", () => {
  beforeEach(() => {
    __resetRateLimitBuckets();
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([{ family: 4, address: "93.184.216.34" }]);
    global.fetch = jest.fn();
  });

  it("falls back to the fetched URL when og:url uses a script scheme", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-type" ? "text/html" : null,
      },
      text: async () => `
        <html>
          <head>
            <meta property="og:title" content="Order receipt">
            <meta property="og:url" content="javascript:alert(1)">
          </head>
        </html>
      `,
    });

    const res = createResponse();
    await handler(
      createRequest("https://attacker.example/order"),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({
      title: "Order receipt",
      url: "https://attacker.example/order",
    });
  });

  it("resolves safe relative og:url values against the fetched page", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-type" ? "text/html" : null,
      },
      text: async () => `
        <html>
          <head>
            <meta property="og:title" content="Order receipt">
            <meta property="og:url" content="/orders/123">
          </head>
        </html>
      `,
    });

    const res = createResponse();
    await handler(
      createRequest("https://seller.example/listing"),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({
      title: "Order receipt",
      url: "https://seller.example/orders/123",
    });
  });
});
