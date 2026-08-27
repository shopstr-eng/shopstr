const applyRateLimitMock = jest.fn();
const verifyNip98RequestMock = jest.fn();
const registerHodlEscrowOrderMock = jest.fn();
const fetchProductByIdFromDbMock = jest.fn();
const fetchProductByDTagAndPubkeyMock = jest.fn();
const validateDiscountCodeMock = jest.fn();
const getSatoshiValueMock = jest.fn();
const createHoldInvoiceMock = jest.fn();
const getHodlInvoiceProviderMock = jest.fn();

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));

jest.mock("@/utils/nostr/nip98-auth", () => ({
  verifyNip98Request: (...args: unknown[]) => verifyNip98RequestMock(...args),
}));

// DatabaseUnavailableError is redeclared rather than imported from the real
// module (which drags in pg). The handler narrows on `instanceof`, so this
// stand-in is what makes the 503 path reachable under test.
jest.mock("@/utils/db/db-service", () => {
  class DatabaseUnavailableError extends Error {
    constructor(message = "Database unavailable") {
      super(message);
      this.name = "DatabaseUnavailableError";
    }
  }
  return {
    DatabaseUnavailableError,
    registerHodlEscrowOrder: (...args: unknown[]) =>
      registerHodlEscrowOrderMock(...args),
    fetchProductByIdFromDb: (...args: unknown[]) =>
      fetchProductByIdFromDbMock(...args),
    fetchProductByDTagAndPubkey: (...args: unknown[]) =>
      fetchProductByDTagAndPubkeyMock(...args),
    validateDiscountCode: (...args: unknown[]) =>
      validateDiscountCodeMock(...args),
  };
});

// Exchange-rate lookup used by the server-side re-pricing for non-sats
// listings. Sats-denominated fixtures never reach it.
jest.mock("@getalby/lightning-tools", () => ({
  getSatoshiValue: (...args: unknown[]) => getSatoshiValueMock(...args),
}));

// Pulled in transitively by listing-resolution -> mint-retry-service. Only the
// error classes are referenced at module load; nothing here is exercised.
jest.mock("@cashu/cashu-ts", () => {
  class HttpResponseError extends Error {}
  class RateLimitError extends Error {}
  return { HttpResponseError, RateLimitError };
});

jest.mock("@/utils/lightning/hodl-invoice-provider-registry", () => ({
  ...jest.requireActual("@/utils/lightning/hodl-invoice-provider-registry"),
  getHodlInvoiceProvider: (...args: unknown[]) =>
    getHodlInvoiceProviderMock(...args),
}));

import handler from "@/pages/api/db/register-hodl-order";
import { paymentHashFromPreimage } from "@/utils/lightning/payment-hash";
import { DatabaseUnavailableError } from "@/utils/db/db-service";
import { HodlInvoiceProviderUnavailableError } from "@/utils/lightning/hodl-invoice-provider-registry";

const BUYER_PUBKEY = "1".repeat(64);
const SELLER_PUBKEY = "2".repeat(64);
const ARBITER_PUBKEY = "a".repeat(64);
const PRODUCT_ID = "d".repeat(64);
const INVOICE = "lnbc420n1pjexample";

/**
 * A listing event the real parser accepts. Priced in sats so the server-side
 * re-pricing is fully deterministic and the client amount must match exactly.
 */
function makeProductEvent(
  overrides: {
    priceTag?: string[];
    currency?: string;
    extraTags?: string[][];
  } = {}
) {
  const priceTag = overrides.priceTag ?? [
    "price",
    "42",
    overrides.currency ?? "sats",
  ];
  return {
    id: PRODUCT_ID,
    pubkey: SELLER_PUBKEY,
    created_at: 1,
    kind: 30402,
    content: "",
    sig: "sig",
    tags: [
      ["title", "Escrow listing"],
      ["d", "hodl-listing-d"],
      priceTag,
      ...(overrides.extraTags ?? []),
    ],
  };
}

/** Points both the id lookup and the d-tag re-resolution at one event. */
function setListing(event: unknown) {
  fetchProductByIdFromDbMock.mockResolvedValue(event);
  fetchProductByDTagAndPubkeyMock.mockResolvedValue(event);
}

// amountSats matches makeProductEvent()'s 42-sat price; formType is always
// present in a real checkout (the mint-quote call would 400 without it).
const validBody = {
  productId: PRODUCT_ID,
  amountSats: 42,
  formType: "contact" as const,
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
    setListing(makeProductEvent());
    validateDiscountCodeMock.mockResolvedValue({
      valid: true,
      discount_percentage: 10,
    });
    getSatoshiValueMock.mockResolvedValue(0);
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

  it.each([
    ["unset", undefined],
    ["a placeholder", "replace-with-arbiter-nostr-pubkey-hex"],
  ])(
    "refuses to create an invoice when the arbiter is %s",
    async (_label, value) => {
      if (value === undefined) {
        delete process.env.ARBITER_NOSTR_PUBKEY;
      } else {
        process.env.ARBITER_NOSTR_PUBKEY = value;
      }
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(500);
      // Checked before the invoice exists, so there is no unrecorded invoice.
      expect(createHoldInvoiceMock).not.toHaveBeenCalled();
      expect(registerHodlEscrowOrderMock).not.toHaveBeenCalled();
    }
  );

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

  it("503s, not 404s, when the listing lookup hits a database outage", async () => {
    fetchProductByIdFromDbMock.mockRejectedValue(
      new DatabaseUnavailableError("Failed to fetch product by id")
    );
    const res = createResponse();

    await handler(createRequest(), res as any);

    // The listing was never read, so "not found" would be a claim about a
    // question nobody answered — and would send the buyer off to fix a
    // listing that is perfectly fine.
    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({
      error: "Service temporarily unavailable. Please try again.",
      reason: "database_unavailable",
    });
    // No invoice is created for an order that cannot be registered.
    expect(createHoldInvoiceMock).not.toHaveBeenCalled();
    expect(registerHodlEscrowOrderMock).not.toHaveBeenCalled();
  });

  it("500s when the listing lookup fails for an unrecognized reason", async () => {
    fetchProductByIdFromDbMock.mockRejectedValue(new Error("something else"));
    const res = createResponse();

    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody).toEqual({ error: "Failed to look up listing" });
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
    [
      "an unknown form type",
      { productId: PRODUCT_ID, amountSats: 42, formType: "bogus" },
    ],
    [
      "a zero bulk tier",
      { productId: PRODUCT_ID, amountSats: 42, selectedBulkOption: 0 },
    ],
    [
      "a fractional bulk tier",
      { productId: PRODUCT_ID, amountSats: 42, selectedBulkOption: 1.5 },
    ],
    [
      "a blank discount code",
      { productId: PRODUCT_ID, amountSats: 42, discountCode: "   " },
    ],
    ["an array body", []],
    ["a null body", null],
  ])("rejects %s", async (_label, body) => {
    const res = createResponse();

    await handler(createRequest(body), res as any);

    expect(res.statusCode).toBe(400);
    expect(createHoldInvoiceMock).not.toHaveBeenCalled();
    expect(registerHodlEscrowOrderMock).not.toHaveBeenCalled();
  });

  describe("server-side amount enforcement", () => {
    it("registers when the client amount matches the authoritative price", async () => {
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(201);
      // Re-priced from the listing, not taken on the buyer's word.
      expect(fetchProductByDTagAndPubkeyMock).toHaveBeenCalledWith(
        "hodl-listing-d",
        SELLER_PUBKEY,
        { rethrow: true }
      );
      expect(createHoldInvoiceMock).toHaveBeenCalledWith(
        expect.objectContaining({ amountSats: 42 })
      );
    });

    it("rejects a tampered amount and creates no invoice or row", async () => {
      const res = createResponse();

      await handler(
        createRequest({ ...validBody, amountSats: 41 }),
        res as any
      );

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toEqual({
        error: "Amount does not match the current listing price",
      });
      expect(createHoldInvoiceMock).not.toHaveBeenCalled();
      expect(registerHodlEscrowOrderMock).not.toHaveBeenCalled();
    });

    it("rejects a 1-sat amount against an expensive listing", async () => {
      setListing(makeProductEvent({ priceTag: ["price", "100000", "sats"] }));
      const res = createResponse();

      await handler(createRequest({ ...validBody, amountSats: 1 }), res as any);

      expect(res.statusCode).toBe(400);
      expect(createHoldInvoiceMock).not.toHaveBeenCalled();
      expect(registerHodlEscrowOrderMock).not.toHaveBeenCalled();
    });

    it("rejects an inflated amount against a cheap listing", async () => {
      setListing(makeProductEvent({ priceTag: ["price", "10", "sats"] }));
      const res = createResponse();

      await handler(
        createRequest({ ...validBody, amountSats: 1_000_000 }),
        res as any
      );

      expect(res.statusCode).toBe(400);
      expect(createHoldInvoiceMock).not.toHaveBeenCalled();
      expect(registerHodlEscrowOrderMock).not.toHaveBeenCalled();
    });

    it("cannot be bypassed by calling the route directly without a price quote", async () => {
      // No mint-quote round trip, just a hand-rolled body with a chosen
      // amount. The enforcement runs regardless of how the request was formed.
      setListing(makeProductEvent({ priceTag: ["price", "5000", "sats"] }));
      const res = createResponse();

      await handler(
        createRequest({
          productId: PRODUCT_ID,
          amountSats: 3,
          formType: "contact",
        }),
        res as any
      );

      expect(res.statusCode).toBe(400);
      expect(createHoldInvoiceMock).not.toHaveBeenCalled();
      expect(registerHodlEscrowOrderMock).not.toHaveBeenCalled();
    });

    it("applies the same discount math the checkout quote uses", async () => {
      setListing(makeProductEvent({ priceTag: ["price", "100", "sats"] }));
      validateDiscountCodeMock.mockResolvedValue({
        valid: true,
        discount_percentage: 10,
      });

      const accepted = createResponse();
      await handler(
        createRequest({
          ...validBody,
          amountSats: 90,
          discountCode: "SAVE10",
        }),
        accepted as any
      );

      expect(accepted.statusCode).toBe(201);
      expect(validateDiscountCodeMock).toHaveBeenCalledWith(
        "SAVE10",
        SELLER_PUBKEY,
        { rethrow: true }
      );
      expect(createHoldInvoiceMock).toHaveBeenCalledWith(
        expect.objectContaining({ amountSats: 90 })
      );

      // The undiscounted amount no longer matches once a valid code is applied.
      jest.clearAllMocks();
      applyRateLimitMock.mockReturnValue(true);
      verifyNip98RequestMock.mockResolvedValue({
        ok: true,
        pubkey: BUYER_PUBKEY,
      });
      setListing(makeProductEvent({ priceTag: ["price", "100", "sats"] }));
      validateDiscountCodeMock.mockResolvedValue({
        valid: true,
        discount_percentage: 10,
      });
      getHodlInvoiceProviderMock.mockReturnValue({
        createHoldInvoice: createHoldInvoiceMock,
      });

      const rejected = createResponse();
      await handler(
        createRequest({
          ...validBody,
          amountSats: 100,
          discountCode: "SAVE10",
        }),
        rejected as any
      );

      expect(rejected.statusCode).toBe(400);
      expect(createHoldInvoiceMock).not.toHaveBeenCalled();
    });

    it("prices the selected bulk tier, not the base price", async () => {
      setListing(
        makeProductEvent({
          priceTag: ["price", "100", "sats"],
          extraTags: [["bulk", "3", "250"]],
        })
      );

      const accepted = createResponse();
      await handler(
        createRequest({ ...validBody, amountSats: 250, selectedBulkOption: 3 }),
        accepted as any
      );

      expect(accepted.statusCode).toBe(201);
      expect(createHoldInvoiceMock).toHaveBeenCalledWith(
        expect.objectContaining({ amountSats: 250 })
      );

      jest.clearAllMocks();
      applyRateLimitMock.mockReturnValue(true);
      verifyNip98RequestMock.mockResolvedValue({
        ok: true,
        pubkey: BUYER_PUBKEY,
      });
      setListing(
        makeProductEvent({
          priceTag: ["price", "100", "sats"],
          extraTags: [["bulk", "3", "250"]],
        })
      );
      getHodlInvoiceProviderMock.mockReturnValue({
        createHoldInvoice: createHoldInvoiceMock,
      });

      const rejected = createResponse();
      await handler(
        createRequest({ ...validBody, amountSats: 100, selectedBulkOption: 3 }),
        rejected as any
      );

      expect(rejected.statusCode).toBe(400);
      expect(createHoldInvoiceMock).not.toHaveBeenCalled();
    });

    it("rejects an invalid discount code before any invoice exists", async () => {
      setListing(makeProductEvent({ priceTag: ["price", "100", "sats"] }));
      validateDiscountCodeMock.mockResolvedValue({ valid: false });
      const res = createResponse();

      await handler(
        createRequest({
          ...validBody,
          amountSats: 90,
          discountCode: "NOPE",
        }),
        res as any
      );

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toEqual({ error: "Invalid discount code" });
      expect(createHoldInvoiceMock).not.toHaveBeenCalled();
    });

    describe("fiat-denominated listings", () => {
      const usdListing = () =>
        makeProductEvent({ priceTag: ["price", "10", "USD"] });

      it("accepts an exact match to the fresh server conversion", async () => {
        setListing(usdListing());
        getSatoshiValueMock.mockResolvedValue(20000);
        const res = createResponse();

        await handler(
          createRequest({ ...validBody, amountSats: 20000 }),
          res as any
        );

        expect(res.statusCode).toBe(201);
        expect(getSatoshiValueMock).toHaveBeenCalledWith({
          amount: 10,
          currency: "USD",
        });
      });

      it("tolerates exchange-rate drift within max(2 sats, 1%)", async () => {
        setListing(usdListing());
        getSatoshiValueMock.mockResolvedValue(20000);
        const res = createResponse();

        // 150 sats below a 20000-sat conversion — inside the 200-sat band.
        await handler(
          createRequest({ ...validBody, amountSats: 19850 }),
          res as any
        );

        expect(res.statusCode).toBe(201);
      });

      it("rejects drift beyond the tolerance band", async () => {
        setListing(usdListing());
        getSatoshiValueMock.mockResolvedValue(20000);
        const res = createResponse();

        // 500 sats off — outside the 200-sat band.
        await handler(
          createRequest({ ...validBody, amountSats: 19500 }),
          res as any
        );

        expect(res.statusCode).toBe(400);
        expect(createHoldInvoiceMock).not.toHaveBeenCalled();
        expect(registerHodlEscrowOrderMock).not.toHaveBeenCalled();
      });
    });

    it("re-prices the latest listing event, not a stale one", async () => {
      fetchProductByIdFromDbMock.mockResolvedValue(
        makeProductEvent({ priceTag: ["price", "42", "sats"] })
      );
      // The d-tag re-resolution finds a newer, more expensive event.
      fetchProductByDTagAndPubkeyMock.mockResolvedValue(
        makeProductEvent({ priceTag: ["price", "999", "sats"] })
      );
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(400);
      expect(createHoldInvoiceMock).not.toHaveBeenCalled();
    });

    it("re-prices before generating a preimage or invoice", async () => {
      setListing(makeProductEvent({ priceTag: ["price", "500", "sats"] }));
      const res = createResponse();

      await handler(createRequest({ ...validBody, amountSats: 5 }), res as any);

      expect(res.statusCode).toBe(400);
      // The order of operations matters: nothing downstream of validation ran.
      expect(createHoldInvoiceMock).not.toHaveBeenCalled();
      expect(registerHodlEscrowOrderMock).not.toHaveBeenCalled();
    });
  });
});
