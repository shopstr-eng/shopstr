const fetchRelevantReportsFromDbMock = jest.fn();
const applyRateLimitMock = jest.fn();

jest.mock("@/utils/db/db-service", () => ({
  fetchRelevantReportsFromDb: (...args: unknown[]) =>
    fetchRelevantReportsFromDbMock(...args),
}));

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));

import type { NextApiRequest, NextApiResponse } from "next";
import handler from "@/pages/api/db/fetch-reports";

type MockApiResponse = NextApiResponse & {
  body: unknown;
  statusCode: number;
};

const createResponse = () => {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader() {
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

describe("/api/db/fetch-reports", () => {
  beforeEach(() => {
    fetchRelevantReportsFromDbMock.mockReset();
    applyRateLimitMock.mockReset();
    applyRateLimitMock.mockReturnValue(true);
  });

  it("returns 405 for non-GET requests", async () => {
    const res = createResponse();

    await handler(makeRequest({}, "POST"), res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: "Method not allowed" });
    expect(fetchRelevantReportsFromDbMock).not.toHaveBeenCalled();
  });

  it("stops when rate limited", async () => {
    applyRateLimitMock.mockReturnValue(false);
    const res = createResponse();

    await handler(makeRequest({ p: "a".repeat(64) }), res);

    expect(applyRateLimitMock).toHaveBeenCalled();
    expect(fetchRelevantReportsFromDbMock).not.toHaveBeenCalled();
  });

  it("normalizes, deduplicates, and bounds valid report targets", async () => {
    fetchRelevantReportsFromDbMock.mockResolvedValue([{ id: "report-1" }]);
    const pubkey = "A".repeat(64);
    const eventId = "b".repeat(64);
    const res = createResponse();

    await handler(
      makeRequest({ p: [pubkey, pubkey.toLowerCase()], e: eventId }),
      res
    );

    expect(fetchRelevantReportsFromDbMock).toHaveBeenCalledWith(
      [eventId],
      [pubkey.toLowerCase()],
      500
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ id: "report-1" }]);
  });

  it("rejects malformed target identifiers", async () => {
    const res = createResponse();

    await handler(makeRequest({ p: "not-a-pubkey" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid p parameter" });
    expect(fetchRelevantReportsFromDbMock).not.toHaveBeenCalled();
  });

  it("rejects oversized target lists", async () => {
    const res = createResponse();
    const targets = Array.from({ length: 101 }, (_, index) =>
      index.toString(16).padStart(64, "0")
    );

    await handler(makeRequest({ e: targets }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Too many e parameters" });
    expect(fetchRelevantReportsFromDbMock).not.toHaveBeenCalled();
  });
});
