/** @jest-environment node */

jest.mock("@/utils/db/affiliates", () => ({
  lookupAffiliateCode: jest.fn(),
  isAffiliateCodeValid: jest.fn(),
  isSelfReferral: jest.fn(() => false),
  computeBuyerDiscountSmallest: jest.fn(),
  computeRebateSmallest: jest.fn(),
  recordReferral: jest.fn(),
}));

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: jest.fn(() => true),
}));

import handler from "@/pages/api/affiliates/record-referral";
import {
  computeBuyerDiscountSmallest,
  computeRebateSmallest,
  isAffiliateCodeValid,
  isSelfReferral,
  lookupAffiliateCode,
  recordReferral,
} from "@/utils/db/affiliates";

const mLookup = lookupAffiliateCode as jest.Mock;
const mValid = isAffiliateCodeValid as jest.Mock;
const mSelf = isSelfReferral as jest.Mock;
const mDiscount = computeBuyerDiscountSmallest as jest.Mock;
const mRebate = computeRebateSmallest as jest.Mock;
const mRecord = recordReferral as jest.Mock;

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
  buyer_discount_type: "percent" as const,
  buyer_discount_value: "5",
  rebate_type: "percent" as const,
  rebate_value: "10",
  payout_schedule: "monthly",
  currency: "usd",
  affiliate: { name: "Alice", affiliate_pubkey: "aff_pk" },
};

beforeEach(() => {
  jest.clearAllMocks();
  mDiscount.mockReturnValue(500);
  mRebate.mockReturnValue(950);
});

describe("/api/affiliates/record-referral", () => {
  it("rejects non-POST", async () => {
    const req: any = { method: "GET" };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it("returns 400 when fields are missing", async () => {
    const req: any = { method: "POST", body: { sellerPubkey: "s" } };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("rejects fixed-amount currency mismatch", async () => {
    mLookup.mockResolvedValue({
      ...baseCode,
      buyer_discount_type: "fixed",
      currency: "usd",
    });
    mValid.mockResolvedValue(true);
    const req: any = {
      method: "POST",
      body: {
        sellerPubkey: "seller",
        code: "ALICE",
        orderId: "o1",
        paymentRail: "stripe",
        grossSubtotalSmallest: 10000,
        currency: "sats",
      },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(String(res.body.error)).toMatch(/currency/i);
  });

  it("rejects self-referral", async () => {
    mLookup.mockResolvedValue(baseCode);
    mValid.mockResolvedValue(true);
    mSelf.mockReturnValueOnce(true);
    const req: any = {
      method: "POST",
      body: {
        sellerPubkey: "seller",
        code: "ALICE",
        orderId: "o1",
        paymentRail: "stripe",
        grossSubtotalSmallest: 10000,
        currency: "usd",
      },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(String(res.body.error)).toMatch(/self-referral/i);
  });

  it("records a referral and returns the computed amounts", async () => {
    mLookup.mockResolvedValue(baseCode);
    mValid.mockResolvedValue(true);
    mRecord.mockResolvedValue({ id: 42 });
    const req: any = {
      method: "POST",
      body: {
        sellerPubkey: "seller",
        code: "ALICE",
        orderId: "o1",
        paymentRail: "stripe",
        grossSubtotalSmallest: 10000,
        currency: "usd",
      },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      referralId: 42,
      buyerDiscountSmallest: 500,
      rebateSmallest: 950,
    });
    expect(mRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        initialStatus: "pending",
        realtimeTransferRef: null,
      })
    );
  });

  it("surfaces max_uses contention as 409", async () => {
    mLookup.mockResolvedValue(baseCode);
    mValid.mockResolvedValue(true);
    mRecord.mockRejectedValue(new Error("max_uses reached"));
    const req: any = {
      method: "POST",
      body: {
        sellerPubkey: "seller",
        code: "ALICE",
        orderId: "o1",
        paymentRail: "stripe",
        grossSubtotalSmallest: 10000,
        currency: "usd",
      },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(409);
    expect(String(res.body.error)).toMatch(/max_uses/);
  });
});
