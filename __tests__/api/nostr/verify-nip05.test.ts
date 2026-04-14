jest.mock("node:dns/promises", () => ({
  lookup: jest.fn(),
}));

jest.mock("node:https", () => ({
  request: jest.fn(),
}));

import { EventEmitter } from "node:events";
import type { NextApiRequest, NextApiResponse } from "next";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import handler from "@/pages/api/nostr/verify-nip05";

describe("/api/nostr/verify-nip05", () => {
  const mockedLookup = lookup as unknown as jest.Mock;
  const mockedRequest = httpsRequest as unknown as jest.Mock;

  type MockApiResponse = NextApiResponse & {
    body: unknown;
    headers: Record<string, string>;
    statusCode: number;
  };

  type MockRequest = EventEmitter & {
    destroy: jest.Mock;
    end: jest.Mock;
  };

  type MockIncomingMessage = EventEmitter & {
    destroy: jest.Mock;
    headers: Record<string, string>;
    resume: jest.Mock;
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

  const makeRequest = (
    query: NextApiRequest["query"],
    method = "GET"
  ): NextApiRequest =>
    ({
      method,
      query,
    }) as Partial<NextApiRequest> as NextApiRequest;

  const mockPublicDns = () => {
    mockedLookup.mockResolvedValue([
      {
        address: "93.184.216.34",
        family: 4,
      },
    ]);
  };

  const mockNip05Response = ({
    body,
    error,
    headers = {},
    statusCode = 200,
  }: {
    body?: string;
    error?: Error;
    headers?: Record<string, string>;
    statusCode?: number;
  }) => {
    const req = new EventEmitter() as MockRequest;
    req.destroy = jest.fn((destroyError?: Error) => {
      req.emit("error", destroyError ?? new Error("request destroyed"));
    });
    req.end = jest.fn(() => {
      if (error) {
        req.emit("error", error);
        return;
      }

      const response = new EventEmitter() as MockIncomingMessage;
      response.destroy = jest.fn();
      response.headers = headers;
      response.resume = jest.fn();
      response.statusCode = statusCode;

      const callback = mockedRequest.mock.calls.at(-1)?.[1] as (
        response: MockIncomingMessage
      ) => void;
      callback(response);

      process.nextTick(() => {
        if (body !== undefined) {
          response.emit("data", Buffer.from(body));
        }
        response.emit("end");
      });
    });

    mockedRequest.mockReturnValue(req);
    return req;
  };

  afterEach(() => {
    mockedLookup.mockReset();
    mockedRequest.mockReset();
    jest.restoreAllMocks();
  });

  it("verifies a matching NIP-05 identifier through the server route", async () => {
    mockPublicDns();
    mockNip05Response({
      body: JSON.stringify({
        names: {
          alice: "f".repeat(64),
        },
      }),
    });

    const res = createResponse();
    await handler(
      makeRequest({
        nip05: "alice@example.com",
        pubkey: "f".repeat(64),
      }),
      res
    );

    expect(mockedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          Host: "example.com",
        },
        hostname: "example.com",
        method: "GET",
        path: "/.well-known/nostr.json?name=alice",
        protocol: "https:",
        servername: "example.com",
        signal: expect.any(AbortSignal),
      }),
      expect.any(Function)
    );

    const requestOptions = mockedRequest.mock.calls[0]?.[0] as {
      lookup: (
        hostname: string,
        options: unknown,
        callback: (error: Error | null, address: string, family: number) => void
      ) => void;
    };
    const lookupCallback = jest.fn();
    requestOptions.lookup("example.com", {}, lookupCallback);
    expect(lookupCallback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ verified: true });
  });

  it("returns verified false when the external NIP-05 endpoint fails", async () => {
    mockPublicDns();
    mockNip05Response({ error: new Error("network error") });

    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const res = createResponse();

    await handler(
      makeRequest({
        nip05: "alice@example.com",
        pubkey: "f".repeat(64),
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ verified: false });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "NIP-05 verification fetch failed:",
      expect.any(Error)
    );
  });

  it("rejects malformed NIP-05 identifiers before making an external request", async () => {
    const res = createResponse();

    await handler(
      makeRequest({
        nip05: "alice",
        pubkey: "f".repeat(64),
      }),
      res
    );

    expect(mockedLookup).not.toHaveBeenCalled();
    expect(mockedRequest).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "Invalid NIP-05 identifier",
    });
  });

  it("rejects invalid NIP-05 local-parts before making an external request", async () => {
    const res = createResponse();

    await handler(
      makeRequest({
        nip05: "Alice@example.com",
        pubkey: "f".repeat(64),
      }),
      res
    );

    expect(mockedLookup).not.toHaveBeenCalled();
    expect(mockedRequest).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "Invalid NIP-05 identifier",
    });
  });

  it("returns verified false when the upstream endpoint redirects", async () => {
    mockPublicDns();
    mockNip05Response({ statusCode: 302 });
    const res = createResponse();

    await handler(
      makeRequest({
        nip05: "alice@example.com",
        pubkey: "f".repeat(64),
      }),
      res
    );

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
    const res = createResponse();

    await handler(
      makeRequest({
        nip05: "alice@example.com",
        pubkey: "f".repeat(64),
      }),
      res
    );

    expect(mockedRequest).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ verified: false });
  });

  it("returns verified false when any resolved address is private", async () => {
    mockedLookup.mockResolvedValue([
      {
        address: "93.184.216.34",
        family: 4,
      },
      {
        address: "10.0.0.5",
        family: 4,
      },
    ]);
    const res = createResponse();

    await handler(
      makeRequest({
        nip05: "alice@example.com",
        pubkey: "f".repeat(64),
      }),
      res
    );

    expect(mockedRequest).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ verified: false });
  });

  it("returns verified false when content-length exceeds the NIP-05 limit", async () => {
    mockPublicDns();
    mockNip05Response({
      headers: {
        "content-length": String(64 * 1024 + 1),
      },
    });
    const res = createResponse();

    await handler(
      makeRequest({
        nip05: "alice@example.com",
        pubkey: "f".repeat(64),
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ verified: false });
  });

  it("returns verified false when the streamed response exceeds the NIP-05 limit", async () => {
    mockPublicDns();
    mockNip05Response({
      body: "x".repeat(64 * 1024 + 1),
    });
    const res = createResponse();

    await handler(
      makeRequest({
        nip05: "alice@example.com",
        pubkey: "f".repeat(64),
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ verified: false });
  });

  it("returns 400 when required params are missing", async () => {
    const res = createResponse();

    await handler(
      makeRequest({
        nip05: "alice@example.com",
      }),
      res
    );

    expect(mockedRequest).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "nip05 and pubkey are required",
    });
  });

  it("returns 405 and exposes the supported method", async () => {
    const res = createResponse();

    await handler(makeRequest({}, "POST"), res);

    expect(mockedRequest).not.toHaveBeenCalled();
    expect(res.headers.Allow).toBe("GET");
    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({
      error: "Method not allowed",
    });
  });
});
