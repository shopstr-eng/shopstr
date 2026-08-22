const applyRateLimitMock = jest.fn();
const verifyNip98RequestMock = jest.fn();
const getHodlEscrowOrderPartiesMock = jest.fn();
const syncHodlOrderStatusMock = jest.fn();
const getHodlInvoiceProviderMock = jest.fn();

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));

jest.mock("@/utils/nostr/nip98-auth", () => ({
  verifyNip98Request: (...args: unknown[]) => verifyNip98RequestMock(...args),
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
  return {
    DatabaseUnavailableError,
    getHodlEscrowOrderParties: (...args: unknown[]) =>
      getHodlEscrowOrderPartiesMock(...args),
  };
});

jest.mock("@/utils/lightning/hodl-status-sync", () => ({
  syncHodlOrderStatus: (...args: unknown[]) => syncHodlOrderStatusMock(...args),
}));

jest.mock("@/utils/lightning/hodl-invoice-provider-registry", () => ({
  ...jest.requireActual("@/utils/lightning/hodl-invoice-provider-registry"),
  getHodlInvoiceProvider: (...args: unknown[]) =>
    getHodlInvoiceProviderMock(...args),
}));

import handler from "@/pages/api/lightning/hodl-order-status";
import { DatabaseUnavailableError } from "@/utils/db/db-service";
import { HodlInvoiceProviderUnavailableError } from "@/utils/lightning/hodl-invoice-provider-registry";

const PAYMENT_HASH = "b".repeat(64);
const BUYER_PUBKEY = "1".repeat(64);
const SELLER_PUBKEY = "2".repeat(64);
const ARBITER_PUBKEY = "a".repeat(64);
const STRANGER_PUBKEY = "e".repeat(64);

const ORDER_PARTIES = {
  paymentHash: PAYMENT_HASH,
  buyerNostrPubkey: BUYER_PUBKEY,
  sellerNostrPubkey: SELLER_PUBKEY,
  arbiterNostrPubkey: ARBITER_PUBKEY,
};

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
  query: Record<string, unknown> = { paymentHash: PAYMENT_HASH },
  method = "GET"
) {
  return { method, headers: {}, query } as any;
}

describe("/api/lightning/hodl-order-status", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    applyRateLimitMock.mockReturnValue(true);
    verifyNip98RequestMock.mockResolvedValue({
      ok: true,
      pubkey: BUYER_PUBKEY,
    });
    getHodlEscrowOrderPartiesMock.mockResolvedValue(ORDER_PARTIES);
    syncHodlOrderStatusMock.mockResolvedValue("accepted");
    getHodlInvoiceProviderMock.mockReturnValue({});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("rejects non-GET methods", async () => {
    const res = createResponse();
    await handler(createRequest(undefined, "POST"), res as any);

    expect(res.statusCode).toBe(405);
  });

  it("rejects a request whose NIP-98 authorization does not verify", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: false,
      error: "Authorization event expired",
    });

    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(401);
    expect(getHodlEscrowOrderPartiesMock).not.toHaveBeenCalled();
  });

  it("verifies the authorization as a GET, so no payload hash is demanded", async () => {
    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(verifyNip98RequestMock).toHaveBeenCalledWith(
      expect.anything(),
      "GET"
    );
  });

  it("rejects a malformed payment hash before touching the database", async () => {
    const res = createResponse();
    await handler(createRequest({ paymentHash: "not-a-hash" }), res as any);

    expect(res.statusCode).toBe(400);
    expect(getHodlEscrowOrderPartiesMock).not.toHaveBeenCalled();
  });

  it("rejects a repeated paymentHash query parameter", async () => {
    const res = createResponse();
    await handler(
      createRequest({ paymentHash: [PAYMENT_HASH, PAYMENT_HASH] }),
      res as any
    );

    expect(res.statusCode).toBe(400);
  });

  it("reports the status and role to the committed buyer", async () => {
    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ status: "accepted", role: "buyer" });
  });

  it("reports the seller's role when the seller asks", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: true,
      pubkey: SELLER_PUBKEY,
    });

    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ status: "accepted", role: "seller" });
  });

  it("syncs the order before reporting, so reading a status also advances it", async () => {
    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(syncHodlOrderStatusMock).toHaveBeenCalledWith(PAYMENT_HASH);
    expect(res.jsonBody).toEqual({ status: "accepted", role: "buyer" });
  });

  it("normalizes an uppercase payment hash before looking it up", async () => {
    const res = createResponse();
    await handler(
      createRequest({ paymentHash: PAYMENT_HASH.toUpperCase() }),
      res as any
    );

    expect(getHodlEscrowOrderPartiesMock).toHaveBeenCalledWith(PAYMENT_HASH);
    expect(syncHodlOrderStatusMock).toHaveBeenCalledWith(PAYMENT_HASH);
  });

  it.each([
    ["a stranger", STRANGER_PUBKEY],
    ["the arbiter", ARBITER_PUBKEY],
  ])(
    "answers 404 — not 403 — to a caller (%s) who is neither buyer nor seller",
    async (_label, pubkey) => {
      verifyNip98RequestMock.mockResolvedValue({ ok: true, pubkey });

      const res = createResponse();
      await handler(createRequest(), res as any);

      // A 403 would confirm the order exists. Payment hashes are unguessable
      // precisely so they cannot be enumerated; a distinguishable response for
      // "real order, not yours" would undo that.
      expect(res.statusCode).toBe(404);
    }
  );

  it("does not sync an order the caller is not party to", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: true,
      pubkey: STRANGER_PUBKEY,
    });

    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(syncHodlOrderStatusMock).not.toHaveBeenCalled();
  });

  it("answers 404 for a payment hash that was never registered", async () => {
    getHodlEscrowOrderPartiesMock.mockResolvedValue(null);

    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(404);
    expect(syncHodlOrderStatusMock).not.toHaveBeenCalled();
  });

  it("answers 404 when the row disappears between the two reads", async () => {
    syncHodlOrderStatusMock.mockResolvedValue(null);

    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(404);
  });

  it("reports a database outage as retryable rather than as 'no such order'", async () => {
    getHodlEscrowOrderPartiesMock.mockRejectedValue(
      new DatabaseUnavailableError()
    );

    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toMatchObject({ reason: "database_unavailable" });
  });

  it("reports a database outage during the sync as retryable too", async () => {
    syncHodlOrderStatusMock.mockRejectedValue(new DatabaseUnavailableError());

    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toMatchObject({ reason: "database_unavailable" });
  });

  it("reports a missing provider as escrow being unavailable", async () => {
    getHodlInvoiceProviderMock.mockImplementation(() => {
      throw new HodlInvoiceProviderUnavailableError("none configured");
    });

    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({
      error: "Lightning escrow is not available",
    });
  });

  it("reports a provider lookup failure as a 502, not a 404", async () => {
    syncHodlOrderStatusMock.mockRejectedValue(new Error("lnd timed out"));

    const res = createResponse();
    await handler(createRequest(), res as any);

    // "We could not ask the node" must not read as "this order has no status".
    expect(res.statusCode).toBe(502);
  });

  it("stops at the rate limiter without authenticating", async () => {
    applyRateLimitMock.mockReturnValue(false);

    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(verifyNip98RequestMock).not.toHaveBeenCalled();
    expect(getHodlEscrowOrderPartiesMock).not.toHaveBeenCalled();
  });

  it("does not leak the counterparty's pubkey to the caller", async () => {
    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(JSON.stringify(res.jsonBody)).not.toContain(SELLER_PUBKEY);
    expect(JSON.stringify(res.jsonBody)).not.toContain(ARBITER_PUBKEY);
  });
});
