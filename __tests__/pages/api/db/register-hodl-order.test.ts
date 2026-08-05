const applyRateLimitMock = jest.fn();
const verifyNip98RequestMock = jest.fn();
const registerHodlEscrowOrderMock = jest.fn();
const fetchProductByIdFromDbMock = jest.fn();
const createHoldInvoiceMock = jest.fn();
const getHodlInvoiceProviderMock = jest.fn();

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));

jest.mock("@/utils/nostr/nip98-auth", () => ({
  verifyNip98Request: (...args: unknown[]) => verifyNip98RequestMock(...args),
}));

jest.mock("@/utils/db/db-service", () => ({
  registerHodlEscrowOrder: (...args: unknown[]) =>
    registerHodlEscrowOrderMock(...args),
  fetchProductByIdFromDb: (...args: unknown[]) =>
    fetchProductByIdFromDbMock(...args),
}));

jest.mock("@/utils/lightning/hodl-invoice-provider-registry", () => ({
  ...jest.requireActual("@/utils/lightning/hodl-invoice-provider-registry"),
  getHodlInvoiceProvider: (...args: unknown[]) =>
    getHodlInvoiceProviderMock(...args),
}));

import handler from "@/pages/api/db/register-hodl-order";
import { paymentHashFromPreimage } from "@/utils/lightning/payment-hash";
import { HodlInvoiceProviderUnavailableError } from "@/utils/lightning/hodl-invoice-provider-registry";

const BUYER_PUBKEY = "1".repeat(64);
const SELLER_PUBKEY = "2".repeat(64);
const ARBITER_PUBKEY = "a".repeat(64);
const PRODUCT_ID = "d".repeat(64);
const INVOICE = "lnbc420n1pjexample";

const validBody = { productId: PRODUCT_ID, amountSats: 42 };

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
  };
}

function createRequest(body: unknown = validBody) {
  return {
    method: "POST",
    headers: { authorization: "Nostr signed-event" },
    body,
  } as any;
}

/** The single registration argument the handler passed to the write layer. */
function registrationArg() {
  expect(registerHodlEscrowOrderMock).toHaveBeenCalledTimes(1);
  return registerHodlEscrowOrderMock.mock.calls[0][0];
}

describe("/api/db/register-hodl-order", () => {
  const originalArbiterPubkey = process.env.ARBITER_NOSTR_PUBKEY;
  const originalPublicArbiterPubkey =
    process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ARBITER_NOSTR_PUBKEY = ARBITER_PUBKEY;
    delete process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY;

    applyRateLimitMock.mockReturnValue(true);
    verifyNip98RequestMock.mockResolvedValue({
      ok: true,
      pubkey: BUYER_PUBKEY,
    });
    fetchProductByIdFromDbMock.mockResolvedValue({
      id: PRODUCT_ID,
      pubkey: SELLER_PUBKEY,
      kind: 30402,
      tags: [],
      content: "",
      created_at: 1,
      sig: "sig",
    });
    createHoldInvoiceMock.mockImplementation(
      async ({ paymentHash }: { paymentHash: string }) => ({
        invoice: INVOICE,
        paymentHash,
      })
    );
    getHodlInvoiceProviderMock.mockReturnValue({
      createHoldInvoice: createHoldInvoiceMock,
    });
    registerHodlEscrowOrderMock.mockResolvedValue("created");
  });

  afterAll(() => {
    if (originalArbiterPubkey === undefined) {
      delete process.env.ARBITER_NOSTR_PUBKEY;
    } else {
      process.env.ARBITER_NOSTR_PUBKEY = originalArbiterPubkey;
    }
    if (originalPublicArbiterPubkey === undefined) {
      delete process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY;
    } else {
      process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY =
        originalPublicArbiterPubkey;
    }
  });

  it("rejects unsupported methods", async () => {
    const res = createResponse();
    await handler({ method: "GET" } as any, res as any);

    expect(res.statusCode).toBe(405);
    expect(createHoldInvoiceMock).not.toHaveBeenCalled();
    expect(registerHodlEscrowOrderMock).not.toHaveBeenCalled();
  });

  it("rejects a request with no NIP-98 authorization", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: false,
      error: "Missing NIP-98 authorization header",
    });
    const res = createResponse();

    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(401);
    expect(createHoldInvoiceMock).not.toHaveBeenCalled();
    expect(registerHodlEscrowOrderMock).not.toHaveBeenCalled();
  });

  it("rejects a NIP-98 signature that does not cover this request body", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: false,
      error: "Authorization payload mismatch",
    });
    const req = createRequest();
    const res = createResponse();

    await handler(req, res as any);

    // The auth event is verified against the body, so productId/amountSats
    // cannot be swapped out after signing.
    expect(verifyNip98RequestMock).toHaveBeenCalledWith(req, "POST");
    expect(res.statusCode).toBe(401);
    expect(registerHodlEscrowOrderMock).not.toHaveBeenCalled();
  });

  it("refuses to create an invoice when no arbiter is configured", async () => {
    delete process.env.ARBITER_NOSTR_PUBKEY;
    const res = createResponse();

    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(500);
    // Checked before the invoice exists, so there is no unrecorded invoice.
    expect(createHoldInvoiceMock).not.toHaveBeenCalled();
    expect(registerHodlEscrowOrderMock).not.toHaveBeenCalled();
  });

  it("refuses when the configured arbiter pubkey is a placeholder", async () => {
    process.env.ARBITER_NOSTR_PUBKEY = "replace-with-arbiter-nostr-pubkey-hex";
    const res = createResponse();

    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(500);
    expect(createHoldInvoiceMock).not.toHaveBeenCalled();
  });

  it("reports escrow as unavailable when no provider is installed", async () => {
    getHodlInvoiceProviderMock.mockImplementation(() => {
      throw new HodlInvoiceProviderUnavailableError("none configured");
    });
    const res = createResponse();

    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(503);
    expect(registerHodlEscrowOrderMock).not.toHaveBeenCalled();
  });

  it("stores the authenticated buyer, not a pubkey from the body", async () => {
    const res = createResponse();

    await handler(createRequest(), res as any);

    expect(registrationArg().buyerNostrPubkey).toBe(BUYER_PUBKEY);
  });

  it("rejects a body that tries to name the buyer, seller, or arbiter", async () => {
    for (const override of [
      { buyerNostrPubkey: "9".repeat(64) },
      { sellerNostrPubkey: "9".repeat(64) },
      { arbiterNostrPubkey: "9".repeat(64) },
      { paymentHash: "9".repeat(64) },
      { preimage: "9".repeat(64) },
    ]) {
      jest.clearAllMocks();
      applyRateLimitMock.mockReturnValue(true);
      verifyNip98RequestMock.mockResolvedValue({
        ok: true,
        pubkey: BUYER_PUBKEY,
      });
      const res = createResponse();

      await handler(createRequest({ ...validBody, ...override }), res as any);

      // Rejected outright rather than ignored: a 201 here would confirm an
      // order whose parties are not the ones the caller sent.
      expect(res.statusCode).toBe(400);
      expect(createHoldInvoiceMock).not.toHaveBeenCalled();
      expect(registerHodlEscrowOrderMock).not.toHaveBeenCalled();
    }
  });

  it("takes the seller from the listing event's signer", async () => {
    const res = createResponse();

    await handler(createRequest(), res as any);

    expect(fetchProductByIdFromDbMock).toHaveBeenCalledWith(PRODUCT_ID, {
      rethrow: true,
    });
    expect(registrationArg().sellerNostrPubkey).toBe(SELLER_PUBKEY);
    expect(res.statusCode).toBe(201);
  });

  it("404s when the listing does not exist", async () => {
    fetchProductByIdFromDbMock.mockResolvedValue(null);
    const res = createResponse();

    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(404);
    expect(createHoldInvoiceMock).not.toHaveBeenCalled();
  });

  it("rejects an order where buyer and seller are the same key", async () => {
    fetchProductByIdFromDbMock.mockResolvedValue({
      id: PRODUCT_ID,
      pubkey: BUYER_PUBKEY,
    });
    const res = createResponse();

    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(400);
    expect(createHoldInvoiceMock).not.toHaveBeenCalled();
  });

  it("rejects an order whose seller is the arbiter", async () => {
    fetchProductByIdFromDbMock.mockResolvedValue({
      id: PRODUCT_ID,
      pubkey: ARBITER_PUBKEY,
    });
    const res = createResponse();

    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(400);
    expect(createHoldInvoiceMock).not.toHaveBeenCalled();
  });

  it("locks the invoice to a hash derived from a fresh 32-byte preimage", async () => {
    const res = createResponse();

    await handler(createRequest(), res as any);

    const registration = registrationArg();
    expect(registration.preimage).toMatch(/^[0-9a-f]{64}$/);
    expect(registration.paymentHash).toBe(
      paymentHashFromPreimage(registration.preimage)
    );
    expect(createHoldInvoiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentHash: registration.paymentHash,
        amountSats: 42,
      })
    );
    expect(res.jsonBody).toEqual({
      invoice: INVOICE,
      paymentHash: registration.paymentHash,
    });
  });

  it("generates a different preimage for every order", async () => {
    await handler(createRequest(), createResponse() as any);
    await handler(createRequest(), createResponse() as any);

    const [first, second] = registerHodlEscrowOrderMock.mock.calls.map(
      (call) => call[0].preimage
    );
    expect(first).not.toBe(second);
  });

  it("never puts the preimage in the response", async () => {
    const res = createResponse();

    await handler(createRequest(), res as any);

    const { preimage } = registrationArg();
    expect(Object.keys(res.jsonBody as object)).toEqual([
      "invoice",
      "paymentHash",
    ]);
    expect(JSON.stringify(res.jsonBody)).not.toContain(preimage);
  });

  it("creates the invoice before writing the row", async () => {
    const order: string[] = [];
    createHoldInvoiceMock.mockImplementation(
      async ({ paymentHash }: { paymentHash: string }) => {
        order.push("invoice");
        return { invoice: INVOICE, paymentHash };
      }
    );
    registerHodlEscrowOrderMock.mockImplementation(async () => {
      order.push("write");
      return "created";
    });

    await handler(createRequest(), createResponse() as any);

    expect(order).toEqual(["invoice", "write"]);
  });

  it("writes nothing when the hold invoice cannot be created", async () => {
    createHoldInvoiceMock.mockRejectedValue(new Error("node unreachable"));
    const res = createResponse();

    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(502);
    expect(registerHodlEscrowOrderMock).not.toHaveBeenCalled();
    expect(res.jsonBody).toEqual({ error: "Failed to create hold invoice" });
  });

  it("returns the invoice without a new row when the write is idempotent", async () => {
    registerHodlEscrowOrderMock.mockResolvedValue("existing");
    const res = createResponse();

    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({
      invoice: INVOICE,
      paymentHash: expect.any(String),
    });
  });

  it("409s when a different commitment already owns the payment hash", async () => {
    registerHodlEscrowOrderMock.mockResolvedValue("conflict");
    const res = createResponse();

    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(409);
    // No invoice is handed back for a hash the caller does not own.
    expect(res.jsonBody).not.toHaveProperty("invoice");
  });

  it("500s without leaking anything when the write throws", async () => {
    registerHodlEscrowOrderMock.mockRejectedValue(new Error("db down"));
    const res = createResponse();

    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody).toEqual({
      error: "Failed to register hodl escrow order",
    });
  });

  it.each([
    ["a non-hex product id", { productId: "not-a-product-id", amountSats: 42 }],
    ["a zero amount", { productId: PRODUCT_ID, amountSats: 0 }],
    ["a negative amount", { productId: PRODUCT_ID, amountSats: -42 }],
    ["a fractional amount", { productId: PRODUCT_ID, amountSats: 1.5 }],
    ["a string amount", { productId: PRODUCT_ID, amountSats: "42" }],
    ["a missing amount", { productId: PRODUCT_ID }],
    ["an array body", []],
    ["a null body", null],
  ])("rejects %s", async (_label, body) => {
    const res = createResponse();

    await handler(createRequest(body), res as any);

    expect(res.statusCode).toBe(400);
    expect(createHoldInvoiceMock).not.toHaveBeenCalled();
    expect(registerHodlEscrowOrderMock).not.toHaveBeenCalled();
  });
});
