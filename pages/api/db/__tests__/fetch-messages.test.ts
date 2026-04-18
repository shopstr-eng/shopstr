const fetchAllMessagesFromDbMock = jest.fn();
const applyRateLimitMock = jest.fn();
const extractSignedEventFromRequestMock = jest.fn();
const verifySignedHttpRequestProofMock = jest.fn();

jest.mock("@/utils/db/db-service", () => ({
  fetchAllMessagesFromDb: (...args: unknown[]) =>
    fetchAllMessagesFromDbMock(...args),
}));

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));

jest.mock("@/utils/nostr/request-auth", () => ({
  buildMessagesListProof: (pubkey: string) => ({ pubkey }),
  extractSignedEventFromRequest: (...args: unknown[]) =>
    extractSignedEventFromRequestMock(...args),
  verifySignedHttpRequestProof: (...args: unknown[]) =>
    verifySignedHttpRequestProofMock(...args),
}));

import type { NextApiRequest, NextApiResponse } from "next";
import handler from "@/pages/api/db/fetch-messages";

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

const makeRequest = (
  query: NextApiRequest["query"],
  method = "GET"
): NextApiRequest =>
  ({
    method,
    query,
    headers: {},
  }) as Partial<NextApiRequest> as NextApiRequest;

const VALID_PUBKEY = "a".repeat(64);

describe("/api/db/fetch-messages", () => {
  beforeEach(() => {
    fetchAllMessagesFromDbMock.mockReset();
    applyRateLimitMock.mockReset();
    extractSignedEventFromRequestMock.mockReset();
    verifySignedHttpRequestProofMock.mockReset();
    applyRateLimitMock.mockReturnValue(true);
    verifySignedHttpRequestProofMock.mockReturnValue({ ok: true, status: 200 });
  });

  it("returns 405 for non-GET requests", async () => {
    const res = createResponse();

    await handler(makeRequest({}, "POST"), res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: "Method not allowed" });
    expect(fetchAllMessagesFromDbMock).not.toHaveBeenCalled();
  });

  it("returns 400 when pubkey is missing", async () => {
    const res = createResponse();

    await handler(makeRequest({}), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid pubkey parameter" });
    expect(extractSignedEventFromRequestMock).not.toHaveBeenCalled();
  });

  it("returns 400 when pubkey is invalid", async () => {
    const res = createResponse();

    await handler(makeRequest({ pubkey: "not-a-pubkey" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid pubkey parameter" });
    expect(extractSignedEventFromRequestMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the signed request proof is missing or invalid", async () => {
    extractSignedEventFromRequestMock.mockReturnValue(undefined);
    verifySignedHttpRequestProofMock.mockReturnValue({
      ok: false,
      status: 401,
      error: "A signed Nostr request proof is required to prove pubkey ownership.",
    });
    const res = createResponse();

    await handler(makeRequest({ pubkey: VALID_PUBKEY }), res);

    expect(extractSignedEventFromRequestMock).toHaveBeenCalledTimes(1);
    expect(verifySignedHttpRequestProofMock).toHaveBeenCalledWith(undefined, {
      pubkey: VALID_PUBKEY,
    });
    expect(fetchAllMessagesFromDbMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      error:
        "A signed Nostr request proof is required to prove pubkey ownership.",
    });
  });

  it("normalizes the pubkey before verifying ownership and querying", async () => {
    fetchAllMessagesFromDbMock.mockResolvedValue([]);
    extractSignedEventFromRequestMock.mockReturnValue({ pubkey: VALID_PUBKEY });
    const res = createResponse();

    await handler(makeRequest({ pubkey: `  ${"A".repeat(64)}  ` }), res);

    expect(verifySignedHttpRequestProofMock).toHaveBeenCalledWith(
      { pubkey: VALID_PUBKEY },
      { pubkey: VALID_PUBKEY }
    );
    expect(fetchAllMessagesFromDbMock).toHaveBeenCalledWith(VALID_PUBKEY);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns messages for an authorized pubkey", async () => {
    const messages = [
      {
        id: "msg-1",
        pubkey: VALID_PUBKEY,
        created_at: 1,
        kind: 1059,
        tags: [],
        content: "encrypted",
        sig: "sig",
        is_read: false,
      },
    ];
    fetchAllMessagesFromDbMock.mockResolvedValue(messages);
    extractSignedEventFromRequestMock.mockReturnValue({ pubkey: VALID_PUBKEY });
    const res = createResponse();

    await handler(makeRequest({ pubkey: VALID_PUBKEY }), res);

    expect(fetchAllMessagesFromDbMock).toHaveBeenCalledWith(VALID_PUBKEY);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(messages);
  });

  it("returns 500 when the database call throws", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    fetchAllMessagesFromDbMock.mockRejectedValue(new Error("db down"));
    extractSignedEventFromRequestMock.mockReturnValue({ pubkey: VALID_PUBKEY });
    const res = createResponse();

    await handler(makeRequest({ pubkey: VALID_PUBKEY }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Failed to fetch messages" });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch messages from database:",
      expect.any(Error)
    );
  });
});
