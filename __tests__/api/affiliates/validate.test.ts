/** @jest-environment node */

jest.mock("@/utils/db/affiliates", () => ({
  lookupAffiliateCode: jest.fn(),
  isAffiliateCodeValid: jest.fn(),
  computeBuyerDiscountSmallest: jest.fn(),
  computeRebateSmallest: jest.fn(),
}));

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: jest.fn(() => true),
}));

import handler from "@/pages/api/affiliates/validate";
import {
  computeBuyerDiscountSmallest,
  computeRebateSmallest,
  isAffiliateCodeValid,
  lookupAffiliateCode,
} from "@/utils/db/affiliates";

const mLookup = lookupAffiliateCode as jest.Mock;
const mValid = isAffiliateCodeValid as jest.Mock;
const mDiscount = computeBuyerDiscountSmallest as jest.Mock;
const mRebate = computeRebateSmallest as jest.Mock;

function mockRes() {
  const r: any = {
    statusCode: 200,
    body: undefined,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: any) {
      this.body = b;
      return this;
    },
    setHeader() {},
    getHeader() {},
  };
  return r;
}

const baseCode = {
  id: 1,
  affiliate_id: 7,
  buyer_discount_type: "fixed" as const,
  buyer_discount_value: "500",
  rebate_type: "percent" as const,
  rebate_value: "10",
  payout_schedule: "monthly",
  currency: "usd",
  affiliate: { name: "Alice", affiliate_pubkey: null },
};

beforeEach(() => {
  jest.clearAllMocks();
  mDiscount.mockReturnValue(500);
  mRebate.mockReturnValue(50);
});

describe("/api/affiliates/validate currency guard", () => {
  it("returns 405 for non-GET", async () => {
    const req: any = { method: "POST", query: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it("rejects a fixed-amount USD code applied to a sats invoice", async () => {
    mLookup.mockResolvedValue(baseCode);
    mValid.mockResolvedValue(true);
    const req: any = {
      method: "GET",
      query: {
        sellerPubkey: "seller",
        code: "ALICE",
        currency: "sats",
        grossSmallest: "10000",
      },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ valid: false });
  });

  it("accepts matching currency and returns rebate preview", async () => {
    mLookup.mockResolvedValue(baseCode);
    mValid.mockResolvedValue(true);
    const req: any = {
      method: "GET",
      query: {
        sellerPubkey: "seller",
        code: "ALICE",
        currency: "USD",
        grossSmallest: "10000",
      },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.buyerDiscountSmallest).toBe(500);
    expect(res.body.rebateSmallest).toBe(50);
  });

  it("allows a percent-only code across currencies", async () => {
    mLookup.mockResolvedValue({
      ...baseCode,
      buyer_discount_type: "percent",
      buyer_discount_value: "5",
      rebate_type: "percent",
      rebate_value: "10",
    });
    mValid.mockResolvedValue(true);
    const req: any = {
      method: "GET",
      query: {
        sellerPubkey: "seller",
        code: "ALICE",
        currency: "sats",
        grossSmallest: "1000",
      },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.body.valid).toBe(true);
  });

  it("returns valid:false for an unknown code without leaking which input was wrong", async () => {
    mLookup.mockResolvedValue(null);
    const req: any = {
      method: "GET",
      query: { sellerPubkey: "seller", code: "BAD" },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.body).toEqual({ valid: false });
  });
});
