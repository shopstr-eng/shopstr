/**
 * @jest-environment node
 */

/**
 * Behavioural spec for the `hodl_escrow_payouts` persistence layer, written
 * before the implementation from the payout design alone.
 *
 * The table records money the platform owes a seller after settlement. Two
 * properties carry that weight, and every test below is one of them:
 *
 *  - Exactly one attempt at a time may hold a payout. That is enforced by a
 *    row lock, the same way `hodl_escrow_orders` enforces its transitions —
 *    not by an unguarded `UPDATE ... WHERE status = ...` two racing callers
 *    can both satisfy.
 *  - A stored invoice is written once and never overwritten by a later
 *    attempt, so the invoice on the row is always the one a payment was made
 *    against.
 */

const queryMock = jest.fn();
const releaseMock = jest.fn();
const endMock = jest.fn();
const connectMock = jest.fn().mockResolvedValue({
  query: queryMock,
  release: releaseMock,
});

jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: connectMock,
    on: jest.fn(),
    end: endMock,
  })),
}));

import * as dbService from "../db-service";

const PAYMENT_HASH = "b".repeat(64);
const PAYOUT_INVOICE = "lnbc42u1payoutexample";
const VERIFY_URL = "https://getalby.com/verify/abc";

/**
 * Stands in for the claim transaction: BEGIN, the row-locking SELECT, then
 * whatever writes the test queues, then COMMIT.
 */
function queueLockedRow(row: Record<string, unknown> | null) {
  queryMock
    .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // BEGIN
    .mockResolvedValueOnce(
      row === null ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [row] }
    ); // SELECT ... FOR UPDATE
}

function payoutRow(overrides: Record<string, unknown> = {}) {
  return {
    payout_invoice: null,
    payout_invoice_verify_url: null,
    status: "pending",
    attempt_count: 1,
    last_error: null,
    lease_active: false,
    ...overrides,
  };
}

/** SQL calls that wrote to the payouts table. */
function payoutWrites() {
  return queryMock.mock.calls.filter(([sql]) =>
    /(?:INSERT INTO|UPDATE) hodl_escrow_payouts/i.test(String(sql))
  );
}

describe("hodl escrow payout records", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(() => {
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/shopstr";
  });

  beforeEach(() => {
    jest.clearAllMocks();
    queryMock.mockReset();
  });

  afterAll(async () => {
    await dbService.closeDbPool();
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  describe("claimHodlEscrowPayoutAttempt", () => {
    it("locks the row with SELECT ... FOR UPDATE inside a transaction", async () => {
      queueLockedRow(payoutRow());
      queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

      await dbService.claimHodlEscrowPayoutAttempt(PAYMENT_HASH);

      const calls = queryMock.mock.calls.map(([sql]) => String(sql));
      expect(calls[0]).toBe("BEGIN");
      expect(calls[1]).toContain("FOR UPDATE");
      expect(calls[calls.length - 1]).toBe("COMMIT");
    });

    it("creates the payout row on the first attempt, with no invoice yet", async () => {
      queueLockedRow(null);
      queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // INSERT
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

      const claim = await dbService.claimHodlEscrowPayoutAttempt(PAYMENT_HASH);

      expect(claim).toEqual({
        outcome: "claimed",
        invoice: null,
        verifyUrl: null,
        attemptCount: 1,
      });
      const [sql] = payoutWrites()[0]!;
      expect(String(sql)).toContain("INSERT INTO hodl_escrow_payouts");
      // A brand new row is pending and owes money; it is never born terminal.
      expect(String(sql)).toContain("'pending'");
    });

    it("hands back the stored invoice so the caller can check it", async () => {
      queueLockedRow(
        payoutRow({
          payout_invoice: PAYOUT_INVOICE,
          payout_invoice_verify_url: VERIFY_URL,
          attempt_count: 2,
        })
      );
      queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

      const claim = await dbService.claimHodlEscrowPayoutAttempt(PAYMENT_HASH);

      expect(claim).toEqual({
        outcome: "claimed",
        invoice: PAYOUT_INVOICE,
        verifyUrl: VERIFY_URL,
        attemptCount: 3,
      });
    });

    it("refuses the claim while another attempt's lease is still live", async () => {
      queueLockedRow(payoutRow({ lease_active: true }));
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

      const claim = await dbService.claimHodlEscrowPayoutAttempt(PAYMENT_HASH);

      expect(claim).toEqual({ outcome: "in-progress" });
      // Nothing is written: the attempt count belongs to the holder.
      expect(payoutWrites()).toHaveLength(0);
    });

    it("takes over a claim whose lease has gone stale, counting the attempt", async () => {
      queueLockedRow(payoutRow({ attempt_count: 4, lease_active: false }));
      queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

      const claim = await dbService.claimHodlEscrowPayoutAttempt(PAYMENT_HASH);

      expect(claim).toMatchObject({ outcome: "claimed", attemptCount: 5 });
      const [sql] = payoutWrites()[0]!;
      expect(String(sql)).toContain("attempt_count");
      expect(String(sql)).toContain("claimed_at");
    });

    it("claims a failed row, because a failed payout is one still owed", async () => {
      queueLockedRow(payoutRow({ status: "failed", attempt_count: 2 }));
      queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

      const claim = await dbService.claimHodlEscrowPayoutAttempt(PAYMENT_HASH);

      expect(claim).toMatchObject({ outcome: "claimed", attemptCount: 3 });
    });

    it.each(["paid", "abandoned"] as const)(
      "reports a %s row as terminal and writes nothing",
      async (status) => {
        queueLockedRow(
          payoutRow({ status, last_error: "seller address unreachable" })
        );
        queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

        const claim =
          await dbService.claimHodlEscrowPayoutAttempt(PAYMENT_HASH);

        expect(claim).toEqual({
          outcome: "terminal",
          status,
          lastError: "seller address unreachable",
        });
        expect(payoutWrites()).toHaveLength(0);
      }
    );

    it("normalizes a mixed-case payment hash", async () => {
      queueLockedRow(payoutRow());
      queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

      await dbService.claimHodlEscrowPayoutAttempt(PAYMENT_HASH.toUpperCase());

      const [, selectValues] = queryMock.mock.calls[1]!;
      expect((selectValues as unknown[])[0]).toBe(PAYMENT_HASH);
    });

    it("rolls back and rethrows when the transaction fails", async () => {
      queryMock
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error("db down")) // SELECT ... FOR UPDATE
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // ROLLBACK

      await expect(
        dbService.claimHodlEscrowPayoutAttempt(PAYMENT_HASH)
      ).rejects.toThrow("db down");

      expect(
        queryMock.mock.calls.some(([sql]) => String(sql) === "ROLLBACK")
      ).toBe(true);
      expect(releaseMock).toHaveBeenCalled();
    });
  });

  describe("recordHodlEscrowPayoutInvoice", () => {
    it("stores the invoice and its verify URL", async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] });

      const result = await dbService.recordHodlEscrowPayoutInvoice(
        PAYMENT_HASH,
        { invoice: PAYOUT_INVOICE, verifyUrl: VERIFY_URL }
      );

      expect(result).toBe("stored");
      const [sql, values] = queryMock.mock.calls[0]!;
      expect(String(sql)).toContain("UPDATE hodl_escrow_payouts");
      expect(values).toEqual([PAYMENT_HASH, PAYOUT_INVOICE, VERIFY_URL]);
    });

    it("is first-write-wins: it only writes where no invoice is stored yet", async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] });

      await dbService.recordHodlEscrowPayoutInvoice(PAYMENT_HASH, {
        invoice: PAYOUT_INVOICE,
        verifyUrl: VERIFY_URL,
      });

      const [sql] = queryMock.mock.calls[0]!;
      // Without this guard a second attempt could replace the invoice a
      // payment is already in flight against.
      expect(String(sql)).toContain("payout_invoice IS NULL");
    });

    it("reports not-stored when a row already holds an invoice", async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const result = await dbService.recordHodlEscrowPayoutInvoice(
        PAYMENT_HASH,
        { invoice: PAYOUT_INVOICE, verifyUrl: VERIFY_URL }
      );

      expect(result).toBe("not-stored");
    });
  });

  describe("discardHodlEscrowPayoutInvoice", () => {
    it("clears the invoice and marks the payout failed, keeping the reason", async () => {
      queueLockedRow(
        payoutRow({ payout_invoice: PAYOUT_INVOICE, status: "pending" })
      );
      queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

      const result = await dbService.discardHodlEscrowPayoutInvoice(
        PAYMENT_HASH,
        "invoice expired unpaid"
      );

      expect(result).toBe("failed");
      const [sql, values] = payoutWrites()[0]!;
      expect(String(sql)).toContain("payout_invoice = NULL");
      expect(String(sql)).toContain("status = 'failed'");
      expect(values).toContain("invoice expired unpaid");
    });

    it("refuses to clear the invoice on a paid row", async () => {
      queueLockedRow(payoutRow({ status: "paid" }));
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

      const result = await dbService.discardHodlEscrowPayoutInvoice(
        PAYMENT_HASH,
        "invoice expired unpaid"
      );

      expect(result).toBe("paid");
      expect(payoutWrites()).toHaveLength(0);
    });
  });

  describe("payout status transitions", () => {
    it.each([
      ["pending", "paid"],
      ["failed", "paid"],
      ["pending", "failed"],
      ["pending", "abandoned"],
      ["failed", "abandoned"],
    ] as const)("advances %s to %s", async (from, to) => {
      queueLockedRow(payoutRow({ status: from }));
      queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

      const call =
        to === "paid"
          ? dbService.markHodlEscrowPayoutPaid(PAYMENT_HASH)
          : to === "failed"
            ? dbService.markHodlEscrowPayoutFailed(PAYMENT_HASH, "nope")
            : dbService.markHodlEscrowPayoutAbandoned(PAYMENT_HASH, "nope");

      await expect(call).resolves.toBe(to);
      expect(payoutWrites()).toHaveLength(1);
    });

    it.each([
      ["paid", "failed"],
      ["paid", "abandoned"],
      ["abandoned", "failed"],
      ["abandoned", "paid"],
    ] as const)(
      "refuses to move %s to %s and leaves the row untouched",
      async (from, to) => {
        queueLockedRow(payoutRow({ status: from }));
        queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

        const call =
          to === "paid"
            ? dbService.markHodlEscrowPayoutPaid(PAYMENT_HASH)
            : to === "failed"
              ? dbService.markHodlEscrowPayoutFailed(PAYMENT_HASH, "nope")
              : dbService.markHodlEscrowPayoutAbandoned(PAYMENT_HASH, "nope");

        await expect(call).resolves.toBe(from);
        expect(payoutWrites()).toHaveLength(0);
      }
    );

    it("returns not-found when no payout row matches", async () => {
      queueLockedRow(null);
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

      await expect(
        dbService.markHodlEscrowPayoutPaid(PAYMENT_HASH)
      ).resolves.toBe("not-found");
      expect(payoutWrites()).toHaveLength(0);
    });
  });

  describe("recordHodlEscrowPayoutError", () => {
    it("records the reason without moving the row out of pending", async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] });

      await dbService.recordHodlEscrowPayoutError(
        PAYMENT_HASH,
        "payment timed out"
      );

      const [sql, values] = queryMock.mock.calls[0]!;
      expect(String(sql)).toContain("last_error");
      // A send whose outcome is unknown must not be recorded as a verdict.
      expect(String(sql)).not.toMatch(/status\s*=/);
      expect(values).toEqual([PAYMENT_HASH, "payment timed out"]);
    });
  });

  describe("listHodlEscrowPayoutsNeedingAttention", () => {
    it("returns the rows a human has to reconcile", async () => {
      queryMock.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            payment_hash: PAYMENT_HASH,
            status: "abandoned",
            attempt_count: 6,
            last_error: "seller address unreachable",
            payout_invoice: null,
            updated_at: new Date("2026-08-20T00:00:00.000Z"),
          },
        ],
      });

      const rows = await dbService.listHodlEscrowPayoutsNeedingAttention();

      expect(rows).toEqual([
        {
          paymentHash: PAYMENT_HASH,
          status: "abandoned",
          attemptCount: 6,
          lastError: "seller address unreachable",
          invoice: null,
          updatedAt: new Date("2026-08-20T00:00:00.000Z"),
        },
      ]);
      const [sql] = queryMock.mock.calls[0]!;
      // Money owed and not delivered: both the terminal state and the
      // retryable one, or an abandoned row would be the only thing findable.
      expect(String(sql)).toContain("failed");
      expect(String(sql)).toContain("abandoned");
    });
  });

  describe("getHodlEscrowPayoutOrderContext", () => {
    it("returns the seller and amount a payout has to be made to", async () => {
      queryMock.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            seller_nostr_pubkey: "2".repeat(64),
            amount_sats: "4200",
            status: "settled",
          },
        ],
      });

      const context =
        await dbService.getHodlEscrowPayoutOrderContext(PAYMENT_HASH);

      expect(context).toEqual({
        sellerNostrPubkey: "2".repeat(64),
        amountSats: 4200,
        orderStatus: "settled",
      });
      const [sql] = queryMock.mock.calls[0]!;
      // Never SELECT * near a table holding a settlement secret.
      expect(String(sql)).not.toContain("preimage");
    });

    it("returns null when no order exists", async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      await expect(
        dbService.getHodlEscrowPayoutOrderContext(PAYMENT_HASH)
      ).resolves.toBeNull();
    });

    it("raises DatabaseUnavailableError rather than passing an outage off as no such order", async () => {
      queryMock.mockRejectedValueOnce(new Error("db down"));

      await expect(
        dbService.getHodlEscrowPayoutOrderContext(PAYMENT_HASH)
      ).rejects.toBeInstanceOf(dbService.DatabaseUnavailableError);
    });
  });
});
