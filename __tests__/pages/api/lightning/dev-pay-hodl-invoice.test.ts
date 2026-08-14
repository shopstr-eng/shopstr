const applyRateLimitMock = jest.fn();
const syncHodlOrderStatusMock = jest.fn();
const getHodlInvoiceProviderMock = jest.fn();

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));

// Redeclared rather than imported, on the same reasoning as the other hodl
// route tests: the real module pulls in pg. The handler narrows on
// `instanceof`, so this stand-in is what makes the 503 path reachable.
jest.mock("@/utils/db/db-service", () => {
  class DatabaseUnavailableError extends Error {
    constructor(message = "Database unavailable") {
      super(message);
      this.name = "DatabaseUnavailableError";
    }
  }
  return { DatabaseUnavailableError };
});

jest.mock("@/utils/lightning/hodl-status-sync", () => ({
  syncHodlOrderStatus: (...args: unknown[]) => syncHodlOrderStatusMock(...args),
}));

jest.mock("@/utils/lightning/hodl-invoice-provider-registry", () => ({
  ...jest.requireActual("@/utils/lightning/hodl-invoice-provider-registry"),
  getHodlInvoiceProvider: (...args: unknown[]) =>
    getHodlInvoiceProviderMock(...args),
}));

import handler from "@/pages/api/lightning/dev-pay-hodl-invoice";
import { DatabaseUnavailableError } from "@/utils/db/db-service";
import { HodlInvoiceProviderUnavailableError } from "@/utils/lightning/hodl-invoice-provider-registry";
import { MockHodlInvoiceProvider } from "@/utils/lightning/mock-hodl-invoice-provider";

const PAYMENT_HASH = "c".repeat(64);
const AMOUNT_SATS = 2100;

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
  body: unknown = { paymentHash: PAYMENT_HASH },
  method = "POST"
) {
  return { method, headers: {}, body } as any;
}

function setNodeEnv(value: string) {
  (process.env as Record<string, string>).NODE_ENV = value;
}

describe("/api/lightning/dev-pay-hodl-invoice", () => {
  let consoleErrorSpy: jest.SpyInstance;
  let provider: MockHodlInvoiceProvider;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    applyRateLimitMock.mockReturnValue(true);
    syncHodlOrderStatusMock.mockResolvedValue("accepted");

    provider = new MockHodlInvoiceProvider();
    await provider.createHoldInvoice({
      paymentHash: PAYMENT_HASH,
      amountSats: AMOUNT_SATS,
    });
    getHodlInvoiceProviderMock.mockReturnValue(provider);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    setNodeEnv(originalNodeEnv as string);
  });

  it("does not exist in a production build", async () => {
    setNodeEnv("production");

    const res = createResponse();
    await handler(createRequest(), res as any);

    // 404 rather than 403: a production deployment must be indistinguishable
    // from one where this route was never written.
    expect(res.statusCode).toBe(404);
    expect(res.jsonBody).toEqual({ error: "Not found" });
    expect(provider.getRecord(PAYMENT_HASH)?.status).toBe("open");
  });

  it("answers 404 in production even for a request that is otherwise wrong", async () => {
    setNodeEnv("production");

    const res = createResponse();
    await handler(createRequest(undefined, "GET"), res as any);

    // The method check runs after the environment check, so a probe cannot
    // learn the route exists by getting a 405 out of it.
    expect(res.statusCode).toBe(404);
  });

  it("rejects non-POST methods in development", async () => {
    const res = createResponse();
    await handler(createRequest(undefined, "GET"), res as any);

    expect(res.statusCode).toBe(405);
  });

  it("stops at the rate limiter", async () => {
    applyRateLimitMock.mockReturnValue(false);

    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(getHodlInvoiceProviderMock).not.toHaveBeenCalled();
    expect(provider.getRecord(PAYMENT_HASH)?.status).toBe("open");
  });

  it("rejects a malformed payment hash", async () => {
    const res = createResponse();
    await handler(createRequest({ paymentHash: "nope" }), res as any);

    expect(res.statusCode).toBe(400);
  });

  it("rejects a body carrying an unknown key", async () => {
    const res = createResponse();
    await handler(
      createRequest({ paymentHash: PAYMENT_HASH, amountSats: 1 }),
      res as any
    );

    expect(res.statusCode).toBe(400);
  });

  it("rejects an array body", async () => {
    const res = createResponse();
    await handler(createRequest([{ paymentHash: PAYMENT_HASH }]), res as any);

    expect(res.statusCode).toBe(400);
  });

  it("locks the invoice and reports the synced status", async () => {
    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ status: "accepted" });
    expect(provider.getRecord(PAYMENT_HASH)?.status).toBe("accepted");
  });

  it("syncs the order so accepted_at is stamped now, not whenever the sweep runs", async () => {
    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(syncHodlOrderStatusMock).toHaveBeenCalledWith(PAYMENT_HASH);
  });

  it("normalizes an uppercase payment hash", async () => {
    const res = createResponse();
    await handler(
      createRequest({ paymentHash: PAYMENT_HASH.toUpperCase() }),
      res as any
    );

    expect(res.statusCode).toBe(200);
    expect(syncHodlOrderStatusMock).toHaveBeenCalledWith(PAYMENT_HASH);
  });

  it("is idempotent for an invoice that is already accepted", async () => {
    const first = createResponse();
    await handler(createRequest(), first as any);
    const second = createResponse();
    await handler(createRequest(), second as any);

    expect(second.statusCode).toBe(200);
  });

  it("refuses a provider that is not the in-memory mock", async () => {
    getHodlInvoiceProviderMock.mockReturnValue({
      createHoldInvoice: jest.fn(),
      lookupInvoice: jest.fn(),
      settleInvoice: jest.fn(),
      cancelInvoice: jest.fn(),
    });

    const res = createResponse();
    await handler(createRequest(), res as any);

    // Second guard: even in development, a real Lightning backend must never
    // be told an unpaid invoice was paid.
    expect(res.statusCode).toBe(409);
    expect(syncHodlOrderStatusMock).not.toHaveBeenCalled();
  });

  it("reports escrow as unavailable when no provider is configured", async () => {
    getHodlInvoiceProviderMock.mockImplementation(() => {
      throw new HodlInvoiceProviderUnavailableError("none configured");
    });

    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(503);
  });

  it("reports a payment hash the mock never issued as the caller's mistake", async () => {
    const res = createResponse();
    await handler(createRequest({ paymentHash: "f".repeat(64) }), res as any);

    expect(res.statusCode).toBe(409);
    expect(res.jsonBody).toMatchObject({ reason: "invoice_not_found" });
    expect(syncHodlOrderStatusMock).not.toHaveBeenCalled();
  });

  it("refuses to pay an invoice that has already been cancelled", async () => {
    await provider.cancelInvoice(PAYMENT_HASH);

    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(409);
    expect(res.jsonBody).toMatchObject({
      reason: "invalid_state_transition",
    });
  });

  it("reports a database outage as retryable", async () => {
    syncHodlOrderStatusMock.mockRejectedValue(new DatabaseUnavailableError());

    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toMatchObject({ reason: "database_unavailable" });
  });

  it("reports an unexpected sync failure as a 500", async () => {
    syncHodlOrderStatusMock.mockRejectedValue(new Error("something broke"));

    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(500);
  });

  it("answers 404 when the invoice exists at the provider but has no order row", async () => {
    syncHodlOrderStatusMock.mockResolvedValue(null);

    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(404);
    // The invoice was still locked at the provider — the 404 is about the row.
    expect(provider.getRecord(PAYMENT_HASH)?.status).toBe("accepted");
  });
});
