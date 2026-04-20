/**
 * @jest-environment node
 *
 * Idempotency test for `reverseReferralsForOrder`. The seller-driven
 * reverse-referral button can be clicked twice (or fired by the Stripe
 * webhook AND clicked manually). The SQL `WHERE status IN
 * ('pending','payable','paid')` clause is what makes the second call a
 * no-op: rows already moved to 'cancelled' / 'refunded' simply aren't
 * touched again.
 *
 * We exercise that contract here by mocking the pg client so the first call
 * sees a pending row and the second call sees an empty rowset.
 */

const queryFn = jest.fn();
const releaseFn = jest.fn();
jest.mock("@/utils/db/db-service", () => ({
  getDbPool: () => ({
    connect: async () => ({ query: queryFn, release: releaseFn }),
  }),
}));

import { reverseReferralsForOrder } from "@/utils/db/affiliates";

describe("reverseReferralsForOrder idempotency", () => {
  beforeEach(() => {
    queryFn.mockReset();
    releaseFn.mockReset();
  });

  it("first call cancels the pending row; second call is a no-op", async () => {
    // -- Call #1 --
    // BEGIN, SELECT (returns 1 row), UPDATE row -> cancelled, COMMIT.
    queryFn
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: 101,
            status: "pending",
            rebate_smallest: "500",
            refunded_smallest: "0",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const first = await reverseReferralsForOrder({
      orderId: "order-xyz",
      sellerPubkey: "seller-pk",
      refundEventRef: "manual:click-1",
    });
    expect(first).toEqual({
      cancelled: 1,
      refunded: 0,
      partial: 0,
      totalClawbackSmallest: 500,
    });

    // -- Call #2 --
    // BEGIN, SELECT (no rows: the previous call moved status to 'cancelled',
    // which the WHERE clause excludes), COMMIT.
    queryFn
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT — empty
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const second = await reverseReferralsForOrder({
      orderId: "order-xyz",
      sellerPubkey: "seller-pk",
      refundEventRef: "manual:click-2",
    });
    expect(second).toEqual({
      cancelled: 0,
      refunded: 0,
      partial: 0,
      totalClawbackSmallest: 0,
    });

    // No UPDATE should have been issued in the second pass — only BEGIN +
    // SELECT + COMMIT (3 of the 7 total queries).
    const allSql = queryFn.mock.calls.map(
      (c) => (c[0] as string).split(/\s+/)[0]?.toUpperCase() ?? ""
    );
    expect(allSql).toEqual([
      "BEGIN",
      "SELECT",
      "UPDATE",
      "COMMIT",
      "BEGIN",
      "SELECT",
      "COMMIT",
    ]);

    expect(releaseFn).toHaveBeenCalledTimes(2);
  });

  it("a paid row is moved to 'refunded' on the first call and ignored on the second", async () => {
    queryFn
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: 202,
            status: "paid",
            rebate_smallest: "1000",
            refunded_smallest: "0",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE -> refunded
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const first = await reverseReferralsForOrder({
      orderId: "order-paid",
      sellerPubkey: "seller-pk",
    });
    expect(first.refunded).toBe(1);
    expect(first.totalClawbackSmallest).toBe(1000);

    queryFn
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT — empty (already 'refunded')
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    const second = await reverseReferralsForOrder({
      orderId: "order-paid",
      sellerPubkey: "seller-pk",
    });
    expect(second).toEqual({
      cancelled: 0,
      refunded: 0,
      partial: 0,
      totalClawbackSmallest: 0,
    });
  });
});
