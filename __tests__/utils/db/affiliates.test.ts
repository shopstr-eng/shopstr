/**
 * Pure-function unit tests for the affiliate helper module. We only cover
 * the math/predicate helpers that don't need a Postgres connection — DB
 * integration is exercised end-to-end in staging.
 *
 * We mock `@/utils/db/db-service` because importing it transitively pulls
 * in nostr-tools / @noble through `utils/url-slugs.ts`, which jest's
 * default transformer can't parse. The pure helpers we test here never
 * touch the pool, so the mock is just a stub.
 */
jest.mock("@/utils/db/db-service", () => ({
  getDbPool: () => ({
    connect: () => ({ query: jest.fn(), release: jest.fn() }),
  }),
}));

import {
  computeBuyerDiscountSmallest,
  computeClawbackSmallest,
  computeRebateSmallest,
  computeRefundRatio,
  isSelfReferral,
  MAX_PAYOUT_FAILURES,
} from "@/utils/db/affiliates";

describe("computeBuyerDiscountSmallest", () => {
  it("returns 0 for non-positive gross", () => {
    expect(computeBuyerDiscountSmallest(0, "percent", 10)).toBe(0);
    expect(computeBuyerDiscountSmallest(-100, "percent", 10)).toBe(0);
  });

  it("applies a percentage cleanly", () => {
    expect(computeBuyerDiscountSmallest(10_000, "percent", 10)).toBe(1_000);
    expect(computeBuyerDiscountSmallest(9_999, "percent", 33)).toBe(3_299);
  });

  it("caps a percentage at 100", () => {
    expect(computeBuyerDiscountSmallest(1_000, "percent", 250)).toBe(999);
  });

  it("treats fixed values as major units (cents)", () => {
    expect(computeBuyerDiscountSmallest(10_000, "fixed", 5)).toBe(500);
  });

  it("never lets a fixed cut equal or exceed gross", () => {
    expect(computeBuyerDiscountSmallest(500, "fixed", 9)).toBe(499);
  });
});

describe("computeRebateSmallest", () => {
  it("applies a percentage to the net subtotal", () => {
    expect(computeRebateSmallest(9_000, "percent", 10)).toBe(900);
  });

  it("caps at the net so we never owe more than the buyer paid", () => {
    expect(computeRebateSmallest(100, "fixed", 5)).toBe(100);
  });

  it("returns 0 for a zero or negative net", () => {
    expect(computeRebateSmallest(0, "percent", 50)).toBe(0);
    expect(computeRebateSmallest(-10, "fixed", 1)).toBe(0);
  });
});

describe("isSelfReferral", () => {
  it("matches case-insensitively", () => {
    expect(isSelfReferral("ABC", "abc")).toBe(true);
    expect(isSelfReferral("abc", "ABC")).toBe(true);
  });

  it("returns false for distinct pubkeys", () => {
    expect(isSelfReferral("abc", "def")).toBe(false);
  });

  it("returns false when the affiliate has not claimed yet", () => {
    expect(isSelfReferral("abc", null)).toBe(false);
    expect(isSelfReferral("abc", undefined)).toBe(false);
  });
});

describe("computeRefundRatio", () => {
  it("clamps to 1 on overshoot", () => {
    expect(computeRefundRatio(100, 200)).toBe(1);
  });

  it("returns 0 when gross or refund is invalid", () => {
    expect(computeRefundRatio(0, 50)).toBe(0);
    expect(computeRefundRatio(100, 0)).toBe(0);
    expect(computeRefundRatio(NaN, 50)).toBe(0);
  });

  it("returns the proportional fraction otherwise", () => {
    expect(computeRefundRatio(1_000, 250)).toBeCloseTo(0.25);
  });
});

describe("computeClawbackSmallest", () => {
  it("scales the rebate down by the ratio", () => {
    expect(computeClawbackSmallest(1_000, 0.25)).toBe(250);
  });

  it("clamps the ratio to 0..1", () => {
    expect(computeClawbackSmallest(1_000, 1.5)).toBe(1_000);
    expect(computeClawbackSmallest(1_000, -1)).toBe(0);
  });

  it("floors fractional cents", () => {
    expect(computeClawbackSmallest(99, 0.5)).toBe(49);
  });
});

describe("MAX_PAYOUT_FAILURES", () => {
  it("is a sane positive integer", () => {
    expect(Number.isInteger(MAX_PAYOUT_FAILURES)).toBe(true);
    expect(MAX_PAYOUT_FAILURES).toBeGreaterThan(0);
  });
});
