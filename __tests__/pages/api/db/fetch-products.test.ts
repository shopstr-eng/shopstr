jest.mock("@/utils/db/db-service", () => ({
  fetchAllProductsFromDb: jest.fn(),
  getEventCount: jest.fn(),
}));

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: jest.fn(() => true),
}));

import type { NextApiRequest, NextApiResponse } from "next";
import handler from "@/pages/api/db/fetch-products";
import { fetchAllProductsFromDb, getEventCount } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

const mockedFetchAllProductsFromDb =
  fetchAllProductsFromDb as jest.MockedFunction<typeof fetchAllProductsFromDb>;
const mockedGetEventCount = getEventCount as jest.MockedFunction<
  typeof getEventCount
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

describe("/api/db/fetch-products", () => {
  beforeEach(() => {
    mockedFetchAllProductsFromDb.mockReset();
    mockedGetEventCount.mockReset();
    mockedApplyRateLimit.mockReset();
    mockedApplyRateLimit.mockReturnValue(true);
    mockedFetchAllProductsFromDb.mockResolvedValue([]);
    mockedGetEventCount.mockResolvedValue(0);
  });

  it("returns 405 for non-GET requests", async () => {
    const res = createResponse();

    await handler(makeRequest({}, "POST"), res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: "Method not allowed" });
    expect(mockedFetchAllProductsFromDb).not.toHaveBeenCalled();
    expect(mockedGetEventCount).not.toHaveBeenCalled();
  });

  it("passes parsed array filters through to the db helpers", async () => {
    const res = createResponse();

    await handler(
      makeRequest({
        limit: "60",
        offset: "120",
        since: "100",
        until: "200",
        search: "hat",
        categories: "zapsnag,art",
        pubkey: ["pubkey-1", "pubkey-2"],
        location: "Delhi",
        excludePubkeys: ["blocked-1", "blocked-2"],
      }),
      res
    );

    expect(mockedFetchAllProductsFromDb).toHaveBeenCalledWith({
      limit: 60,
      offset: 120,
      since: 100,
      until: 200,
      search: "hat",
      categories: ["zapsnag", "art"],
      pubkey: ["pubkey-1", "pubkey-2"],
      location: "Delhi",
      excludePubkeys: ["blocked-1", "blocked-2"],
    });
    expect(mockedGetEventCount).toHaveBeenCalledWith({
      search: "hat",
      categories: ["zapsnag", "art"],
      pubkey: ["pubkey-1", "pubkey-2"],
      location: "Delhi",
      excludePubkeys: ["blocked-1", "blocked-2"],
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ events: [], total: 0 });
  });

  it("normalizes single-value arrays down to strings", async () => {
    const res = createResponse();

    await handler(
      makeRequest({
        pubkey: ["solo-pubkey"],
        categories: ["books"],
      }),
      res
    );

    expect(mockedFetchAllProductsFromDb).toHaveBeenCalledWith({
      limit: 500,
      offset: 0,
      since: undefined,
      until: undefined,
      pubkey: "solo-pubkey",
      search: undefined,
      categories: ["books"],
      location: undefined,
      excludePubkeys: undefined,
    });
    expect(mockedGetEventCount).toHaveBeenCalledWith({
      pubkey: "solo-pubkey",
      search: undefined,
      categories: ["books"],
      location: undefined,
      excludePubkeys: undefined,
    });
  });
});
