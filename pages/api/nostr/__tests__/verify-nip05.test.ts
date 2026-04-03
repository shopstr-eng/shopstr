jest.mock("node:dns/promises", () => ({
  lookup: jest.fn(),
}));

import type { NextApiRequest, NextApiResponse } from "next";
import { lookup } from "node:dns/promises";
import handler from "@/pages/api/nostr/verify-nip05";

describe("/api/nostr/verify-nip05", () => {
  const originalFetch = global.fetch;
  const mockedLookup = lookup as unknown as jest.Mock;

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
    };

    return response as unknown as MockApiResponse;
  };

  afterEach(() => {
    global.fetch = originalFetch;
    mockedLookup.mockReset();
    jest.restoreAllMocks();
  });

  it("verifies a matching NIP-05 identifier through the server route", async () => {
    mockedLookup.mockResolvedValue([
      {
        address: "93.184.216.34",
        family: 4,
      },
    ]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        names: {
          alice: "f".repeat(64),
        },
      }),
    }) as typeof fetch;

    const req = {
      method: "GET",
      query: {
        nip05: "alice@example.com",
        pubkey: "f".repeat(64),
      },
    } as Partial<NextApiRequest> as NextApiRequest;
    const res = createResponse();

    await handler(req, res);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.com/.well-known/nostr.json?name=alice",
      expect.objectContaining({
        headers: {
          Accept: "application/json",
        },
        redirect: "manual",
        signal: expect.any(AbortSignal),
      })
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ verified: true });
  });

  it("returns verified false when the external NIP-05 endpoint fails", async () => {
    mockedLookup.mockResolvedValue([
      {
        address: "93.184.216.34",
        family: 4,
      },
    ]);
    global.fetch = jest.fn().mockRejectedValue(new Error("network error")) as typeof fetch;

    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const req = {
      method: "GET",
      query: {
        nip05: "alice@example.com",
        pubkey: "f".repeat(64),
      },
    } as Partial<NextApiRequest> as NextApiRequest;
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ verified: false });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "NIP-05 verification fetch failed:",
      expect.any(Error)
    );
  });

  it("rejects malformed NIP-05 identifiers before making an external request", async () => {
    global.fetch = jest.fn() as typeof fetch;

    const req = {
      method: "GET",
      query: {
        nip05: "alice",
        pubkey: "f".repeat(64),
      },
    } as Partial<NextApiRequest> as NextApiRequest;
    const res = createResponse();

    await handler(req, res);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "Invalid NIP-05 identifier",
    });
  });

  it("rejects invalid NIP-05 local-parts before making an external request", async () => {
    global.fetch = jest.fn() as typeof fetch;

    const req = {
      method: "GET",
      query: {
        nip05: "Alice@example.com",
        pubkey: "f".repeat(64),
      },
    } as Partial<NextApiRequest> as NextApiRequest;
    const res = createResponse();

    await handler(req, res);

    expect(mockedLookup).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "Invalid NIP-05 identifier",
    });
  });

  it("returns verified false when the upstream endpoint redirects", async () => {
    mockedLookup.mockResolvedValue([
      {
        address: "93.184.216.34",
        family: 4,
      },
    ]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 302,
    }) as typeof fetch;

    const req = {
      method: "GET",
      query: {
        nip05: "alice@example.com",
        pubkey: "f".repeat(64),
      },
    } as Partial<NextApiRequest> as NextApiRequest;
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ verified: false });
  });

  it("returns verified false when the hostname resolves to a private address", async () => {
    mockedLookup.mockResolvedValue([
      {
        address: "127.0.0.1",
        family: 4,
      },
    ]);
    global.fetch = jest.fn() as typeof fetch;

    const req = {
      method: "GET",
      query: {
        nip05: "alice@example.com",
        pubkey: "f".repeat(64),
      },
    } as Partial<NextApiRequest> as NextApiRequest;
    const res = createResponse();

    await handler(req, res);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ verified: false });
  });

  it("returns 400 when required params are missing", async () => {
    global.fetch = jest.fn() as typeof fetch;

    const req = {
      method: "GET",
      query: {
        nip05: "alice@example.com",
      },
    } as Partial<NextApiRequest> as NextApiRequest;
    const res = createResponse();

    await handler(req, res);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "nip05 and pubkey are required",
    });
  });

  it("returns 405 and exposes the supported method", async () => {
    global.fetch = jest.fn() as typeof fetch;

    const req = {
      method: "POST",
      query: {},
    } as Partial<NextApiRequest> as NextApiRequest;
    const res = createResponse();

    await handler(req, res);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.headers.Allow).toBe("GET");
    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({
      error: "Method not allowed",
    });
  });
});
