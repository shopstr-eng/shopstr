import type { NextApiHandler, NextApiRequest } from "next";
import { DatabaseUnavailableError } from "@/utils/db/db-service";
import { HodlInvoiceError } from "@/utils/lightning/hodl-invoice-provider";

export const PAYMENT_HASH = "b".repeat(64);
export const PREIMAGE = "abad1dea".repeat(8);

export function createResponse() {
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

export function createRequest(body: unknown = { paymentHash: PAYMENT_HASH }) {
  return { method: "POST", headers: {}, body } as NextApiRequest;
}

export function loggedOutput(spy: jest.SpyInstance): string {
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

type Response = ReturnType<typeof createResponse>;
type SettlementContext = {
  handler: NextApiHandler;
  getHodlEscrowSettlementSecretMock: jest.Mock;
  markHodlEscrowOrderSettledMock: jest.Mock;
  settleInvoiceMock: jest.Mock;
  callOrder: string[];
  expectNoPreimageLeak: (res: Response) => void;
  consoleErrorSpy: jest.SpyInstance;
};

// Both real route handlers run these cases with their own authorization fixtures.
export function testAuthorizedSettlement(context: () => SettlementContext) {
  describe("authorized settlement contract", () => {
    it("marks the order settled only after the provider call resolves", async () => {
      const {
        handler,
        markHodlEscrowOrderSettledMock,
        settleInvoiceMock,
        callOrder,
      } = context();

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
      const {
        handler,
        markHodlEscrowOrderSettledMock,
        settleInvoiceMock,
        expectNoPreimageLeak,
      } = context();

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
      const {
        handler,
        markHodlEscrowOrderSettledMock,
        settleInvoiceMock,
        expectNoPreimageLeak,
      } = context();

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
      const { handler, markHodlEscrowOrderSettledMock } = context();

      markHodlEscrowOrderSettledMock.mockResolvedValue("not-found");
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(500);
      expect(res.jsonBody).toEqual({
        error: "Invoice settled but the order could not be updated",
      });
    });
    it("does not settle when the stored secret is missing", async () => {
      const {
        handler,
        getHodlEscrowSettlementSecretMock,
        markHodlEscrowOrderSettledMock,
        settleInvoiceMock,
      } = context();

      getHodlEscrowSettlementSecretMock.mockResolvedValue(null);
      const res = createResponse();

      await handler(createRequest(), res as any);

      expect(res.statusCode).toBe(500);
      expect(res.jsonBody).toEqual({ error: "Failed to settle escrow order" });
      expect(settleInvoiceMock).not.toHaveBeenCalled();
      expect(markHodlEscrowOrderSettledMock).not.toHaveBeenCalled();
    });
    it("keeps the preimage out of a provider error that quotes it verbatim", async () => {
      const {
        handler,
        settleInvoiceMock,
        expectNoPreimageLeak,
        consoleErrorSpy,
      } = context();

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
    it("returns 503 when the pre-settle secret read hits a database outage", async () => {
      const {
        handler,
        getHodlEscrowSettlementSecretMock,
        markHodlEscrowOrderSettledMock,
        settleInvoiceMock,
        expectNoPreimageLeak,
      } = context();

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
  });
}

export function testPreimagePrivacy(
  handler: NextApiHandler,
  scenarios: Array<[string, () => void]>,
  expectNoPreimageLeak: (res: Response) => void
) {
  it.each(scenarios)(
    "never leaks the preimage on %s",
    async (label, arrange) => {
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
    }
  );
}
