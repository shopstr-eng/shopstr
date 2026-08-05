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
});
