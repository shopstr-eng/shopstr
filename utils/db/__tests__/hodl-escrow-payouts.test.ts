/** @jest-environment node */
import { EventEmitter } from "events";
const client = Object.assign(new EventEmitter(), {
  query: jest.fn(),
  release: jest.fn(),
});
const pool = { connect: jest.fn(async () => client), query: jest.fn() };
jest.mock("../db-service", () => ({ getInitializedDbPool: async () => pool }));
import { withHodlPayout, listOwedHodlPayouts } from "../hodl-payout-store";
beforeEach(() => {
  jest.clearAllMocks();
  client.query.mockImplementation(async (sql: string) => {
    if (sql.includes("pg_try_advisory")) return { rows: [{ locked: true }] };
    if (sql.includes("SELECT status, seller"))
      return {
        rows: [
          {
            status: "settled",
            seller_nostr_pubkey: "seller",
            amount_sats: "42",
          },
        ],
      };
    if (sql.includes("SELECT status, payout"))
      return {
        rows: [{ status: "pending", payout_invoice: null, attempt_count: 0 }],
      };
    return { rows: [], rowCount: 1 };
  });
});
it("releases the session lock even when the worker throws", async () => {
  await expect(
    withHodlPayout("hash", async () => {
      throw new Error("crash");
    })
  ).rejects.toThrow("crash");
  expect(client.query).toHaveBeenLastCalledWith(
    expect.stringContaining("pg_advisory_unlock"),
    ["hash"]
  );
  expect(client.release).toHaveBeenCalledWith(false);
});
it("does not run a competing worker", async () => {
  client.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
  const work = jest.fn();
  expect(await withHodlPayout("hash", work)).toBeNull();
  expect(work).not.toHaveBeenCalled();
});
it("prevents further database writes after a lock connection failure", async () => {
  await expect(
    withHodlPayout("hash", async (row) => {
      client.emit("error", new Error("lost connection"));
      await row!.recordAttempt();
    })
  ).rejects.toThrow("connection lost");
  expect(client.release).toHaveBeenCalledWith(true);
});
it("refuses to overwrite an invoice already committed by another worker", async () => {
  await expect(
    withHodlPayout("hash", async (row) => {
      client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await row!.saveInvoice("new invoice");
    })
  ).rejects.toThrow("already recorded");
});
it("scans settled obligations including missing payout records", async () => {
  pool.query.mockResolvedValue({ rows: [{ payment_hash: "owed" }] });
  expect(await listOwedHodlPayouts()).toEqual(["owed"]);
  expect(pool.query).toHaveBeenCalledWith(
    expect.stringContaining("LEFT JOIN hodl_escrow_payouts")
  );
});
