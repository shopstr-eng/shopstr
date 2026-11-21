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

function createRequest(
  url: string,
  remoteAddress = "203.0.113.10"
): NextApiRequest {
  return {
    method: "GET",
    query: { url },
    headers: {},
    socket: { remoteAddress },
  } as unknown as NextApiRequest;
}

function mockHtmlResponse(head: string) {
  return {
    ok: true,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? "text/html" : null,
    },
    text: async () => `<html><head>${head}</head></html>`,
  };
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
      createRequest("https://shopstr.store/order"),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({
      title: "Order receipt",
      url: "https://shopstr.store/order",
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
      createRequest("https://shopstr.store/listing"),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({
      title: "Order receipt",
      url: "https://shopstr.store/orders/123",
    });
  });

  it("resolves relative og:image paths against the fetched page", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockHtmlResponse(`
        <meta property="og:title" content="Handmade mug">
        <meta property="og:image" content="images/mug.png">
      `)
    );

    const res = createResponse();
    await handler(
      createRequest("https://shop.shopstr.store/listing/mug"),
      res as unknown as NextApiResponse
    );

    expect(res.jsonBody).toEqual({
      title: "Handmade mug",
      image: "https://shop.shopstr.store/listing/images/mug.png",
      url: "https://shop.shopstr.store/listing/mug",
    });
  });

  it("keeps root-relative and protocol-relative og:image values working", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        mockHtmlResponse(`
          <meta property="og:title" content="Root relative">
          <meta property="og:image" content="/static/card.png">
        `)
      )
      .mockResolvedValueOnce(
        mockHtmlResponse(`
          <meta property="og:title" content="Protocol relative">
          <meta property="og:image" content="//cdn.shopstr.store/card.png">
        `)
      );

    const rootRes = createResponse();
    await handler(
      createRequest("https://shopstr.store/root-relative-image"),
      rootRes as unknown as NextApiResponse
    );
    const protocolRes = createResponse();
    await handler(
      createRequest("http://shopstr.store/protocol-relative-image"),
      protocolRes as unknown as NextApiResponse
    );

    expect((rootRes.jsonBody as { image?: string }).image).toBe(
      "https://shopstr.store/static/card.png"
    );
    expect((protocolRes.jsonBody as { image?: string }).image).toBe(
      "https://cdn.shopstr.store/card.png"
    );
  });

  it("drops og:image values that use a non-http scheme", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockHtmlResponse(`
        <meta property="og:title" content="Script image">
        <meta property="og:image" content="javascript:alert(1)">
      `)
    );

    const res = createResponse();
    await handler(
      createRequest("https://shopstr.store/script-image"),
      res as unknown as NextApiResponse
    );

    expect(res.jsonBody).toEqual({
      title: "Script image",
      url: "https://shopstr.store/script-image",
    });
  });

  it("serves repeat requests from cache but caps how many previews it keeps", async () => {
    (global.fetch as jest.Mock).mockImplementation(async () =>
      mockHtmlResponse('<meta property="og:title" content="Cached">')
    );
    const urlFor = (i: number) => `https://shopstr.store/cap-test?page=${i}`;
    // Spread requests over many client IPs so the per-IP rate limit does
    // not cut the test short.
    const request = async (i: number) => {
      const res = createResponse();
      await handler(
        createRequest(urlFor(i), `198.51.100.${i % 200}`),
        res as unknown as NextApiResponse
      );
      return res;
    };

    await request(0);
    await request(0);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    for (let i = 1; i <= 500; i++) {
      await request(i);
    }
    expect(global.fetch).toHaveBeenCalledTimes(501);

    // The newest entry is still cached; the oldest was evicted to make room.
    await request(500);
    expect(global.fetch).toHaveBeenCalledTimes(501);
    await request(0);
    expect(global.fetch).toHaveBeenCalledTimes(502);
  });
});
