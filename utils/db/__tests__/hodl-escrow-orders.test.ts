/**
 * @jest-environment node
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

const ARBITER_PUBKEY = "a".repeat(64);
const PAYMENT_HASH = "b".repeat(64);
const PREIMAGE = "c".repeat(64);

const registration = {
  paymentHash: PAYMENT_HASH,
  preimage: PREIMAGE,
  buyerNostrPubkey: "1".repeat(64),
  sellerNostrPubkey: "2".repeat(64),
  invoice: "lnbc420n1pjexample",
  amountSats: 42,
  expiresAt: new Date("2026-08-05T12:00:00.000Z"),
};

// Mirrors the identity columns registerHodlEscrowOrder selects back. Note
// there is no preimage here — the read path does not select it.
const storedRow = {
  payment_hash: PAYMENT_HASH,
  buyer_nostr_pubkey: registration.buyerNostrPubkey,
  seller_nostr_pubkey: registration.sellerNostrPubkey,
  arbiter_nostr_pubkey: ARBITER_PUBKEY,
  invoice: registration.invoice,
  amount_sats: String(registration.amountSats),
};

describe("hodl escrow order commitments", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalArbiterPubkey = process.env.ARBITER_NOSTR_PUBKEY;
  const originalPublicArbiterPubkey =
    process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY;

  beforeAll(() => {
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/shopstr";
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks leaves queued mockResolvedValueOnce values in place, so a
    // test that throws before querying would hand its unused row to the next
    // test. Reset drains the queue.
    queryMock.mockReset();
    process.env.ARBITER_NOSTR_PUBKEY = ARBITER_PUBKEY;
    delete process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY;
  });

  afterAll(async () => {
    await dbService.closeDbPool();
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
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

  it("writes every column in one insert, keyed on the payment hash", async () => {
    queryMock.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ payment_hash: PAYMENT_HASH }],
    });

    const result = await dbService.registerHodlEscrowOrder(registration);

    expect(result).toBe("created");
    expect(queryMock).toHaveBeenCalledTimes(1);

    const [sql, values] = queryMock.mock.calls[0];
    expect(sql).toContain("INSERT INTO hodl_escrow_orders");
    // First-write-wins: an existing commitment is never overwritten.
    expect(sql).toContain("ON CONFLICT (payment_hash) DO NOTHING");
    expect(sql).not.toMatch(/DO UPDATE/i);
    expect(values).toEqual([
      PAYMENT_HASH,
      PREIMAGE,
      registration.buyerNostrPubkey,
      registration.sellerNostrPubkey,
      ARBITER_PUBKEY,
      registration.invoice,
      registration.amountSats,
      registration.expiresAt,
    ]);
    expect(releaseMock).toHaveBeenCalled();
  });

  it("stores the configured arbiter, not one the caller passed in", async () => {
    await expect(
      dbService.registerHodlEscrowOrder({
        ...registration,
        arbiterNostrPubkey: "f".repeat(64),
      } as never)
    ).rejects.toThrow(dbService.HodlEscrowArbiterConfigError);

    expect(queryMock).not.toHaveBeenCalled();
  });

  it("refuses to write anything when no arbiter is configured", async () => {
    delete process.env.ARBITER_NOSTR_PUBKEY;

    await expect(
      dbService.registerHodlEscrowOrder(registration)
    ).rejects.toThrow(dbService.HodlEscrowArbiterConfigError);

    expect(queryMock).not.toHaveBeenCalled();
  });

  it("treats a placeholder arbiter pubkey as unconfigured", async () => {
    process.env.ARBITER_NOSTR_PUBKEY = "replace-with-arbiter-nostr-pubkey-hex";

    await expect(
      dbService.registerHodlEscrowOrder(registration)
    ).rejects.toThrow(dbService.HodlEscrowArbiterConfigError);

    expect(queryMock).not.toHaveBeenCalled();
  });

  it("is idempotent when the identical order is written twice", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [storedRow] });

    const result = await dbService.registerHodlEscrowOrder(registration);

    expect(result).toBe("existing");
  });

  it("never reads the preimage back when comparing an existing row", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [storedRow] });

    await dbService.registerHodlEscrowOrder(registration);

    const [selectSql] = queryMock.mock.calls[1];
    expect(selectSql).toContain("FROM hodl_escrow_orders");
    expect(selectSql).not.toContain("preimage");
  });

  it.each([
    ["buyer", { buyer_nostr_pubkey: "9".repeat(64) }],
    ["seller", { seller_nostr_pubkey: "9".repeat(64) }],
    ["arbiter", { arbiter_nostr_pubkey: "9".repeat(64) }],
    ["invoice", { invoice: "lnbc999n1pjdifferent" }],
    ["amount", { amount_sats: "43" }],
  ])(
    "reports a conflict when the stored row has a different %s",
    async (_field, overrides) => {
      queryMock
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ ...storedRow, ...overrides }],
        });

      const result = await dbService.registerHodlEscrowOrder(registration);

      expect(result).toBe("conflict");
    }
  );

  it("reports a conflict when the row disappears between statements", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const result = await dbService.registerHodlEscrowOrder(registration);

    expect(result).toBe("conflict");
  });

  it("releases the client when the insert fails", async () => {
    queryMock.mockRejectedValueOnce(new Error("db down"));

    await expect(
      dbService.registerHodlEscrowOrder(registration)
    ).rejects.toThrow("db down");

    expect(releaseMock).toHaveBeenCalled();
  });

  describe("getHodlEscrowOrderParties", () => {
    const partiesRow = {
      payment_hash: PAYMENT_HASH,
      buyer_nostr_pubkey: registration.buyerNostrPubkey,
      seller_nostr_pubkey: registration.sellerNostrPubkey,
      arbiter_nostr_pubkey: ARBITER_PUBKEY,
    };

    it("returns the parties committed to the payment hash", async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [partiesRow] });

      const parties = await dbService.getHodlEscrowOrderParties(PAYMENT_HASH);

      expect(parties).toEqual({
        paymentHash: PAYMENT_HASH,
        buyerNostrPubkey: registration.buyerNostrPubkey,
        sellerNostrPubkey: registration.sellerNostrPubkey,
        arbiterNostrPubkey: ARBITER_PUBKEY,
      });
      expect(releaseMock).toHaveBeenCalled();
    });

    it("never selects the preimage", async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [partiesRow] });

      await dbService.getHodlEscrowOrderParties(PAYMENT_HASH);

      const [sql] = queryMock.mock.calls[0];
      expect(sql).toContain("FROM hodl_escrow_orders");
      expect(sql).not.toContain("preimage");
      expect(sql).not.toContain("*");
    });

    it("looks up the lowercased payment hash", async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      await dbService.getHodlEscrowOrderParties(PAYMENT_HASH.toUpperCase());

      const [, values] = queryMock.mock.calls[0];
      expect(values).toEqual([PAYMENT_HASH]);
    });

    it("returns null for an unregistered payment hash", async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      await expect(
        dbService.getHodlEscrowOrderParties(PAYMENT_HASH)
      ).resolves.toBeNull();
    });

    // Callers turn null into a 404/403 verdict, so a failed read must not be
    // able to arrive looking like one. It throws a typed error instead, which
    // the escrow endpoints map to a 503.
    it("throws DatabaseUnavailableError and releases the client when the lookup fails", async () => {
      queryMock.mockRejectedValueOnce(new Error("db down"));

      await expect(
        dbService.getHodlEscrowOrderParties(PAYMENT_HASH)
      ).rejects.toBeInstanceOf(dbService.DatabaseUnavailableError);

      expect(releaseMock).toHaveBeenCalled();
    });

    it("throws DatabaseUnavailableError when the connection itself fails", async () => {
      connectMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      await expect(
        dbService.getHodlEscrowOrderParties(PAYMENT_HASH)
      ).rejects.toBeInstanceOf(dbService.DatabaseUnavailableError);
    });

    it("never returns null for a failed read", async () => {
      queryMock.mockRejectedValueOnce(new Error("db down"));

      const outcome = await dbService
        .getHodlEscrowOrderParties(PAYMENT_HASH)
        .then(
          (value) => ({ resolved: true, value }),
          () => ({ resolved: false, value: undefined })
        );

      expect(outcome.resolved).toBe(false);
    });
  });

  describe("getHodlEscrowOrderStatus", () => {
    it("returns the stored status", async () => {
      queryMock.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ status: "accepted" }],
      });

      await expect(
        dbService.getHodlEscrowOrderStatus(PAYMENT_HASH)
      ).resolves.toBe("accepted");
    });

    it("returns null for an unregistered payment hash", async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      await expect(
        dbService.getHodlEscrowOrderStatus(PAYMENT_HASH)
      ).resolves.toBeNull();
    });

    it("looks up the lowercased payment hash", async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      await dbService.getHodlEscrowOrderStatus(PAYMENT_HASH.toUpperCase());

      const [, values] = queryMock.mock.calls[0];
      expect(values).toEqual([PAYMENT_HASH]);
    });

    it("throws DatabaseUnavailableError and releases the client when the lookup fails", async () => {
      queryMock.mockRejectedValueOnce(new Error("db down"));

      await expect(
        dbService.getHodlEscrowOrderStatus(PAYMENT_HASH)
      ).rejects.toBeInstanceOf(dbService.DatabaseUnavailableError);

      expect(releaseMock).toHaveBeenCalled();
    });
  });

  describe("getHodlEscrowSettlementSecret", () => {
    it("returns the stored preimage", async () => {
      queryMock.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ preimage: PREIMAGE }],
      });

      await expect(
        dbService.getHodlEscrowSettlementSecret(PAYMENT_HASH)
      ).resolves.toBe(PREIMAGE);
    });

    // This read runs before the provider is asked to settle, so nothing has
    // moved when it fails and the caller may safely advertise a retry.
    it("throws DatabaseUnavailableError and releases the client when the read fails", async () => {
      queryMock.mockRejectedValueOnce(new Error("db down"));

      await expect(
        dbService.getHodlEscrowSettlementSecret(PAYMENT_HASH)
      ).rejects.toBeInstanceOf(dbService.DatabaseUnavailableError);

      expect(releaseMock).toHaveBeenCalled();
    });

    // The only read that selects `preimage`, so the only one whose driver
    // error can quote the secret back. Nothing about the caught error may
    // survive onto the thrown one.
    it("does not carry the driver's message or the secret onto the thrown error", async () => {
      queryMock.mockRejectedValueOnce(
        new Error(`could not read row {"preimage":"${PREIMAGE}"}`)
      );

      const error = await dbService
        .getHodlEscrowSettlementSecret(PAYMENT_HASH)
        .catch((e) => e);

      expect(error).toBeInstanceOf(dbService.DatabaseUnavailableError);
      expect(error.message).not.toContain(PREIMAGE);
      expect(error.message).not.toContain("could not read row");
      expect(JSON.stringify(error.cause ?? null)).not.toContain(PREIMAGE);
    });
  });

  // The counterpart to every wrapped read above. These run *after* the
  // provider has already settled or cancelled, so their failure is a row that
  // disagrees with the Lightning node — something to investigate, never
  // something to retry through. They must keep propagating the raw error so
  // the endpoints keep answering 500.
  describe("post-resolution status writes stay unwrapped", () => {
    it.each([
      [
        "markHodlEscrowOrderSettled",
        () => dbService.markHodlEscrowOrderSettled(PAYMENT_HASH),
      ],
      [
        "markHodlEscrowOrderCancelled",
        () => dbService.markHodlEscrowOrderCancelled(PAYMENT_HASH),
      ],
    ])("%s propagates the raw failure", async (_label, call) => {
      queryMock.mockRejectedValueOnce(new Error("db down"));

      const error = await call().catch((e: unknown) => e);

      expect(error).not.toBeInstanceOf(dbService.DatabaseUnavailableError);
      expect((error as Error).message).toBe("db down");
      expect(releaseMock).toHaveBeenCalled();
    });
  });

  describe("updateHodlEscrowOrderStatusIfAdvancing", () => {
    /**
     * Stands in for the transaction: BEGIN, the row-locking SELECT, then
     * either an UPDATE + COMMIT (if the caller's test also queues one) or
     * just COMMIT.
     */
    function queueSelectedStatus(status: string) {
      queryMock
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ status }] }); // SELECT ... FOR UPDATE
    }

    it.each([
      ["open", "accepted"],
      ["open", "cancelled"],
      ["open", "settled"],
      ["accepted", "settled"],
      ["accepted", "cancelled"],
    ] as const)(
      "advances %s to %s and writes the new status",
      async (from, to) => {
        queueSelectedStatus(from);
        queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE
        queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

        const result = await dbService.updateHodlEscrowOrderStatusIfAdvancing(
          PAYMENT_HASH,
          to
        );

        expect(result).toBe(to);
        const updateCall = queryMock.mock.calls.find(([sql]) =>
          String(sql).includes("UPDATE hodl_escrow_orders")
        );
        expect(updateCall).toBeDefined();
        expect(updateCall![1]).toEqual([PAYMENT_HASH, to]);
      }
    );

    describe("accepted_at stamping", () => {
      it("sets accepted_at in the same statement on open -> accepted", async () => {
        queueSelectedStatus("open");
        queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE
        queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

        await dbService.updateHodlEscrowOrderStatusIfAdvancing(
          PAYMENT_HASH,
          "accepted"
        );

        const updateCall = queryMock.mock.calls.find(([sql]) =>
          String(sql).includes("UPDATE hodl_escrow_orders")
        );
        expect(updateCall).toBeDefined();
        const [updateSql, updateValues] = updateCall!;
        expect(String(updateSql)).toContain("accepted_at = CURRENT_TIMESTAMP");
        // Still a single UPDATE statement — accepted_at is not a bindable
        // parameter, it comes from the same CURRENT_TIMESTAMP as the write.
        expect(updateValues).toEqual([PAYMENT_HASH, "accepted"]);
      });

      it.each([
        ["open", "cancelled"],
        ["open", "settled"],
        ["accepted", "settled"],
        ["accepted", "cancelled"],
      ] as const)("never touches accepted_at on %s -> %s", async (from, to) => {
        queueSelectedStatus(from);
        queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE
        queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

        await dbService.updateHodlEscrowOrderStatusIfAdvancing(
          PAYMENT_HASH,
          to
        );

        const updateCall = queryMock.mock.calls.find(([sql]) =>
          String(sql).includes("UPDATE hodl_escrow_orders")
        );
        expect(updateCall).toBeDefined();
        expect(String(updateCall![0])).not.toContain("accepted_at");
      });

      it("does not write accepted_at when the row is already accepted (no-op)", async () => {
        queueSelectedStatus("accepted");
        queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

        await dbService.updateHodlEscrowOrderStatusIfAdvancing(
          PAYMENT_HASH,
          "accepted"
        );

        expect(
          queryMock.mock.calls.some(([sql]) =>
            String(sql).includes("UPDATE hodl_escrow_orders")
          )
        ).toBe(false);
      });
    });

    it.each([
      ["settled", "open"],
      ["settled", "accepted"],
      ["settled", "cancelled"],
      ["cancelled", "open"],
      ["cancelled", "accepted"],
      ["cancelled", "settled"],
      ["accepted", "open"],
    ] as const)(
      "refuses to move %s to %s and leaves the row untouched",
      async (from, to) => {
        queueSelectedStatus(from);
        queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

        const result = await dbService.updateHodlEscrowOrderStatusIfAdvancing(
          PAYMENT_HASH,
          to
        );

        expect(result).toBe(from);
        expect(
          queryMock.mock.calls.some(([sql]) =>
            String(sql).includes("UPDATE hodl_escrow_orders")
          )
        ).toBe(false);
      }
    );

    it("is a no-op when the requested status is already current", async () => {
      queueSelectedStatus("accepted");
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

      const result = await dbService.updateHodlEscrowOrderStatusIfAdvancing(
        PAYMENT_HASH,
        "accepted"
      );

      expect(result).toBe("accepted");
      expect(
        queryMock.mock.calls.some(([sql]) =>
          String(sql).includes("UPDATE hodl_escrow_orders")
        )
      ).toBe(false);
    });

    it("returns not-found when no row matches, without writing anything", async () => {
      queryMock
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // SELECT ... FOR UPDATE, no row
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

      const result = await dbService.updateHodlEscrowOrderStatusIfAdvancing(
        PAYMENT_HASH,
        "accepted"
      );

      expect(result).toBe("not-found");
    });

    it("locks the row with SELECT ... FOR UPDATE inside a transaction", async () => {
      queueSelectedStatus("open");
      queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

      await dbService.updateHodlEscrowOrderStatusIfAdvancing(
        PAYMENT_HASH,
        "accepted"
      );

      const calls = queryMock.mock.calls.map(([sql]) => String(sql));
      expect(calls[0]).toBe("BEGIN");
      expect(calls[1]).toContain("FOR UPDATE");
      expect(calls[calls.length - 1]).toBe("COMMIT");
    });

    it("rolls back and rethrows when the transaction fails", async () => {
      queryMock
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error("db down")); // SELECT ... FOR UPDATE
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // ROLLBACK

      await expect(
        dbService.updateHodlEscrowOrderStatusIfAdvancing(
          PAYMENT_HASH,
          "accepted"
        )
      ).rejects.toThrow("db down");

      expect(
        queryMock.mock.calls.some(([sql]) => String(sql) === "ROLLBACK")
      ).toBe(true);
      expect(releaseMock).toHaveBeenCalled();
    });

    it("normalizes a mixed-case payment hash", async () => {
      queueSelectedStatus("open");
      queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // COMMIT

      await dbService.updateHodlEscrowOrderStatusIfAdvancing(
        PAYMENT_HASH.toUpperCase(),
        "accepted"
      );

      const [, selectValues] = queryMock.mock.calls[1];
      expect(selectValues).toEqual([PAYMENT_HASH]);
    });
  });

  describe("listPendingHodlEscrowOrderPaymentHashes", () => {
    it("queries only open and accepted rows", async () => {
      queryMock.mockResolvedValueOnce({
        rowCount: 2,
        rows: [
          { payment_hash: PAYMENT_HASH },
          { payment_hash: "d".repeat(64) },
        ],
      });

      const hashes = await dbService.listPendingHodlEscrowOrderPaymentHashes();

      expect(hashes).toEqual([PAYMENT_HASH, "d".repeat(64)]);
      const [sql] = queryMock.mock.calls[0];
      expect(sql).toContain("WHERE status IN ('open', 'accepted')");
    });

    it("returns an empty list when nothing is pending", async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      await expect(
        dbService.listPendingHodlEscrowOrderPaymentHashes()
      ).resolves.toEqual([]);
    });

    it("releases the client when the query fails", async () => {
      queryMock.mockRejectedValueOnce(new Error("db down"));

      await expect(
        dbService.listPendingHodlEscrowOrderPaymentHashes()
      ).rejects.toThrow("db down");

      expect(releaseMock).toHaveBeenCalled();
    });
  });

  describe("getHodlEscrowOrderDisputeContext", () => {
    it("returns the parties and accepted_at", async () => {
      const acceptedAt = new Date("2026-08-05T12:00:00.000Z");
      queryMock.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            buyer_nostr_pubkey: registration.buyerNostrPubkey,
            seller_nostr_pubkey: registration.sellerNostrPubkey,
            accepted_at: acceptedAt,
          },
        ],
      });

      const context =
        await dbService.getHodlEscrowOrderDisputeContext(PAYMENT_HASH);

      expect(context).toEqual({
        buyerNostrPubkey: registration.buyerNostrPubkey,
        sellerNostrPubkey: registration.sellerNostrPubkey,
        acceptedAt,
      });
    });

    it("returns a null acceptedAt for an order never accepted", async () => {
      queryMock.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            buyer_nostr_pubkey: registration.buyerNostrPubkey,
            seller_nostr_pubkey: registration.sellerNostrPubkey,
            accepted_at: null,
          },
        ],
      });

      const context =
        await dbService.getHodlEscrowOrderDisputeContext(PAYMENT_HASH);

      expect(context?.acceptedAt).toBeNull();
    });

    it("never selects the preimage", async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      await dbService.getHodlEscrowOrderDisputeContext(PAYMENT_HASH);

      const [sql] = queryMock.mock.calls[0];
      expect(sql).not.toContain("preimage");
      expect(sql).not.toContain("*");
    });

    it("looks up the lowercased payment hash", async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      await dbService.getHodlEscrowOrderDisputeContext(
        PAYMENT_HASH.toUpperCase()
      );

      const [, values] = queryMock.mock.calls[0];
      expect(values).toEqual([PAYMENT_HASH]);
    });

    it("returns null for an unregistered payment hash", async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      await expect(
        dbService.getHodlEscrowOrderDisputeContext(PAYMENT_HASH)
      ).resolves.toBeNull();
    });

    it("throws DatabaseUnavailableError and releases the client when the lookup fails", async () => {
      queryMock.mockRejectedValueOnce(new Error("db down"));

      await expect(
        dbService.getHodlEscrowOrderDisputeContext(PAYMENT_HASH)
      ).rejects.toBeInstanceOf(dbService.DatabaseUnavailableError);

      expect(releaseMock).toHaveBeenCalled();
    });
  });

  /**
   * Why accepted_at must be TIMESTAMPTZ rather than TIMESTAMP.
   *
   * getHodlEscrowOrderDisputeContext hands node-postgres' parsed Date straight
   * to evaluateHodlDisputeActionability, which does epoch arithmetic on it.
   * That arithmetic is only as correct as the Date, and the Date comes from
   * node-postgres' per-OID text parsers — so these assert the library
   * behaviour the column type depends on, without needing a live server.
   *
   * OID 1114 is `timestamp without time zone`, 1184 is `with time zone`.
   */
  describe("accepted_at timezone round-tripping", () => {
    // The real pg, not the Pool stub this file mocks in.
    const pgTypes = (jest.requireActual("pg") as typeof import("pg")).types;
    const parseTimestamp = pgTypes.getTypeParser(1114);
    const parseTimestamptz = pgTypes.getTypeParser(1184);

    // Note for anyone extending this: do not try to vary the zone by assigning
    // process.env.TZ. Jest's sandboxed process.env does not reach the hook that
    // invalidates V8's timezone cache, so Date keeps using the runner's zone
    // and every such case passes vacuously. These assertions are phrased to
    // hold in whatever zone the runner is actually on instead.
    const INSTANT_ISO = "2026-08-05T12:00:00.000Z";
    const BARE = "2026-08-05 12:00:00";

    // The same instant as a TIMESTAMPTZ column renders it under three
    // different server session zones. Whatever offset Postgres sends, the
    // instant it denotes is the same one.
    it.each([
      ["+00", "2026-08-05 12:00:00+00"],
      ["+05:30", "2026-08-05 17:30:00+05:30"],
      ["-04", "2026-08-05 08:00:00-04"],
      ["+14", "2026-08-06 02:00:00+14"],
    ])(
      "parses a TIMESTAMPTZ value sent as %s to the one instant",
      (_, wire) => {
        expect(parseTimestamptz(wire).toISOString()).toBe(INSTANT_ISO);
      }
    );

    it("resolves a bare TIMESTAMP value against the reading process's zone", () => {
      // This is the defect the column type change fixes. Bare digits carry no
      // zone, so node-postgres resolves them locally: the instant that comes
      // back is displaced by exactly the reading process's UTC offset, which
      // shifts the SELLER_DISPUTE_TIMEOUT_SECONDS window by that much on every
      // non-UTC deployment.
      const localOffsetMinutes = new Date(INSTANT_ISO).getTimezoneOffset();
      const skewMinutes =
        (parseTimestamp(BARE).getTime() - Date.parse(INSTANT_ISO)) / 60_000;

      expect(skewMinutes).toBe(localOffsetMinutes);

      // Identical digits, and the declared type is the only difference: the
      // TIMESTAMPTZ reading carries no skew at all, in any runner zone.
      expect(parseTimestamptz(`${BARE}+00`).toISOString()).toBe(INSTANT_ISO);
    });

    // The equality above degenerates to 0 === 0 on a UTC runner, so state the
    // mechanism in a form that bites everywhere: two identical wire values,
    // and only the OID differs.
    it("disagrees between the two OIDs exactly when the runner is off UTC", () => {
      const localOffsetMinutes = new Date(INSTANT_ISO).getTimezoneOffset();
      const asTimestamp = parseTimestamp(BARE).getTime();
      const asTimestamptz = parseTimestamptz(`${BARE}+00`).getTime();

      expect((asTimestamp - asTimestamptz) / 60_000).toBe(localOffsetMinutes);
      // The end-to-end guard that does not depend on the runner's zone at all
      // lives in db-service.test.ts ("round-trips hodl accepted_at as an
      // absolute instant off UTC on both sides").
    });
  });
});
