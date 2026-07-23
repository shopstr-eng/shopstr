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

const registration = {
  orderId: "order-1",
  buyerNostrPubkey: "1".repeat(64),
  sellerNostrPubkey: "2".repeat(64),
  sellerCashuPubkey: "3".repeat(64),
  buyerCashuPubkey: "4".repeat(64),
  arbiterCashuPubkey: "5".repeat(64),
  amountSats: 42,
  locktime: 2_000_000_000,
  tokenHash: "6".repeat(64),
};

const storedRow = {
  order_id: registration.orderId,
  buyer_nostr_pubkey: registration.buyerNostrPubkey,
  seller_nostr_pubkey: registration.sellerNostrPubkey,
  seller_cashu_pubkey: registration.sellerCashuPubkey,
  buyer_cashu_pubkey: registration.buyerCashuPubkey,
  arbiter_cashu_pubkey: registration.arbiterCashuPubkey,
  amount_sats: String(registration.amountSats),
  locktime: String(registration.locktime),
  token_hash: registration.tokenHash,
  ruling_for: null,
};

describe("P2PK escrow order records", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(() => {
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/shopstr";
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await dbService.closeDbPool();
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("creates a new immutable order commitment", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [storedRow] });

    const result = await (dbService as any).registerP2pkEscrowOrder(
      registration
    );

    expect(result).toBe("created");
    expect(releaseMock).toHaveBeenCalled();
  });

  it("accepts an idempotent registration and rejects changed details", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [storedRow] });

    await expect(
      (dbService as any).registerP2pkEscrowOrder(registration)
    ).resolves.toBe("existing");

    queryMock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({
        rows: [{ ...storedRow, token_hash: "7".repeat(64) }],
      });

    await expect(
      (dbService as any).registerP2pkEscrowOrder(registration)
    ).resolves.toBe("conflict");
  });

  it("returns the complete authoritative order record", async () => {
    queryMock.mockResolvedValueOnce({ rows: [storedRow] });

    await expect(
      (dbService as any).getP2pkEscrowOrder("order-1")
    ).resolves.toEqual({
      ...registration,
      rulingFor: null,
    });
  });

  it("records one final ruling while allowing same-winner delivery retries", async () => {
    queryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ ruling_for: null }] })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await expect(
      (dbService as any).recordP2pkEscrowRuling("order-1", "buyer")
    ).resolves.toBe("recorded");

    queryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ ruling_for: "buyer" }] })
      .mockResolvedValueOnce(undefined);

    await expect(
      (dbService as any).recordP2pkEscrowRuling("order-1", "buyer")
    ).resolves.toBe("already-recorded");

    queryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ ruling_for: "buyer" }] })
      .mockResolvedValueOnce(undefined);

    await expect(
      (dbService as any).recordP2pkEscrowRuling("order-1", "seller")
    ).resolves.toBe("conflict");
  });
});
