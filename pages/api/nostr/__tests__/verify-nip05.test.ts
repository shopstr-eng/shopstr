import type { NextApiRequest, NextApiResponse } from "next";
import handler from "@/pages/api/nostr/verify-nip05";

describe("/api/nostr/verify-nip05", () => {
  const originalFetch = global.fetch;

  type MockApiResponse = NextApiResponse & {
    body: unknown;
    statusCode: number;
  };

  const createResponse = () => {
    const response = {
      statusCode: 200,
      body: undefined as unknown,
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
    jest.restoreAllMocks();
  });

  it("verifies a matching NIP-05 identifier through the server route", async () => {
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
        signal: expect.any(AbortSignal),
      })
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ verified: true });
  });

  it("returns verified false when the external NIP-05 endpoint fails", async () => {
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
});
