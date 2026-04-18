const cachedEventsBelongToPubkeyMock = jest.fn();
const deleteCachedEventsByIdsMock = jest.fn();
const extractSignedEventFromRequestMock = jest.fn();
const verifySignedHttpRequestProofMock = jest.fn();

jest.mock("@/utils/db/db-service", () => ({
  cachedEventsBelongToPubkey: (...args: unknown[]) =>
    cachedEventsBelongToPubkeyMock(...args),
  deleteCachedEventsByIds: (...args: unknown[]) =>
    deleteCachedEventsByIdsMock(...args),
}));

jest.mock("@/utils/nostr/request-auth", () => ({
  buildDeleteCachedEventsProof: (payload: unknown) => payload,
  extractSignedEventFromRequest: (...args: unknown[]) =>
    extractSignedEventFromRequestMock(...args),
  verifySignedHttpRequestProof: (...args: unknown[]) =>
    verifySignedHttpRequestProofMock(...args),
}));

import type { NextApiRequest, NextApiResponse } from "next";
import handler from "@/pages/api/db/delete-events";
import { __resetRateLimitBuckets } from "@/utils/rate-limit";

function createResponse() {
  return {
    statusCode: 200,
    jsonBody: undefined as unknown,
    headers: {} as Record<string, string | number>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.jsonBody = payload;
      return this;
    },
    setHeader(name: string, value: string | number) {
      this.headers[name] = value;
      return this;
    },
  };
}

function createRequest(
  method: string,
  body: unknown,
  headers: Record<string, string> = {}
): NextApiRequest {
  return {
    method,
    body,
    headers,
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as NextApiRequest;
}

describe("/api/db/delete-events", () => {
  beforeEach(() => {
    cachedEventsBelongToPubkeyMock.mockReset();
    deleteCachedEventsByIdsMock.mockReset();
    extractSignedEventFromRequestMock.mockReset();
    verifySignedHttpRequestProofMock.mockReset();
    __resetRateLimitBuckets();
  });

  it("rejects malformed eventIds payloads", async () => {
    const req = createRequest("POST", { eventIds: ["evt-1", 42] });
    const res = createResponse();

    await handler(req, res as unknown as NextApiResponse);

    expect(extractSignedEventFromRequestMock).not.toHaveBeenCalled();
    expect(deleteCachedEventsByIdsMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: "eventIds must be a string array",
    });
  });

  it("rejects unsigned delete attempts", async () => {
    extractSignedEventFromRequestMock.mockReturnValue(undefined);
    verifySignedHttpRequestProofMock.mockReturnValue({
      ok: false,
      status: 401,
      error:
        "A signed Nostr request proof is required to prove pubkey ownership.",
    });

    const req = createRequest("POST", {
      eventIds: ["evt-1"],
    });
    const res = createResponse();

    await handler(req, res as unknown as NextApiResponse);

    expect(deleteCachedEventsByIdsMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.jsonBody).toEqual({
      error:
        "A signed Nostr request proof is required to prove pubkey ownership.",
    });
  });

  it("rejects deleting cached events owned by another pubkey", async () => {
    extractSignedEventFromRequestMock.mockReturnValue({
      pubkey: "buyer-pubkey",
    });
    verifySignedHttpRequestProofMock.mockReturnValue({ ok: true, status: 200 });
    cachedEventsBelongToPubkeyMock.mockResolvedValue(false);

    const req = createRequest("POST", {
      eventIds: ["evt-1"],
    });
    const res = createResponse();

    await handler(req, res as unknown as NextApiResponse);

    expect(cachedEventsBelongToPubkeyMock).toHaveBeenCalledWith(
      ["evt-1"],
      "buyer-pubkey"
    );
    expect(deleteCachedEventsByIdsMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.jsonBody).toEqual({
      error:
        "You are not allowed to delete cached events owned by another pubkey.",
    });
  });

  it("returns 500 when ownership verification fails unexpectedly", async () => {
    extractSignedEventFromRequestMock.mockReturnValue({
      pubkey: "owner-pubkey",
    });
    verifySignedHttpRequestProofMock.mockReturnValue({ ok: true, status: 200 });
    cachedEventsBelongToPubkeyMock.mockRejectedValue(
      new Error("db unavailable")
    );

    const req = createRequest("POST", {
      eventIds: ["evt-1"],
    });
    const res = createResponse();

    await handler(req, res as unknown as NextApiResponse);

    expect(deleteCachedEventsByIdsMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
    expect(res.jsonBody).toEqual({
      error: "Failed to delete cached events",
    });
  });

  it("allows signed owners to delete their own cached events", async () => {
    extractSignedEventFromRequestMock.mockReturnValue({
      pubkey: "owner-pubkey",
    });
    verifySignedHttpRequestProofMock.mockReturnValue({ ok: true, status: 200 });
    cachedEventsBelongToPubkeyMock.mockResolvedValue(true);

    const req = createRequest("POST", {
      eventIds: ["evt-1", "evt-2"],
    });
    const res = createResponse();

    await handler(req, res as unknown as NextApiResponse);

    expect(deleteCachedEventsByIdsMock).toHaveBeenCalledWith([
      "evt-1",
      "evt-2",
    ]);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ success: true });
  });

  it("enforces a per-pubkey rate limit independent of source IP", async () => {
    extractSignedEventFromRequestMock.mockReturnValue({
      pubkey: "owner-pubkey",
    });
    verifySignedHttpRequestProofMock.mockReturnValue({ ok: true, status: 200 });
    cachedEventsBelongToPubkeyMock.mockResolvedValue(true);

    // Per-pubkey cap is 60/min; spread requests across many IPs so the
    // per-IP bucket never trips and only the per-pubkey cap can fire.
    let lastResponse = createResponse();
    for (let i = 0; i < 60; i++) {
      const req = createRequest(
        "POST",
        { eventIds: ["evt-1"] },
        { "x-forwarded-for": `10.0.0.${i + 1}` }
      );
      lastResponse = createResponse();
      await handler(req, lastResponse as unknown as NextApiResponse);
      expect(lastResponse.statusCode).toBe(200);
    }

    const blockedReq = createRequest(
      "POST",
      { eventIds: ["evt-1"] },
      { "x-forwarded-for": "10.99.99.99" }
    );
    const blockedRes = createResponse();
    await handler(blockedReq, blockedRes as unknown as NextApiResponse);

    expect(blockedRes.statusCode).toBe(429);
    expect(blockedRes.jsonBody).toEqual({ error: "Too many requests" });
    expect(blockedRes.headers["Retry-After"]).toBeDefined();
    // The 61st delete must not have reached the database mutation.
    expect(deleteCachedEventsByIdsMock).toHaveBeenCalledTimes(60);
  });
});
