const applyRateLimitMock = jest.fn();
const fetchHodlConfirmEventsMock = jest.fn();
const getHodlEscrowOrderPartiesMock = jest.fn();
const getHodlEscrowSettlementSecretMock = jest.fn();
const markHodlEscrowOrderSettledMock = jest.fn();
const settleInvoiceMock = jest.fn();
const getHodlInvoiceProviderMock = jest.fn();
const nostrCloseMock = jest.fn();

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));

// The error classes are redeclared rather than imported from the real modules
// (which drag in pg and the relay pool). The handler narrows on `instanceof`,
// so these stand-ins are what make the 503 paths reachable under test.
jest.mock("@/utils/nostr/hodl-escrow-records", () => {
  class HodlRelayUnavailableError extends Error {
    reason: string;
    constructor(params: { reason: string; message: string }) {
      super(params.message);
      this.name = "HodlRelayUnavailableError";
      this.reason = params.reason;
    }
  }
  return {
    HodlRelayUnavailableError,
    fetchHodlConfirmEvents: (...args: unknown[]) =>
      fetchHodlConfirmEventsMock(...args),
  };
});

// Only the database is faked. The authorization module underneath runs for
// real against these rows, so "an authorized confirmation" in these tests
// means the genuine pubkey comparison passed — not that a mock said yes.
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
    getHodlEscrowSettlementSecret: (...args: unknown[]) =>
      getHodlEscrowSettlementSecretMock(...args),
    markHodlEscrowOrderSettled: (...args: unknown[]) =>
      markHodlEscrowOrderSettledMock(...args),
  };
});

jest.mock("@/utils/lightning/hodl-invoice-provider-registry", () => ({
  ...jest.requireActual("@/utils/lightning/hodl-invoice-provider-registry"),
  getHodlInvoiceProvider: (...args: unknown[]) =>
    getHodlInvoiceProviderMock(...args),
}));

jest.mock("@/utils/nostr/nostr-manager", () => ({
  NostrManager: class {
    close() {
      nostrCloseMock();
    }
  },
}));

jest.mock("@/utils/nostr/relay-config", () => ({
  getDefaultRelays: () => ["wss://relay.example"],
  withBlastr: (relays: string[]) => relays,
}));

import handler from "@/pages/api/lightning/settle-hodl-invoice";
import type { ParsedHodlConfirmEvent } from "@/utils/nostr/hodl-escrow-records";
import { HodlRelayUnavailableError } from "@/utils/nostr/hodl-escrow-records";
import { DatabaseUnavailableError } from "@/utils/db/db-service";
import { HodlInvoiceError } from "@/utils/lightning/hodl-invoice-provider";
import { HodlInvoiceProviderUnavailableError } from "@/utils/lightning/hodl-invoice-provider-registry";

/** What a relay outage looks like coming out of fetchHodlConfirmEvents. */
const relayOutage = () =>
  new HodlRelayUnavailableError({
    reason: "relay_connection_failure",
    message: "Could not reach relays to look up buyer confirmations",
  });

const PAYMENT_HASH = "b".repeat(64);
const OTHER_PAYMENT_HASH = "c".repeat(64);
const BUYER_PUBKEY = "1".repeat(64);
const SELLER_PUBKEY = "2".repeat(64);
const ARBITER_PUBKEY = "a".repeat(64);
const IMPOSTOR_PUBKEY = "e".repeat(64);

/** Distinctive on purpose: every leak assertion greps output for this string. */
const PREIMAGE = "abad1dea".repeat(8);

const ORDER_PARTIES = {
  paymentHash: PAYMENT_HASH,
  buyerNostrPubkey: BUYER_PUBKEY,
  sellerNostrPubkey: SELLER_PUBKEY,
  arbiterNostrPubkey: ARBITER_PUBKEY,
};

function confirmEvent(
  overrides: Partial<ParsedHodlConfirmEvent> = {}
): ParsedHodlConfirmEvent {
  return {
    orderId: PAYMENT_HASH,
    authorPubkey: BUYER_PUBKEY,
    note: "received, thanks",
    createdAt: 1_700_000_000,
    ...overrides,
  };
}

/** What relays actually hand back: the buyer's event buried among forgeries. */
function candidatesWithGenuineBuyerEvent(): ParsedHodlConfirmEvent[] {
  return [
    confirmEvent({ authorPubkey: IMPOSTOR_PUBKEY, createdAt: 1_700_000_900 }),
    confirmEvent({ authorPubkey: "d".repeat(64), createdAt: 1_700_000_500 }),
    confirmEvent(),
  ];
}

function createResponse() {
  return {
    statusCode: 200,
    jsonBody: undefined as unknown,
    headers: {} as Record<string, unknown>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.jsonBody = payload;
      return this;
    },
    setHeader(name: string, value: unknown) {
      this.headers[name] = value;
      return this;
    },
  };
}

function createRequest(body: unknown = { paymentHash: PAYMENT_HASH }) {
  return { method: "POST", headers: {}, body } as any;
}

/** Everything the handler wrote anywhere, as one searchable string. */
function loggedOutput(spy: jest.SpyInstance): string {
  return spy.mock.calls
    .map((call) =>
      call
        .map((arg: unknown) =>
          arg instanceof Error
            ? `${arg.name}: ${arg.message}\n${arg.stack ?? ""}`
            : typeof arg === "string"
              ? arg
              : JSON.stringify(arg)
        )
        .join(" ")
    )
    .join("\n");
}

describe("/api/lightning/settle-hodl-invoice", () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let callOrder: string[];

  beforeEach(() => {
    jest.clearAllMocks();
    callOrder = [];

    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    applyRateLimitMock.mockReturnValue(true);
    getHodlEscrowOrderPartiesMock.mockResolvedValue(ORDER_PARTIES);
    getHodlEscrowSettlementSecretMock.mockImplementation(async () => {
      callOrder.push("readSecret");
      return PREIMAGE;
    });
    fetchHodlConfirmEventsMock.mockResolvedValue(
      candidatesWithGenuineBuyerEvent()
    );
    settleInvoiceMock.mockImplementation(async () => {
      callOrder.push("settleInvoice");
    });
    markHodlEscrowOrderSettledMock.mockImplementation(async () => {
      callOrder.push("markSettled");
      return "settled";
    });
    getHodlInvoiceProviderMock.mockReturnValue({
      settleInvoice: settleInvoiceMock,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Fails if the settlement secret escaped into a response or the logs. */
  function expectNoPreimageLeak(res: ReturnType<typeof createResponse>) {
    const body = JSON.stringify(res.jsonBody ?? null);
    expect(body).not.toContain(PREIMAGE);

    for (const spy of [consoleErrorSpy, consoleLogSpy, consoleWarnSpy]) {
      expect(loggedOutput(spy)).not.toContain(PREIMAGE);
    }
  }

  describe("settling", () => {
    it("settles when the order's real buyer confirmed among the candidates", async () => {
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toEqual({ status: "settled" });
      expect(settleInvoiceMock).toHaveBeenCalledTimes(1);
      expect(settleInvoiceMock).toHaveBeenCalledWith(PREIMAGE);
      expect(markHodlEscrowOrderSettledMock).toHaveBeenCalledWith(PAYMENT_HASH);
      expectNoPreimageLeak(res);
    });

    it("looks up confirmations server-side from the payment hash alone", async () => {
      await handler(createRequest(), createResponse() as any);

      expect(fetchHodlConfirmEventsMock).toHaveBeenCalledTimes(1);
      const [args] = fetchHodlConfirmEventsMock.mock.calls[0];
      expect(args.paymentHash).toBe(PAYMENT_HASH);
      // No event, pubkey, or confirmation claim is forwarded from the caller.
      expect(Object.keys(args).sort()).toEqual([
        "nostr",
        "paymentHash",
        "timeoutMs",
      ]);
      expect(nostrCloseMock).toHaveBeenCalledTimes(1);
    });

    it("accepts a mixed-case payment hash and normalizes it", async () => {
      const res = createResponse();

      await handler(
        createRequest({ paymentHash: PAYMENT_HASH.toUpperCase() }),
        res as any
      );

      expect(res.statusCode).toBe(200);
      expect(markHodlEscrowOrderSettledMock).toHaveBeenCalledWith(PAYMENT_HASH);
    });
  });

  describe("authorization", () => {
    it("rejects with 403 when no candidate is signed by the buyer", async () => {
      fetchHodlConfirmEventsMock.mockResolvedValue([
        confirmEvent({ authorPubkey: IMPOSTOR_PUBKEY }),
        confirmEvent({ authorPubkey: SELLER_PUBKEY }),
      ]);
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(403);
      expect(res.jsonBody).toEqual({
        error: "No confirmation for this order was signed by its buyer",
        reason: "pubkey_mismatch",
      });
      expect(settleInvoiceMock).not.toHaveBeenCalled();
      expect(markHodlEscrowOrderSettledMock).not.toHaveBeenCalled();
      // The secret is not even read on a path that cannot settle.
      expect(getHodlEscrowSettlementSecretMock).not.toHaveBeenCalled();
      expectNoPreimageLeak(res);
    });

    it("rejects with 403 when a seller self-confirms their own order", async () => {
      fetchHodlConfirmEventsMock.mockResolvedValue([
        confirmEvent({ authorPubkey: SELLER_PUBKEY }),
      ]);
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(403);
      expect(settleInvoiceMock).not.toHaveBeenCalled();
    });

    it("rejects with 403 when relays return no confirmations at all", async () => {
      fetchHodlConfirmEventsMock.mockResolvedValue([]);
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(403);
      expect(res.jsonBody).toEqual({
        error: "No buyer confirmation has been published for this order",
        reason: "no_confirmation",
      });
      expect(settleInvoiceMock).not.toHaveBeenCalled();
      expect(getHodlEscrowSettlementSecretMock).not.toHaveBeenCalled();
    });

    it("rejects a confirmation that belongs to a different order", async () => {
      fetchHodlConfirmEventsMock.mockResolvedValue([
        confirmEvent({ orderId: OTHER_PAYMENT_HASH }),
      ]);
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(403);
      expect(res.jsonBody).toEqual({
        error: "Confirmation events do not belong to this order",
        reason: "order_mismatch",
      });
      expect(settleInvoiceMock).not.toHaveBeenCalled();
    });

    it("stops at the first candidate that authorizes", async () => {
      fetchHodlConfirmEventsMock.mockResolvedValue([
        confirmEvent(),
        confirmEvent({ createdAt: 1_700_000_001 }),
      ]);

      await handler(createRequest(), createResponse() as any);

      expect(settleInvoiceMock).toHaveBeenCalledTimes(1);
      expect(markHodlEscrowOrderSettledMock).toHaveBeenCalledTimes(1);
    });

    it("rejects when the order does not exist", async () => {
      getHodlEscrowOrderPartiesMock.mockResolvedValue(null);
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(404);
      expect(res.jsonBody).toEqual({
        error: "No escrow order exists for this payment hash",
        reason: "no_such_order",
      });
      // Nothing is looked up, read, or settled for an order that never existed.
      expect(fetchHodlConfirmEventsMock).not.toHaveBeenCalled();
      expect(getHodlEscrowSettlementSecretMock).not.toHaveBeenCalled();
      expect(settleInvoiceMock).not.toHaveBeenCalled();
      expect(markHodlEscrowOrderSettledMock).not.toHaveBeenCalled();
      expectNoPreimageLeak(res);
    });

    it("rejects when the order disappears between the lookup and authorization", async () => {
      getHodlEscrowOrderPartiesMock
        .mockResolvedValueOnce(ORDER_PARTIES)
        .mockResolvedValue(null);
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(404);
      expect(res.jsonBody).toEqual({
        error: "No escrow order exists for this payment hash",
        reason: "no_such_order",
      });
      expect(settleInvoiceMock).not.toHaveBeenCalled();
    });

    // An unrecognized failure stays a 500 — see the "infrastructure failures
    // are not verdicts" block below for the typed DatabaseUnavailableError
    // case, which is a 503. Either way it is never an authorization verdict.
    it("reports an unrecognized database failure as a server error, not as an unauthorized settle", async () => {
      getHodlEscrowOrderPartiesMock
        .mockResolvedValueOnce(ORDER_PARTIES)
        .mockRejectedValue(new Error("db down"));
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(500);
      expect(settleInvoiceMock).not.toHaveBeenCalled();
    });
  });

  describe("settlement ordering", () => {
    it("marks the order settled only after the provider call resolves", async () => {
      let releaseSettle: (() => void) | undefined;
      let signalStarted: (() => void) | undefined;
      const settleStarted = new Promise<void>((resolve) => {
        signalStarted = resolve;
      });
      settleInvoiceMock.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            callOrder.push("settleInvoice:started");
            releaseSettle = () => {
              callOrder.push("settleInvoice:resolved");
              resolve();
            };
            signalStarted!();
          })
      );

      const res = createResponse();
      const pending = handler(createRequest(), res as any);
      // Waits on the provider actually being called rather than on a guessed
      // number of microtask ticks, so the assertion below cannot pass merely
      // because the handler had not got that far yet.
      await settleStarted;

      // The provider is mid-flight: nothing may claim the invoice is settled.
      expect(settleInvoiceMock).toHaveBeenCalledTimes(1);
      expect(markHodlEscrowOrderSettledMock).not.toHaveBeenCalled();

      releaseSettle!();
      await pending;

      expect(markHodlEscrowOrderSettledMock).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual([
        "readSecret",
        "settleInvoice:started",
        "settleInvoice:resolved",
        "markSettled",
      ]);
      expect(res.statusCode).toBe(200);
    });

    it("leaves the status untouched when the provider throws", async () => {
      settleInvoiceMock.mockRejectedValue(
        new HodlInvoiceError(
          "invalid_state_transition",
          'Cannot settle an invoice in state "open"'
        )
      );
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(502);
      expect(res.jsonBody).toEqual({ error: "Failed to settle hold invoice" });
      expect(markHodlEscrowOrderSettledMock).not.toHaveBeenCalled();
      expectNoPreimageLeak(res);
    });

    it("reports a failure when the invoice settled but the row could not be updated", async () => {
      markHodlEscrowOrderSettledMock.mockRejectedValue(new Error("db down"));
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(settleInvoiceMock).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(500);
      expect(res.jsonBody).toEqual({
        error: "Invoice settled but the order could not be updated",
      });
      expectNoPreimageLeak(res);
    });

    it("reports a failure when the row vanished before it could be marked settled", async () => {
      markHodlEscrowOrderSettledMock.mockResolvedValue("not-found");
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(500);
      expect(res.jsonBody).toEqual({
        error: "Invoice settled but the order could not be updated",
      });
    });

    it("does not settle when the stored secret is missing", async () => {
      getHodlEscrowSettlementSecretMock.mockResolvedValue(null);
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(500);
      expect(res.jsonBody).toEqual({ error: "Failed to settle escrow order" });
      expect(settleInvoiceMock).not.toHaveBeenCalled();
      expect(markHodlEscrowOrderSettledMock).not.toHaveBeenCalled();
    });
  });

  describe("preimage confidentiality", () => {
    it("keeps the preimage out of a provider error that quotes it verbatim", async () => {
      // A real backend's HTTP client happily echoes the request body it sent.
      settleInvoiceMock.mockRejectedValue(
        new Error(
          `settle failed: POST /v2/invoices/settle {"preimage":"${PREIMAGE}"}`
        )
      );
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(502);
      expectNoPreimageLeak(res);
      // Redacted rather than dropped: the failure is still diagnosable.
      expect(loggedOutput(consoleErrorSpy)).toContain("[redacted]");
      expect(loggedOutput(consoleErrorSpy)).toContain("settle failed");
    });

    it("keeps the preimage out of an uppercased provider error", async () => {
      settleInvoiceMock.mockRejectedValue(
        new Error(`rejected preimage ${PREIMAGE.toUpperCase()}`)
      );
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(loggedOutput(consoleErrorSpy)).not.toContain(
        PREIMAGE.toUpperCase()
      );
      expectNoPreimageLeak(res);
    });

    it.each([
      ["a successful settle", () => {}],
      [
        "an unauthorized settle",
        () => {
          fetchHodlConfirmEventsMock.mockResolvedValue([
            confirmEvent({ authorPubkey: IMPOSTOR_PUBKEY }),
          ]);
        },
      ],
      [
        "a missing order",
        () => {
          getHodlEscrowOrderPartiesMock.mockResolvedValue(null);
        },
      ],
      [
        "a relay lookup failure",
        () => {
          fetchHodlConfirmEventsMock.mockRejectedValue(
            new Error("relays down")
          );
        },
      ],
      [
        "a provider failure",
        () => {
          settleInvoiceMock.mockRejectedValue(new Error(`boom ${PREIMAGE}`));
        },
      ],
      [
        "a status update failure",
        () => {
          markHodlEscrowOrderSettledMock.mockRejectedValue(
            new Error(`db down ${PREIMAGE}`)
          );
        },
      ],
      [
        "an invalid request",
        () => {
          // handled below by the body argument
        },
      ],
    ])("never leaks the preimage on %s", async (label, arrange) => {
      arrange();
      const res = createResponse();

      await handler(
        createRequest(
          label === "an invalid request"
            ? { paymentHash: PAYMENT_HASH, preimage: PREIMAGE }
            : { paymentHash: PAYMENT_HASH }
        ),
        res as any
      );

      expectNoPreimageLeak(res);
    });
  });

  describe("request validation", () => {
    it("rejects a body carrying extra fields", async () => {
      const res = createResponse();

      await handler(
        createRequest({ paymentHash: PAYMENT_HASH, buyerPubkey: BUYER_PUBKEY }),
        res as any
      );

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toEqual({
        error: "Invalid hodl escrow settle request",
      });
      expect(fetchHodlConfirmEventsMock).not.toHaveBeenCalled();
      expect(settleInvoiceMock).not.toHaveBeenCalled();
      expect(markHodlEscrowOrderSettledMock).not.toHaveBeenCalled();
    });

    it.each([
      [
        "a smuggled confirmation event",
        { paymentHash: PAYMENT_HASH, event: { pubkey: BUYER_PUBKEY } },
      ],
      [
        "a smuggled confirmed flag",
        { paymentHash: PAYMENT_HASH, confirmed: true },
      ],
      [
        "a smuggled preimage",
        { paymentHash: PAYMENT_HASH, preimage: PREIMAGE },
      ],
      ["a non-hex payment hash", { paymentHash: "not-a-payment-hash" }],
      ["a short payment hash", { paymentHash: "b".repeat(63) }],
      ["a numeric payment hash", { paymentHash: 42 }],
      ["a missing payment hash", {}],
      ["an array body", []],
      ["a null body", null],
      ["a string body", "paymentHash"],
    ])("rejects %s with 400", async (_label, body) => {
      const res = createResponse();

      await handler(createRequest(body), res as any);

      expect(res.statusCode).toBe(400);
      expect(fetchHodlConfirmEventsMock).not.toHaveBeenCalled();
      expect(settleInvoiceMock).not.toHaveBeenCalled();
      expect(markHodlEscrowOrderSettledMock).not.toHaveBeenCalled();
    });

    it("rejects unsupported methods", async () => {
      const res = createResponse();

      await handler({ method: "GET" } as any, res as any);

      expect(res.statusCode).toBe(405);
      expect(settleInvoiceMock).not.toHaveBeenCalled();
      expect(markHodlEscrowOrderSettledMock).not.toHaveBeenCalled();
    });

    it("stops when the rate limiter rejects the request", async () => {
      applyRateLimitMock.mockReturnValue(false);
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(fetchHodlConfirmEventsMock).not.toHaveBeenCalled();
      expect(settleInvoiceMock).not.toHaveBeenCalled();
    });
  });

  describe("provider availability", () => {
    it("reports escrow as unavailable when no provider is installed", async () => {
      getHodlInvoiceProviderMock.mockImplementation(() => {
        throw new HodlInvoiceProviderUnavailableError(
          "No Lightning hold-invoice provider is configured"
        );
      });
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(503);
      expect(res.jsonBody).toEqual({
        error: "Lightning escrow is not available",
      });
      expect(fetchHodlConfirmEventsMock).not.toHaveBeenCalled();
    });

    it("returns 502 when the confirmation lookup fails for an unrecognized reason", async () => {
      fetchHodlConfirmEventsMock.mockRejectedValue(new Error("relays down"));
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(502);
      expect(res.jsonBody).toEqual({
        error: "Failed to look up buyer confirmations",
      });
      expect(nostrCloseMock).toHaveBeenCalledTimes(1);
      expect(settleInvoiceMock).not.toHaveBeenCalled();
    });
  });

  // The point of this whole block: "we could not check" must never reach the
  // caller wearing the clothes of "we checked, and no."
  describe("infrastructure failures are not verdicts", () => {
    it("returns 503, not 403, when relays could not be reached", async () => {
      fetchHodlConfirmEventsMock.mockRejectedValue(relayOutage());
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(503);
      expect(res.jsonBody).toEqual({
        error:
          "Could not reach relays to check for a buyer confirmation. Please try again.",
        reason: "relay_unavailable",
      });
      expect(settleInvoiceMock).not.toHaveBeenCalled();
      expect(getHodlEscrowSettlementSecretMock).not.toHaveBeenCalled();
      expect(nostrCloseMock).toHaveBeenCalledTimes(1);
    });

    // The regression this was written for: a relay outage used to surface as
    // an empty candidate list, which authorizes to `no_confirmation` — the
    // same 403 a seller gets when their buyer genuinely never confirmed.
    it("does not report an unreachable relay as a missing confirmation", async () => {
      fetchHodlConfirmEventsMock.mockRejectedValue(relayOutage());
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).not.toBe(403);
      expect(JSON.stringify(res.jsonBody)).not.toContain("no_confirmation");
    });

    it("returns 503, not 500, when the order lookup hits a database outage", async () => {
      getHodlEscrowOrderPartiesMock.mockRejectedValue(
        new DatabaseUnavailableError("Failed to load hodl escrow order parties")
      );
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(503);
      expect(res.jsonBody).toEqual({
        error: "Service temporarily unavailable. Please try again.",
        reason: "database_unavailable",
      });
      // Not the 404 an absent row would have produced.
      expect(fetchHodlConfirmEventsMock).not.toHaveBeenCalled();
      expect(settleInvoiceMock).not.toHaveBeenCalled();
    });

    it("returns 503 when the database fails during authorization", async () => {
      getHodlEscrowOrderPartiesMock
        .mockResolvedValueOnce(ORDER_PARTIES)
        .mockRejectedValue(
          new DatabaseUnavailableError(
            "Failed to load hodl escrow order parties"
          )
        );
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(503);
      expect(res.jsonBody).toEqual({
        error: "Service temporarily unavailable. Please try again.",
        reason: "database_unavailable",
      });
      expect(settleInvoiceMock).not.toHaveBeenCalled();
    });

    it("returns 503 when the pre-settle secret read hits a database outage", async () => {
      getHodlEscrowSettlementSecretMock.mockRejectedValue(
        new DatabaseUnavailableError(
          "Failed to load the hodl escrow settlement secret"
        )
      );
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(503);
      expect(res.jsonBody).toEqual({
        error: "Service temporarily unavailable. Please try again.",
        reason: "database_unavailable",
      });
      // Safe to advertise a retry precisely because no money moved.
      expect(settleInvoiceMock).not.toHaveBeenCalled();
      expect(markHodlEscrowOrderSettledMock).not.toHaveBeenCalled();
      expectNoPreimageLeak(res);
    });

    // The one DB failure that must NOT invite a retry: the HTLC has settled,
    // so the row disagreeing with the Lightning node needs a human.
    it("still returns 500 when the post-settle status write fails", async () => {
      markHodlEscrowOrderSettledMock.mockRejectedValue(
        new DatabaseUnavailableError("Failed to mark settled")
      );
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(settleInvoiceMock).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(500);
      expect(res.jsonBody).toEqual({
        error: "Invoice settled but the order could not be updated",
      });
      expect(JSON.stringify(res.jsonBody)).not.toContain("try again");
      expectNoPreimageLeak(res);
    });
  });
});
