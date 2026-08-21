import type { NextApiRequest, NextApiResponse } from "next";

const lookupMock = jest.fn();

jest.mock("dns/promises", () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}));

import handler from "@/pages/api/cashu/validate-mint";
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
  body: unknown,
  headers: Record<string, string> = { origin: "http://localhost:3000" }
): NextApiRequest {
  return {
    method: "POST",
    body,
    headers,
    socket: { remoteAddress: "203.0.113.10" },
  } as unknown as NextApiRequest;
}

function jsonResponse(payload: unknown, allowOrigin = "*") {
  return {
    ok: true,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "access-control-allow-origin"
          ? allowOrigin
          : null,
    },
    text: async () => JSON.stringify(payload),
  };
}

function failedResponse(allowOrigin = "*") {
  return {
    ok: false,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "access-control-allow-origin"
          ? allowOrigin
          : null,
    },
    text: async () => "",
  };
}

describe("/api/cashu/validate-mint", () => {
  const envBackup = process.env;

  beforeEach(() => {
    process.env = { ...envBackup };
    __resetRateLimitBuckets();
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([{ family: 4, address: "93.184.216.34" }]);
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = envBackup;
  });

  it("validates a v1 Cashu mint through browser-compatible discovery endpoints", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonResponse({
          nuts: {
            "10": { supported: true },
            "11": { supported: true },
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          keysets: [{ id: "00deadbeef", unit: "sat", active: true }],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          keysets: [
            {
              id: "00deadbeef",
              unit: "sat",
              keys: { "1": "02".padEnd(66, "a") },
            },
          ],
        })
      );

    const res = createResponse();
    await handler(
      createRequest({ mintUrl: " https://cashu.example.com/// " }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({
      ok: true,
      mintUrl: "https://cashu.example.com",
      nuts: {
        "10": { supported: true },
        "11": { supported: true },
      },
      keysetCount: 1,
    });
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "https://cashu.example.com/v1/info",
      expect.objectContaining({
        redirect: "manual",
        headers: expect.objectContaining({ Origin: "http://localhost:3000" }),
      })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "https://cashu.example.com/v1/keysets",
      expect.objectContaining({
        redirect: "manual",
        headers: expect.objectContaining({ Origin: "http://localhost:3000" }),
      })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      "https://cashu.example.com/v1/keys",
      expect.objectContaining({
        redirect: "manual",
        headers: expect.objectContaining({ Origin: "http://localhost:3000" }),
      })
    );
  });

  it("accepts exact request-origin CORS headers", async () => {
    const origin = "https://shopstr.example.com";
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ nuts: {} }, origin))
      .mockResolvedValueOnce(
        jsonResponse({ keysets: [{ id: "00deadbeef", unit: "sat" }] }, origin)
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            keysets: [
              {
                id: "00deadbeef",
                unit: "sat",
                keys: { "1": "02".padEnd(66, "a") },
              },
            ],
          },
          origin
        )
      );

    const res = createResponse();
    await handler(
      createRequest(
        { mintUrl: "https://cashu.example.com" },
        { origin, host: "shopstr.example.com", "x-forwarded-proto": "https" }
      ),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(200);
  });

  it("rejects duplicate access-control-allow-origin headers that browsers reject", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ nuts: {} }, "*, *")
    );

    const res = createResponse();
    await handler(
      createRequest({ mintUrl: "https://cashu.mutinynet.com" }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error:
        "Mint does not allow browser wallet requests; use a mint with valid CORS headers.",
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects mints without v1 browser discovery endpoints", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ nuts: {} }))
      .mockResolvedValueOnce(failedResponse());

    const res = createResponse();
    await handler(
      createRequest({ mintUrl: "https://legacy.example.com/cashu" }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: "Could not validate mint discovery endpoints",
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects private or localhost mint hosts before fetching", async () => {
    const res = createResponse();
    await handler(
      createRequest({ mintUrl: "http://127.0.0.1" }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ error: "Mint host is not allowed" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("allows any safe public mint when no server allowlist is configured", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ nuts: {} }))
      .mockResolvedValueOnce(
        jsonResponse({
          keysets: [{ id: "00deadbeef", unit: "sat", active: true }],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          keysets: [
            {
              id: "00deadbeef",
              unit: "sat",
              keys: { "1": "02".padEnd(66, "a") },
            },
          ],
        })
      );

    const res = createResponse();
    await handler(
      createRequest({ mintUrl: "https://cashu.example.com" }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(200);
  });

  it("rejects mints outside the optional server allowlist before fetching", async () => {
    process.env.CASHU_MINT_VALIDATION_ALLOWED_MINTS =
      "https://cashu.example.com, https://mint.example/path/";

    const res = createResponse();
    await handler(
      createRequest({ mintUrl: "https://other.example.com" }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ error: "Mint is not allowed" });
    expect(lookupMock).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fails closed when the optional server allowlist is configured but invalid", async () => {
    process.env.CASHU_MINT_VALIDATION_ALLOWED_MINTS = "not-a-url";

    const res = createResponse();
    await handler(
      createRequest({ mintUrl: "https://cashu.example.com" }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ error: "Mint is not allowed" });
    expect(lookupMock).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("normalizes optional server allowlist entries before matching", async () => {
    process.env.CASHU_MINT_VALIDATION_ALLOWED_MINTS =
      "https://cashu.example.com/";
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ nuts: {} }))
      .mockResolvedValueOnce(
        jsonResponse({
          keysets: [{ id: "00deadbeef", unit: "sat", active: true }],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          keysets: [
            {
              id: "00deadbeef",
              unit: "sat",
              keys: { "1": "02".padEnd(66, "a") },
            },
          ],
        })
      );

    const res = createResponse();
    await handler(
      createRequest({ mintUrl: "https://cashu.example.com///" }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(200);
  });

  it("rejects hosts that resolve to private addresses", async () => {
    lookupMock.mockResolvedValue([{ family: 4, address: "10.0.0.5" }]);

    const res = createResponse();
    await handler(
      createRequest({ mintUrl: "https://mint.example.com" }),
      res as unknown as NextApiResponse
    );

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ error: "Mint host is not allowed" });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
