const applyRateLimitMock = jest.fn();
const fetchHodlReleaseEventsMock = jest.fn();
const getHodlEscrowOrderPartiesMock = jest.fn();
const getHodlEscrowSettlementSecretMock = jest.fn();
const markHodlEscrowOrderSettledMock = jest.fn();
const markHodlEscrowOrderCancelledMock = jest.fn();
const settleInvoiceMock = jest.fn();
const cancelInvoiceMock = jest.fn();
const getHodlInvoiceProviderMock = jest.fn();
const nostrCloseMock = jest.fn();

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));

jest.mock("@/utils/nostr/hodl-escrow-records", () => ({
  fetchHodlReleaseEvents: (...args: unknown[]) =>
    fetchHodlReleaseEventsMock(...args),
}));

// Only the database is faked. The authorization module underneath runs for
// real against these rows, so "an authorized release" in these tests means
// the genuine pubkey comparison passed — not that a mock said yes.
jest.mock("@/utils/db/db-service", () => ({
  getHodlEscrowOrderParties: (...args: unknown[]) =>
    getHodlEscrowOrderPartiesMock(...args),
  getHodlEscrowSettlementSecret: (...args: unknown[]) =>
    getHodlEscrowSettlementSecretMock(...args),
  markHodlEscrowOrderSettled: (...args: unknown[]) =>
    markHodlEscrowOrderSettledMock(...args),
  markHodlEscrowOrderCancelled: (...args: unknown[]) =>
    markHodlEscrowOrderCancelledMock(...args),
}));

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

import handler from "@/pages/api/lightning/resolve-hodl-dispute";
import type { ParsedHodlReleaseEvent } from "@/utils/nostr/hodl-escrow-records";
import { HodlInvoiceError } from "@/utils/lightning/hodl-invoice-provider";
import { HodlInvoiceProviderUnavailableError } from "@/utils/lightning/hodl-invoice-provider-registry";

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

function releaseEvent(
  overrides: Partial<ParsedHodlReleaseEvent> = {}
): ParsedHodlReleaseEvent {
  return {
    orderId: PAYMENT_HASH,
    decision: "release:seller",
    authorPubkey: ARBITER_PUBKEY,
    reasoning: "tracking shows delivery",
    createdAt: 1_700_000_000,
    ...overrides,
  };
}

/** What relays actually hand back: the arbiter's ruling buried among forgeries. */
function candidatesWithGenuineArbiterEvent(
  decision: ParsedHodlReleaseEvent["decision"] = "release:seller"
): ParsedHodlReleaseEvent[] {
  return [
    releaseEvent({ authorPubkey: IMPOSTOR_PUBKEY, createdAt: 1_700_000_900 }),
    releaseEvent({ authorPubkey: "d".repeat(64), createdAt: 1_700_000_500 }),
    releaseEvent({ decision }),
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

describe("/api/lightning/resolve-hodl-dispute", () => {
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
    fetchHodlReleaseEventsMock.mockResolvedValue(
      candidatesWithGenuineArbiterEvent()
    );
    settleInvoiceMock.mockImplementation(async () => {
      callOrder.push("settleInvoice");
    });
    cancelInvoiceMock.mockImplementation(async () => {
      callOrder.push("cancelInvoice");
    });
    markHodlEscrowOrderSettledMock.mockImplementation(async () => {
      callOrder.push("markSettled");
      return "settled";
    });
    markHodlEscrowOrderCancelledMock.mockImplementation(async () => {
      callOrder.push("markCancelled");
      return "cancelled";
    });
    getHodlInvoiceProviderMock.mockReturnValue({
      settleInvoice: settleInvoiceMock,
      cancelInvoice: cancelInvoiceMock,
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

  describe("release:seller — settling", () => {
    it("settles when the order's real arbiter ruled for the seller", async () => {
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toEqual({ status: "settled" });
      expect(settleInvoiceMock).toHaveBeenCalledTimes(1);
      expect(settleInvoiceMock).toHaveBeenCalledWith(PREIMAGE);
      expect(markHodlEscrowOrderSettledMock).toHaveBeenCalledWith(PAYMENT_HASH);
      expect(cancelInvoiceMock).not.toHaveBeenCalled();
      expect(markHodlEscrowOrderCancelledMock).not.toHaveBeenCalled();
      expectNoPreimageLeak(res);
    });

    it("looks up rulings server-side from the payment hash alone", async () => {
      await handler(createRequest(), createResponse() as any);

      expect(fetchHodlReleaseEventsMock).toHaveBeenCalledTimes(1);
      const [args] = fetchHodlReleaseEventsMock.mock.calls[0];
      expect(args.paymentHash).toBe(PAYMENT_HASH);
      // No event, decision, or pubkey claim is forwarded from the caller.
      expect(Object.keys(args).sort()).toEqual([
        "nostr",
        "paymentHash",
        "timeoutMs",
      ]);
      expect(nostrCloseMock).toHaveBeenCalledTimes(1);
    });

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
      await settleStarted;

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

  describe("release:buyer — cancelling", () => {
    beforeEach(() => {
      fetchHodlReleaseEventsMock.mockResolvedValue(
        candidatesWithGenuineArbiterEvent("release:buyer")
      );
    });

    it("cancels when the order's real arbiter ruled for the buyer", async () => {
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toEqual({ status: "cancelled" });
      expect(cancelInvoiceMock).toHaveBeenCalledTimes(1);
      expect(cancelInvoiceMock).toHaveBeenCalledWith(PAYMENT_HASH);
      expect(markHodlEscrowOrderCancelledMock).toHaveBeenCalledWith(
        PAYMENT_HASH
      );
      expect(settleInvoiceMock).not.toHaveBeenCalled();
      expect(markHodlEscrowOrderSettledMock).not.toHaveBeenCalled();
    });

    it("never reads the settlement secret on the cancel path", async () => {
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(200);
      expect(getHodlEscrowSettlementSecretMock).not.toHaveBeenCalled();
      expectNoPreimageLeak(res);
    });

    it("marks the order cancelled only after the provider call resolves", async () => {
      let releaseCancel: (() => void) | undefined;
      let signalStarted: (() => void) | undefined;
      const cancelStarted = new Promise<void>((resolve) => {
        signalStarted = resolve;
      });
      cancelInvoiceMock.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            callOrder.push("cancelInvoice:started");
            releaseCancel = () => {
              callOrder.push("cancelInvoice:resolved");
              resolve();
            };
            signalStarted!();
          })
      );

      const res = createResponse();
      const pending = handler(createRequest(), res as any);
      await cancelStarted;

      expect(cancelInvoiceMock).toHaveBeenCalledTimes(1);
      expect(markHodlEscrowOrderCancelledMock).not.toHaveBeenCalled();

      releaseCancel!();
      await pending;

      expect(markHodlEscrowOrderCancelledMock).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual([
        "cancelInvoice:started",
        "cancelInvoice:resolved",
        "markCancelled",
      ]);
      expect(res.statusCode).toBe(200);
    });

    it("leaves the status untouched when the provider throws", async () => {
      cancelInvoiceMock.mockRejectedValue(
        new HodlInvoiceError(
          "invalid_state_transition",
          "Cannot cancel a settled invoice; the funds have already been released"
        )
      );
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(502);
      expect(res.jsonBody).toEqual({ error: "Failed to cancel hold invoice" });
      expect(markHodlEscrowOrderCancelledMock).not.toHaveBeenCalled();
    });

    it("reports a failure when the invoice cancelled but the row could not be updated", async () => {
      markHodlEscrowOrderCancelledMock.mockRejectedValue(new Error("db down"));
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(cancelInvoiceMock).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(500);
      expect(res.jsonBody).toEqual({
        error: "Invoice cancelled but the order could not be updated",
      });
    });

    it("reports a failure when the row vanished before it could be marked cancelled", async () => {
      markHodlEscrowOrderCancelledMock.mockResolvedValue("not-found");
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(500);
      expect(res.jsonBody).toEqual({
        error: "Invoice cancelled but the order could not be updated",
      });
    });

    it("never leaks the preimage on a provider failure in the cancel path", async () => {
      cancelInvoiceMock.mockRejectedValue(new Error(`boom ${PREIMAGE}`));
      const res = createResponse();

      await handler(createRequest(), res as any);

      expectNoPreimageLeak(res);
      expect(loggedOutput(consoleErrorSpy)).toContain("[redacted]");
    });
  });

  describe("authorization", () => {
    it("rejects with 403 when no candidate is signed by the arbiter", async () => {
      fetchHodlReleaseEventsMock.mockResolvedValue([
        releaseEvent({ authorPubkey: IMPOSTOR_PUBKEY }),
        releaseEvent({ authorPubkey: BUYER_PUBKEY }),
      ]);
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(403);
      expect(res.jsonBody).toEqual({
        error: "No ruling for this order was signed by its arbiter",
        reason: "pubkey_mismatch",
      });
      expect(settleInvoiceMock).not.toHaveBeenCalled();
      expect(cancelInvoiceMock).not.toHaveBeenCalled();
      expect(markHodlEscrowOrderSettledMock).not.toHaveBeenCalled();
      expect(markHodlEscrowOrderCancelledMock).not.toHaveBeenCalled();
      // The secret is not even read on a path that cannot settle.
      expect(getHodlEscrowSettlementSecretMock).not.toHaveBeenCalled();
      expectNoPreimageLeak(res);
    });

    it("rejects with 403 when the buyer or seller self-rules their own order", async () => {
      fetchHodlReleaseEventsMock.mockResolvedValue([
        releaseEvent({ authorPubkey: SELLER_PUBKEY }),
      ]);
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(403);
      expect(settleInvoiceMock).not.toHaveBeenCalled();
      expect(cancelInvoiceMock).not.toHaveBeenCalled();
    });

    it("rejects with 403 when relays return no release events at all", async () => {
      fetchHodlReleaseEventsMock.mockResolvedValue([]);
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(403);
      expect(res.jsonBody).toEqual({
        error: "No arbiter ruling has been published for this order",
        reason: "no_release_event",
      });
      expect(settleInvoiceMock).not.toHaveBeenCalled();
      expect(cancelInvoiceMock).not.toHaveBeenCalled();
      expect(getHodlEscrowSettlementSecretMock).not.toHaveBeenCalled();
    });

    it("rejects a ruling that belongs to a different order", async () => {
      fetchHodlReleaseEventsMock.mockResolvedValue([
        releaseEvent({ orderId: OTHER_PAYMENT_HASH }),
      ]);
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(403);
      expect(res.jsonBody).toEqual({
        error: "Ruling events do not belong to this order",
        reason: "order_mismatch",
      });
      expect(settleInvoiceMock).not.toHaveBeenCalled();
      expect(cancelInvoiceMock).not.toHaveBeenCalled();
    });

    it("stops at the first candidate that authorizes", async () => {
      fetchHodlReleaseEventsMock.mockResolvedValue([
        releaseEvent(),
        releaseEvent({ createdAt: 1_700_000_001 }),
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
      expect(fetchHodlReleaseEventsMock).not.toHaveBeenCalled();
      expect(getHodlEscrowSettlementSecretMock).not.toHaveBeenCalled();
      expect(settleInvoiceMock).not.toHaveBeenCalled();
      expect(cancelInvoiceMock).not.toHaveBeenCalled();
      expect(markHodlEscrowOrderSettledMock).not.toHaveBeenCalled();
      expect(markHodlEscrowOrderCancelledMock).not.toHaveBeenCalled();
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
      expect(cancelInvoiceMock).not.toHaveBeenCalled();
    });

    it("reports a database outage as a server error, not as an unauthorized resolution", async () => {
      getHodlEscrowOrderPartiesMock
        .mockResolvedValueOnce(ORDER_PARTIES)
        .mockRejectedValue(new Error("db down"));
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(500);
      expect(settleInvoiceMock).not.toHaveBeenCalled();
      expect(cancelInvoiceMock).not.toHaveBeenCalled();
    });
  });

  describe("preimage confidentiality", () => {
    it("keeps the preimage out of a provider error that quotes it verbatim", async () => {
      settleInvoiceMock.mockRejectedValue(
        new Error(
          `settle failed: POST /v2/invoices/settle {"preimage":"${PREIMAGE}"}`
        )
      );
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(502);
      expectNoPreimageLeak(res);
      expect(loggedOutput(consoleErrorSpy)).toContain("[redacted]");
      expect(loggedOutput(consoleErrorSpy)).toContain("settle failed");
    });

    it.each([
      ["a successful settle", () => {}],
      [
        "an unauthorized settle",
        () => {
          fetchHodlReleaseEventsMock.mockResolvedValue([
            releaseEvent({ authorPubkey: IMPOSTOR_PUBKEY }),
          ]);
        },
      ],
      [
        "a successful cancel",
        () => {
          fetchHodlReleaseEventsMock.mockResolvedValue(
            candidatesWithGenuineArbiterEvent("release:buyer")
          );
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
          fetchHodlReleaseEventsMock.mockRejectedValue(
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
        createRequest({ paymentHash: PAYMENT_HASH, decision: "release:buyer" }),
        res as any
      );

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toEqual({
        error: "Invalid hodl escrow resolve request",
      });
      expect(fetchHodlReleaseEventsMock).not.toHaveBeenCalled();
      expect(settleInvoiceMock).not.toHaveBeenCalled();
      expect(cancelInvoiceMock).not.toHaveBeenCalled();
    });

    it.each([
      [
        "a smuggled release event",
        { paymentHash: PAYMENT_HASH, event: { pubkey: ARBITER_PUBKEY } },
      ],
      [
        "a smuggled decision",
        { paymentHash: PAYMENT_HASH, decision: "release:seller" },
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
      expect(fetchHodlReleaseEventsMock).not.toHaveBeenCalled();
      expect(settleInvoiceMock).not.toHaveBeenCalled();
      expect(cancelInvoiceMock).not.toHaveBeenCalled();
    });

    it("rejects unsupported methods", async () => {
      const res = createResponse();

      await handler({ method: "GET" } as any, res as any);

      expect(res.statusCode).toBe(405);
      expect(settleInvoiceMock).not.toHaveBeenCalled();
      expect(cancelInvoiceMock).not.toHaveBeenCalled();
    });

    it("stops when the rate limiter rejects the request", async () => {
      applyRateLimitMock.mockReturnValue(false);
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(fetchHodlReleaseEventsMock).not.toHaveBeenCalled();
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
      expect(fetchHodlReleaseEventsMock).not.toHaveBeenCalled();
    });

    it("returns 502 when the ruling lookup fails", async () => {
      fetchHodlReleaseEventsMock.mockRejectedValue(new Error("relays down"));
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(502);
      expect(res.jsonBody).toEqual({
        error: "Failed to look up arbiter rulings",
      });
      expect(nostrCloseMock).toHaveBeenCalledTimes(1);
      expect(settleInvoiceMock).not.toHaveBeenCalled();
    });
  });
});
