import type { NextApiRequest, NextApiResponse } from "next";

const deleteCachedEventsByIdsMock = jest.fn();
const getCachedEventPubkeysMock = jest.fn();
const extractSignedEventFromRequestMock = jest.fn();
const verifySignedHttpRequestProofMock = jest.fn();

jest.mock("@/utils/db/db-service", () => ({
  deleteCachedEventsByIds: (...args: unknown[]) =>
    deleteCachedEventsByIdsMock(...args),
  getCachedEventPubkeys: (...args: unknown[]) =>
    getCachedEventPubkeysMock(...args),
}));

jest.mock("@/utils/nostr/request-auth", () => ({
  buildDeleteEventsProof: (...args: unknown[]) => args[0],
  extractSignedEventFromRequest: (...args: unknown[]) =>
    extractSignedEventFromRequestMock(...args),
  verifySignedHttpRequestProof: (...args: unknown[]) =>
    verifySignedHttpRequestProofMock(...args),
}));

import handler from "@/pages/api/db/delete-events";
import { __resetRateLimitBuckets } from "@/utils/rate-limit";

function createResponse() {
  return {
    statusCode: 200,
    jsonBody: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.jsonBody = payload;
      return this;
    },
  };
}

function createRequest(body: unknown): NextApiRequest {
  return {
    method: "POST",
    body,
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as NextApiRequest;
}

describe("/api/db/delete-events", () => {
  beforeEach(() => {
    deleteCachedEventsByIdsMock.mockReset();
    getCachedEventPubkeysMock.mockReset();
    extractSignedEventFromRequestMock.mockReset();
    verifySignedHttpRequestProofMock.mockReset();
    __resetRateLimitBuckets();
  });

  it("requires a signed request proof before deleting cached events", async () => {
    extractSignedEventFromRequestMock.mockReturnValue(undefined);
    verifySignedHttpRequestProofMock.mockReturnValue({
      ok: false,
      status: 401,
      error:
        "A signed Nostr request proof is required to prove pubkey ownership.",
    });

    const req = createRequest({ eventIds: ["event-1"] });
    const res = createResponse();

    await handler(req, res as unknown as NextApiResponse);

    expect(getCachedEventPubkeysMock).not.toHaveBeenCalled();
    expect(deleteCachedEventsByIdsMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("rejects deletes for cached events owned by a different pubkey", async () => {
    extractSignedEventFromRequestMock.mockReturnValue({ pubkey: "seller-1" });
    verifySignedHttpRequestProofMock.mockReturnValue({ ok: true, status: 200 });
    getCachedEventPubkeysMock.mockResolvedValue(
      new Map([["event-1", "seller-2"]])
    );

    const req = createRequest({ eventIds: ["event-1"] });
    const res = createResponse();

    await handler(req, res as unknown as NextApiResponse);

    expect(getCachedEventPubkeysMock).toHaveBeenCalledWith(["event-1"]);
    expect(deleteCachedEventsByIdsMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.jsonBody).toEqual({
      error: "You may only delete cached events that belong to your pubkey.",
    });
  });

  it("deletes owned cached events after normalizing duplicate ids", async () => {
    extractSignedEventFromRequestMock.mockReturnValue({ pubkey: "seller-1" });
    verifySignedHttpRequestProofMock.mockReturnValue({ ok: true, status: 200 });
    getCachedEventPubkeysMock.mockResolvedValue(
      new Map([["event-1", "seller-1"]])
    );

    const req = createRequest({ eventIds: ["event-1", "event-1", "  event-1  "] });
    const res = createResponse();

    await handler(req, res as unknown as NextApiResponse);

    expect(getCachedEventPubkeysMock).toHaveBeenCalledWith(["event-1"]);
    expect(deleteCachedEventsByIdsMock).toHaveBeenCalledWith(["event-1"]);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ success: true });
  });
});
