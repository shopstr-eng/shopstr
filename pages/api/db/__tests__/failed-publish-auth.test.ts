const extractSignedEventFromRequestMock = jest.fn();
const verifySignedHttpRequestProofMock = jest.fn();
const verifyEventMock = jest.fn();
const trackFailedRelayPublishRecordMock = jest.fn();
const getFailedRelayPublishesForOwnerMock = jest.fn();
const clearFailedRelayPublishForOwnerMock = jest.fn();
const incrementFailedRelayPublishRetryForOwnerMock = jest.fn();

jest.mock("@/utils/nostr/request-auth", () => ({
  buildTrackFailedRelayPublishProof: jest.fn(),
  buildListFailedRelayPublishesProof: jest.fn(),
  buildClearFailedRelayPublishProof: jest.fn(),
  extractSignedEventFromRequest: (...args: unknown[]) =>
    extractSignedEventFromRequestMock(...args),
  verifySignedHttpRequestProof: (...args: unknown[]) =>
    verifySignedHttpRequestProofMock(...args),
}));

jest.mock("nostr-tools", () => ({
  verifyEvent: (...args: unknown[]) => verifyEventMock(...args),
}));

jest.mock("@/utils/db/db-service", () => ({
  trackFailedRelayPublishRecord: (...args: unknown[]) =>
    trackFailedRelayPublishRecordMock(...args),
  getFailedRelayPublishesForOwner: (...args: unknown[]) =>
    getFailedRelayPublishesForOwnerMock(...args),
  clearFailedRelayPublishForOwner: (...args: unknown[]) =>
    clearFailedRelayPublishForOwnerMock(...args),
  incrementFailedRelayPublishRetryForOwner: (...args: unknown[]) =>
    incrementFailedRelayPublishRetryForOwnerMock(...args),
}));

import type { NextApiRequest, NextApiResponse } from "next";
import trackHandler from "@/pages/api/db/track-failed-publish";
import getHandler from "@/pages/api/db/get-failed-publishes";
import clearHandler from "@/pages/api/db/clear-failed-publish";
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
    setHeader() {
      return this;
    },
  };
}

function createRequest(
  method: string,
  body?: unknown,
  headers: Record<string, string> = {}
): NextApiRequest {
  return {
    method,
    body,
    headers,
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as NextApiRequest;
}

describe("failed relay publish queue auth", () => {
  beforeEach(() => {
    extractSignedEventFromRequestMock.mockReset();
    verifySignedHttpRequestProofMock.mockReset();
    verifyEventMock.mockReset();
    trackFailedRelayPublishRecordMock.mockReset();
    getFailedRelayPublishesForOwnerMock.mockReset();
    clearFailedRelayPublishForOwnerMock.mockReset();
    incrementFailedRelayPublishRetryForOwnerMock.mockReset();
    __resetRateLimitBuckets();
  });

  it("binds tracked failed publishes to the authenticated owner pubkey", async () => {
    extractSignedEventFromRequestMock.mockReturnValue({
      pubkey: "owner-pubkey",
    });
    verifySignedHttpRequestProofMock.mockReturnValue({ ok: true, status: 200 });
    verifyEventMock.mockReturnValue(true);
    trackFailedRelayPublishRecordMock.mockResolvedValue(true);

    const req = createRequest("POST", {
      eventId: "evt-1",
      event: {
        id: "evt-1",
        pubkey: "ephemeral-event-pubkey",
        kind: 1059,
        tags: [],
        content: "ciphertext",
        sig: "sig",
      },
      relays: ["wss://relay.example"],
    });
    const res = createResponse();

    await trackHandler(req, res as unknown as NextApiResponse);

    expect(trackFailedRelayPublishRecordMock).toHaveBeenCalledWith({
      eventId: "evt-1",
      ownerPubkey: "owner-pubkey",
      event: expect.objectContaining({ id: "evt-1" }),
      relays: ["wss://relay.example"],
    });
    expect(res.statusCode).toBe(200);
  });

  it("rejects forged event payloads even with a signed queue proof", async () => {
    extractSignedEventFromRequestMock.mockReturnValue({
      pubkey: "owner-pubkey",
    });
    verifySignedHttpRequestProofMock.mockReturnValue({ ok: true, status: 200 });
    verifyEventMock.mockReturnValue(false);

    const req = createRequest("POST", {
      eventId: "evt-2",
      event: {
        id: "evt-2",
        pubkey: "forged",
        kind: 1,
        tags: [],
        content: "forged",
        sig: "bad-sig",
      },
      relays: ["wss://relay.example"],
    });
    const res = createResponse();

    await trackHandler(req, res as unknown as NextApiResponse);

    expect(trackFailedRelayPublishRecordMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: "Invalid Nostr event signature",
    });
  });

  it("does not let another pubkey take over an existing failed publish entry", async () => {
    extractSignedEventFromRequestMock.mockReturnValue({
      pubkey: "attacker-pubkey",
    });
    verifySignedHttpRequestProofMock.mockReturnValue({ ok: true, status: 200 });
    verifyEventMock.mockReturnValue(true);
    trackFailedRelayPublishRecordMock.mockResolvedValue(false);

    const req = createRequest("POST", {
      eventId: "evt-occupied",
      event: {
        id: "evt-occupied",
        pubkey: "public-event-pubkey",
        kind: 1,
        tags: [],
        content: "public event",
        sig: "sig",
      },
      relays: ["wss://relay.example"],
    });
    const res = createResponse();

    await trackHandler(req, res as unknown as NextApiResponse);

    expect(res.statusCode).toBe(403);
    expect(res.jsonBody).toEqual({
      error: "This failed publish entry already belongs to another pubkey.",
    });
  });

  it("does not let callers claim legacy rows that do not already belong to them", async () => {
    extractSignedEventFromRequestMock.mockReturnValue({
      pubkey: "new-owner-pubkey",
    });
    verifySignedHttpRequestProofMock.mockReturnValue({ ok: true, status: 200 });
    verifyEventMock.mockReturnValue(true);
    trackFailedRelayPublishRecordMock.mockResolvedValue(false);

    const req = createRequest("POST", {
      eventId: "evt-legacy",
      event: {
        id: "evt-legacy",
        pubkey: "legacy-event-pubkey",
        kind: 1,
        tags: [],
        content: "legacy event",
        sig: "sig",
      },
      relays: ["wss://relay.example"],
    });
    const res = createResponse();

    await trackHandler(req, res as unknown as NextApiResponse);

    expect(res.statusCode).toBe(403);
    expect(res.jsonBody).toEqual({
      error: "This failed publish entry already belongs to another pubkey.",
    });
  });

  it("only returns queue entries for the authenticated owner", async () => {
    extractSignedEventFromRequestMock.mockReturnValue({
      pubkey: "owner-pubkey",
    });
    verifySignedHttpRequestProofMock.mockReturnValue({ ok: true, status: 200 });
    getFailedRelayPublishesForOwnerMock.mockResolvedValue([
      { eventId: "evt-1", relays: [], event: { id: "evt-1" }, retryCount: 0 },
    ]);

    const req = createRequest("GET");
    const res = createResponse();

    await getHandler(req, res as unknown as NextApiResponse);

    expect(getFailedRelayPublishesForOwnerMock).toHaveBeenCalledWith(
      "owner-pubkey"
    );
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual([
      { eventId: "evt-1", relays: [], event: { id: "evt-1" }, retryCount: 0 },
    ]);
  });

  it("only clears queue entries within the authenticated owner's scope", async () => {
    extractSignedEventFromRequestMock.mockReturnValue({
      pubkey: "owner-pubkey",
    });
    verifySignedHttpRequestProofMock.mockReturnValue({ ok: true, status: 200 });

    const req = createRequest("POST", {
      eventId: "evt-3",
      incrementRetry: true,
    });
    const res = createResponse();

    await clearHandler(req, res as unknown as NextApiResponse);

    expect(incrementFailedRelayPublishRetryForOwnerMock).toHaveBeenCalledWith(
      "evt-3",
      "owner-pubkey"
    );
    expect(clearFailedRelayPublishForOwnerMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("rejects non-boolean incrementRetry values with a 400 instead of silently coercing them", async () => {
    extractSignedEventFromRequestMock.mockReturnValue({
      pubkey: "owner-pubkey",
    });
    verifySignedHttpRequestProofMock.mockReturnValue({ ok: true, status: 200 });

    const req = createRequest("POST", {
      eventId: "evt-4",
      incrementRetry: "yes",
    });
    const res = createResponse();

    await clearHandler(req, res as unknown as NextApiResponse);

    expect(clearFailedRelayPublishForOwnerMock).not.toHaveBeenCalled();
    expect(incrementFailedRelayPublishRetryForOwnerMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: "incrementRetry must be a boolean",
    });
  });

  it("rejects track requests when the signed proof is missing or invalid", async () => {
    extractSignedEventFromRequestMock.mockReturnValue(undefined);
    verifySignedHttpRequestProofMock.mockReturnValue({
      ok: false,
      status: 401,
      error:
        "A signed Nostr request proof is required to prove pubkey ownership.",
    });

    const req = createRequest("POST", {
      eventId: "evt-unauth",
      event: {
        id: "evt-unauth",
        pubkey: "anyone",
        kind: 1,
        tags: [],
        content: "x",
        sig: "sig",
      },
      relays: ["wss://relay.example"],
    });
    const res = createResponse();

    await trackHandler(req, res as unknown as NextApiResponse);

    expect(trackFailedRelayPublishRecordMock).not.toHaveBeenCalled();
    expect(verifyEventMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.jsonBody).toEqual({
      error:
        "A signed Nostr request proof is required to prove pubkey ownership.",
    });
  });

  it("rejects list requests when the signed proof is missing or invalid", async () => {
    extractSignedEventFromRequestMock.mockReturnValue(undefined);
    verifySignedHttpRequestProofMock.mockReturnValue({
      ok: false,
      status: 401,
      error:
        "A signed Nostr request proof is required to prove pubkey ownership.",
    });

    const req = createRequest("GET");
    const res = createResponse();

    await getHandler(req, res as unknown as NextApiResponse);

    expect(getFailedRelayPublishesForOwnerMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("rejects clear requests when the signed proof is missing or invalid", async () => {
    extractSignedEventFromRequestMock.mockReturnValue(undefined);
    verifySignedHttpRequestProofMock.mockReturnValue({
      ok: false,
      status: 401,
      error:
        "A signed Nostr request proof is required to prove pubkey ownership.",
    });

    const req = createRequest("POST", { eventId: "evt-unauth" });
    const res = createResponse();

    await clearHandler(req, res as unknown as NextApiResponse);

    expect(clearFailedRelayPublishForOwnerMock).not.toHaveBeenCalled();
    expect(incrementFailedRelayPublishRetryForOwnerMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
