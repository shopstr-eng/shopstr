const applyRateLimitMock = jest.fn();
const syncAllPendingHodlOrdersMock = jest.fn();
const getHodlInvoiceProviderMock = jest.fn();

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));

jest.mock("@/utils/lightning/hodl-status-sync", () => ({
  syncAllPendingHodlOrders: (...args: unknown[]) =>
    syncAllPendingHodlOrdersMock(...args),
}));

jest.mock("@/utils/lightning/hodl-invoice-provider-registry", () => ({
  ...jest.requireActual("@/utils/lightning/hodl-invoice-provider-registry"),
  getHodlInvoiceProvider: (...args: unknown[]) =>
    getHodlInvoiceProviderMock(...args),
}));

import handler from "@/pages/api/lightning/sync-hodl-orders";
import { HodlInvoiceProviderUnavailableError } from "@/utils/lightning/hodl-invoice-provider-registry";

const CRON_SECRET = "a-long-random-cron-secret";

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
  headers: Record<string, string> = { authorization: `Bearer ${CRON_SECRET}` },
  method = "POST"
) {
  return { method, headers } as any;
}

describe("/api/lightning/sync-hodl-orders", () => {
  let consoleErrorSpy: jest.SpyInstance;
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    process.env.CRON_SECRET = CRON_SECRET;
    applyRateLimitMock.mockReturnValue(true);
    getHodlInvoiceProviderMock.mockReturnValue({});
    syncAllPendingHodlOrdersMock.mockResolvedValue([]);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }
  });

  it("rejects non-POST methods", async () => {
    const res = createResponse();
    await handler(createRequest(undefined, "GET"), res as any);

    expect(res.statusCode).toBe(405);
    expect(syncAllPendingHodlOrdersMock).not.toHaveBeenCalled();
  });

  it("stops at the rate limiter before checking the secret", async () => {
    applyRateLimitMock.mockReturnValue(false);

    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(syncAllPendingHodlOrdersMock).not.toHaveBeenCalled();
  });

  it("refuses every caller when CRON_SECRET is unset, rather than defaulting open", async () => {
    delete process.env.CRON_SECRET;

    const res = createResponse();
    await handler(createRequest({ authorization: "Bearer " }), res as any);

    expect(res.statusCode).toBe(401);
    expect(syncAllPendingHodlOrdersMock).not.toHaveBeenCalled();
  });

  it("rejects a request with no authorization header", async () => {
    const res = createResponse();
    await handler(createRequest({}), res as any);

    expect(res.statusCode).toBe(401);
  });

  it("rejects a non-Bearer authorization scheme carrying the right secret", async () => {
    const res = createResponse();
    await handler(createRequest({ authorization: CRON_SECRET }), res as any);

    expect(res.statusCode).toBe(401);
  });

  it("rejects a wrong secret of the same length", async () => {
    const res = createResponse();
    await handler(
      {
        method: "POST",
        headers: { authorization: `Bearer ${"b".repeat(CRON_SECRET.length)}` },
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(401);
  });

  it("rejects a secret of a different length without throwing", async () => {
    // timingSafeEqual throws on unequal buffer lengths, so the length check has
    // to happen first; a throw here would surface as a 500, not a 401.
    const res = createResponse();
    await handler(
      { method: "POST", headers: { authorization: "Bearer short" } } as any,
      res as any
    );

    expect(res.statusCode).toBe(401);
  });

  it("rejects a secret that merely prefixes the configured one", async () => {
    const res = createResponse();
    await handler(
      {
        method: "POST",
        headers: { authorization: `Bearer ${CRON_SECRET.slice(0, -1)}` },
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(401);
  });

  it("runs the sweep for an authorized caller", async () => {
    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(200);
    expect(syncAllPendingHodlOrdersMock).toHaveBeenCalledTimes(1);
  });

  it("reports how many orders were swept and how many failed", async () => {
    syncAllPendingHodlOrdersMock.mockResolvedValue([
      { paymentHash: "a".repeat(64), ok: true, status: "accepted" },
      { paymentHash: "b".repeat(64), ok: true, status: null },
      { paymentHash: "c".repeat(64), ok: false },
    ]);

    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.jsonBody).toEqual({ total: 3, synced: 2, failed: 1 });
  });

  it("reports zeroes when nothing was pending", async () => {
    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.jsonBody).toEqual({ total: 0, synced: 0, failed: 0 });
  });

  it("never names the orders it swept", async () => {
    const paymentHash = "d".repeat(64);
    syncAllPendingHodlOrdersMock.mockResolvedValue([
      { paymentHash, ok: true, status: "accepted" },
    ]);

    const res = createResponse();
    await handler(createRequest(), res as any);

    // Payment hashes are unguessable identifiers that authorize a status
    // lookup; a sweep report listing them would hand them out in bulk.
    expect(JSON.stringify(res.jsonBody)).not.toContain(paymentHash);
  });

  it("reports escrow as unavailable when no provider is configured", async () => {
    getHodlInvoiceProviderMock.mockImplementation(() => {
      throw new HodlInvoiceProviderUnavailableError("none configured");
    });

    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(503);
    expect(syncAllPendingHodlOrdersMock).not.toHaveBeenCalled();
  });

  it("reports a failure to start the batch as retryable", async () => {
    syncAllPendingHodlOrdersMock.mockRejectedValue(new Error("db is down"));

    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toMatchObject({ reason: "database_unavailable" });
  });

  it("does not leak the underlying error to the caller", async () => {
    syncAllPendingHodlOrdersMock.mockRejectedValue(
      new Error("connect ECONNREFUSED 10.0.0.4:5432")
    );

    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(JSON.stringify(res.jsonBody)).not.toContain("10.0.0.4");
  });
});
