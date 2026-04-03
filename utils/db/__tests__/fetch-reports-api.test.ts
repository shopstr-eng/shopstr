import type { NextApiRequest, NextApiResponse } from "next";
import handler from "@/pages/api/db/fetch-reports";
import { fetchAllReportsFromDb } from "@/utils/db/db-service";

jest.mock("@/utils/db/db-service", () => ({
  fetchAllReportsFromDb: jest.fn(),
}));

const mockFetchAllReportsFromDb = fetchAllReportsFromDb as jest.Mock;

function createMockRes() {
  const status = jest.fn().mockReturnThis();
  const json = jest.fn().mockReturnThis();
  return { status, json } as unknown as NextApiResponse;
}

describe("/api/db/fetch-reports", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 405 for non-GET requests", async () => {
    const req = { method: "POST" } as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: "Method not allowed" });
  });

  it("returns reports from db for GET requests", async () => {
    const reports = [
      {
        id: "report-1",
        pubkey: "reporter",
        created_at: 10,
        kind: 1984,
        tags: [["p", "target", "spam"]],
        content: "details",
        sig: "sig",
      },
    ];

    mockFetchAllReportsFromDb.mockResolvedValue(reports);

    const req = { method: "GET" } as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);

    expect(mockFetchAllReportsFromDb).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(reports);
  });

  it("returns 500 when db fetch fails", async () => {
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockFetchAllReportsFromDb.mockRejectedValue(new Error("db error"));

    const req = { method: "GET" } as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to fetch reports" });

    consoleSpy.mockRestore();
  });
});
