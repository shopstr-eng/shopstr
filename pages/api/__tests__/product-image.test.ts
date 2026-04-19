const applyRateLimitMock = jest.fn();
const lookupMock = jest.fn();

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));

jest.mock("dns/promises", () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}));

import type { NextApiRequest, NextApiResponse } from "next";
import handler from "@/pages/api/product-image";

type MockApiResponse = NextApiResponse & {
  body: unknown;
  headers: Record<string, string>;
  statusCode: number;
};

const createResponse = () => {
  const response = {
    headers: {} as Record<string, string>,
    statusCode: 200,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
  };

  return response as unknown as MockApiResponse;
};

const makeRequest = (
  query: NextApiRequest["query"],
  method = "GET"
): NextApiRequest =>
  ({
    method,
    query,
    headers: {},
  }) as Partial<NextApiRequest> as NextApiRequest;

describe("/api/product-image", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    applyRateLimitMock.mockReset();
    lookupMock.mockReset();
    global.fetch = jest.fn();
    applyRateLimitMock.mockReturnValue(true);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("returns 405 for non-GET requests", async () => {
    const res = createResponse();

    await handler(makeRequest({}, "POST"), res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: "Method not allowed" });
  });

  it("returns 400 when url is missing", async () => {
    const res = createResponse();

    await handler(makeRequest({}), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Missing url" });
  });

  it("returns 400 for blocked hosts", async () => {
    const res = createResponse();

    await handler(
      makeRequest({ url: "https://localhost/tracker.png" }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "URL host is not allowed" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns 400 when the fetched response is not an image", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: new Headers({
        "content-type": "text/html",
      }),
    });
    const res = createResponse();

    await handler(
      makeRequest({ url: "https://example.com/not-image" }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid image response" });
  });

  it("streams a safe public image response", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: new Headers({
        "content-type": "image/jpeg",
        "content-length": "4",
      }),
      arrayBuffer: jest.fn().mockResolvedValue(Uint8Array.from([1, 2, 3, 4])),
    });
    const res = createResponse();

    await handler(
      makeRequest({ url: "https://example.com/image.jpg" }),
      res
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.com/image.jpg",
      expect.objectContaining({
        redirect: "manual",
      })
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("image/jpeg");
    expect(res.body).toEqual(Buffer.from([1, 2, 3, 4]));
  });
});
