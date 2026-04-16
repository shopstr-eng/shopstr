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

function createRequest(method: string, body: unknown): NextApiRequest {
  return {
    method,
    body,
  } as unknown as NextApiRequest;
}

describe("/api/db/delete-events", () => {
  beforeEach(() => {
    cachedEventsBelongToPubkeyMock.mockReset();
    deleteCachedEventsByIdsMock.mockReset();
    extractSignedEventFromRequestMock.mockReset();
    verifySignedHttpRequestProofMock.mockReset();
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
    extractSignedEventFromRequestMock.mockReturnValue({ pubkey: "buyer-pubkey" });
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

  it("allows signed owners to delete their own cached events", async () => {
    extractSignedEventFromRequestMock.mockReturnValue({ pubkey: "owner-pubkey" });
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
});
