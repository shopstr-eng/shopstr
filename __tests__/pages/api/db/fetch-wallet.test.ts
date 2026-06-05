jest.mock("@/utils/db/db-service", () => ({
  fetchAllWalletEventsFromDb: jest.fn(),
}));

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: jest.fn(() => true),
}));

import type { NextApiRequest, NextApiResponse } from "next";
import handler from "@/pages/api/db/fetch-wallet";
import { fetchAllWalletEventsFromDb } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

const mockedFetchAllWalletEventsFromDb =
  fetchAllWalletEventsFromDb as jest.MockedFunction<
    typeof fetchAllWalletEventsFromDb
  >;
const mockedApplyRateLimit = applyRateLimit as jest.MockedFunction<
  typeof applyRateLimit
>;

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
  }) as Partial<NextApiRequest> as NextApiRequest;

const VALID_PUBKEY = "a".repeat(64);

describe("/api/db/fetch-wallet", () => {
  beforeEach(() => {
    mockedFetchAllWalletEventsFromDb.mockReset();
    mockedApplyRateLimit.mockReset();
    mockedApplyRateLimit.mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns 405 for non-GET requests", async () => {
    const res = createResponse();

    await handler(makeRequest({}, "POST"), res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: "Method not allowed" });
    expect(mockedFetchAllWalletEventsFromDb).not.toHaveBeenCalled();
  });

  it("returns 400 when pubkey is missing", async () => {
    const res = createResponse();

    await handler(makeRequest({}), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid pubkey parameter" });
    expect(mockedFetchAllWalletEventsFromDb).not.toHaveBeenCalled();
  });

  it("returns 400 when pubkey is provided as an array", async () => {
    const res = createResponse();

    await handler(makeRequest({ pubkey: [VALID_PUBKEY] }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid pubkey parameter" });
    expect(mockedFetchAllWalletEventsFromDb).not.toHaveBeenCalled();
  });

  it("returns 400 when pubkey is whitespace only", async () => {
    const res = createResponse();

    await handler(makeRequest({ pubkey: "   " }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid pubkey parameter" });
    expect(mockedFetchAllWalletEventsFromDb).not.toHaveBeenCalled();
  });

  it("returns 400 when pubkey is not 64 hex characters", async () => {
    const res = createResponse();

    await handler(makeRequest({ pubkey: "not-a-valid-pubkey" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid pubkey parameter" });
    expect(mockedFetchAllWalletEventsFromDb).not.toHaveBeenCalled();
  });

  it("returns 400 when pubkey contains non-hex characters", async () => {
    const res = createResponse();

    await handler(makeRequest({ pubkey: "z".repeat(64) }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid pubkey parameter" });
    expect(mockedFetchAllWalletEventsFromDb).not.toHaveBeenCalled();
  });

  it("short-circuits when the rate limiter rejects the request", async () => {
    mockedApplyRateLimit.mockReturnValue(false);
    const res = createResponse();

    await handler(makeRequest({ pubkey: VALID_PUBKEY }), res);

    expect(mockedFetchAllWalletEventsFromDb).not.toHaveBeenCalled();
  });

  it("fetches wallet events for a valid pubkey and returns 200", async () => {
    const events = [
      {
        id: "1",
        pubkey: VALID_PUBKEY,
        created_at: 1,
        kind: 7375,
        tags: [],
        content: "",
        sig: "",
      },
    ];
    mockedFetchAllWalletEventsFromDb.mockResolvedValue(events);
    const res = createResponse();

    await handler(makeRequest({ pubkey: VALID_PUBKEY }), res);

    expect(mockedFetchAllWalletEventsFromDb).toHaveBeenCalledWith(VALID_PUBKEY);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(events);
  });

  it("trims and lowercases the pubkey before querying", async () => {
    mockedFetchAllWalletEventsFromDb.mockResolvedValue([]);
    const res = createResponse();
    const padded = `  ${"A".repeat(64)}  `;

    await handler(makeRequest({ pubkey: padded }), res);

    expect(mockedFetchAllWalletEventsFromDb).toHaveBeenCalledWith(
      "a".repeat(64)
    );
    expect(res.statusCode).toBe(200);
  });

  it("returns 500 when the database call throws", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedFetchAllWalletEventsFromDb.mockRejectedValue(new Error("db down"));
    const res = createResponse();

    await handler(makeRequest({ pubkey: VALID_PUBKEY }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Failed to fetch wallet events" });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch wallet events from database:",
      expect.any(Error)
    );
  });
});
