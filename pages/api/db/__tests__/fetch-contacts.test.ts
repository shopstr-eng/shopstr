const fetchCachedEventsMock = jest.fn();
const applyRateLimitMock = jest.fn();

jest.mock("@/utils/db/db-service", () => ({
  fetchCachedEvents: (...args: unknown[]) => fetchCachedEventsMock(...args),
}));

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));

import type { NextApiRequest, NextApiResponse } from "next";
import handler from "@/pages/api/db/fetch-contacts";

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
    end() {
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

describe("/api/db/fetch-contacts", () => {
  beforeEach(() => {
    fetchCachedEventsMock.mockReset();
    applyRateLimitMock.mockReset();
    applyRateLimitMock.mockReturnValue(true);
  });

  it("returns 405 for non-GET requests", async () => {
    const res = createResponse();

    await handler(makeRequest({}, "POST"), res);

    expect(res.statusCode).toBe(405);
    expect(fetchCachedEventsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when pubkey is missing", async () => {
    const res = createResponse();

    await handler(makeRequest({}), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "pubkey required" });
    expect(fetchCachedEventsMock).not.toHaveBeenCalled();
  });

  it("returns null when no cached contact list exists", async () => {
    fetchCachedEventsMock.mockResolvedValue([]);
    const res = createResponse();

    await handler(makeRequest({ pubkey: "a".repeat(64) }), res);

    expect(fetchCachedEventsMock).toHaveBeenCalledWith(3, {
      pubkey: "a".repeat(64),
      limit: 1,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ contactList: null });
  });

  it("returns the latest cached contact list event", async () => {
    fetchCachedEventsMock.mockResolvedValue([
      {
        id: "contact-list-id",
        pubkey: "a".repeat(64),
        created_at: 123,
        kind: 3,
        tags: [["p", "b".repeat(64)]],
        content: "",
        sig: "sig",
      },
    ]);
    const res = createResponse();

    await handler(makeRequest({ pubkey: "a".repeat(64) }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      contactList: {
        id: "contact-list-id",
        pubkey: "a".repeat(64),
        created_at: 123,
        kind: 3,
        tags: [["p", "b".repeat(64)]],
        content: "",
        sig: "sig",
      },
    });
  });

  it("returns 500 when the database call throws", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    fetchCachedEventsMock.mockRejectedValue(new Error("db down"));
    const res = createResponse();

    await handler(makeRequest({ pubkey: "a".repeat(64) }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Failed to fetch contact list" });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch contact list from database:",
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });
});
