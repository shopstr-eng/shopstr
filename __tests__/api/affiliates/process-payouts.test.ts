/** @jest-environment node */

// Stripe SDK is imported by the handler; stub the constructor before importing
// the route so we don't try to talk to the real API. Individual tests reach in
// via the captured instance below.
// Babel-jest hoists `jest.mock` calls above all imports AND above the rest of
// the file's top-level statements. Because `import handler from
// "@/pages/api/affiliates/process-payouts"` triggers `new Stripe(...)` at the
// route module's top level, the Stripe mock factory is invoked BEFORE any of
// our top-level `const x = jest.fn()` declarations have executed. We work
// around this by:
//   1. building the spies inside the factory itself (so they exist by the
//      time the route's `new Stripe(...)` runs), and
//   2. exposing them on the mock module so the test file can grab them after
//      the import.
jest.mock("stripe", () => {
  const transfersCreate = jest.fn();
  const accountsRetrieve = jest.fn();
  const Ctor: any = jest.fn().mockImplementation(() => ({
    transfers: { create: transfersCreate },
    accounts: { retrieve: accountsRetrieve },
  }));
  Ctor.__transfersCreate = transfersCreate;
  Ctor.__accountsRetrieve = accountsRetrieve;
  return Ctor;
});

jest.mock("@getalby/lightning-tools", () => ({
  LightningAddress: jest.fn().mockImplementation(() => ({
    fetch: jest.fn(),
    requestInvoice: () => ({ paymentRequest: "lnbc1pfake" }),
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const StripeMock: any = require("stripe");
const stripeTransfersCreate: jest.Mock = StripeMock.__transfersCreate;
const stripeAccountsRetrieve: jest.Mock = StripeMock.__accountsRetrieve;

// Whole-module mock for the affiliates DB layer. We re-export only the surface
// the handler actually reaches for.
jest.mock("@/utils/db/affiliates", () => ({
  ADVISORY_LOCK_KEYS: {
    weekly: 100,
    biweekly: 101,
    monthly: 102,
    daily: 103,
    every_sale: 104,
  },
  MAX_PAYOUT_FAILURES: 3,
  affiliateLockKey: (id: number) => 200 + id,
  clearPayoutFailure: jest.fn(),
  createPayoutAndSettle: jest.fn(),
  getAffiliateById: jest.fn(),
  getPayableReferralBundle: jest.fn(),
  getSellerEmailForPubkey: jest.fn(),
  markReferralsPayableBySchedule: jest.fn(),
  recordPayoutFailure: jest.fn(),
  tryAdvisoryLock: jest.fn(),
}));

jest.mock("@/utils/db/db-service", () => {
  const queryFn = jest.fn();
  const release = jest.fn();
  return {
    __queryFn: queryFn,
    __release: release,
    getDbPool: () => ({
      connect: async () => ({ query: queryFn, release }),
    }),
  };
});
const dbServiceMock: any = require("@/utils/db/db-service");
const queryFn: jest.Mock = dbServiceMock.__queryFn;

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: jest.fn(() => true),
}));

jest.mock("@/utils/email/email-service", () => ({
  sendAffiliatePaidEmail: jest.fn().mockResolvedValue(true),
  sendAffiliatePausedToAffiliate: jest.fn().mockResolvedValue(true),
  sendAffiliatePausedToSeller: jest.fn().mockResolvedValue(true),
}));
import * as emailService from "@/utils/email/email-service";
const sendPaid = emailService.sendAffiliatePaidEmail as unknown as jest.Mock;
const sendPausedAffiliate =
  emailService.sendAffiliatePausedToAffiliate as unknown as jest.Mock;
const sendPausedSeller =
  emailService.sendAffiliatePausedToSeller as unknown as jest.Mock;

import handler from "@/pages/api/affiliates/process-payouts";
import {
  clearPayoutFailure,
  createPayoutAndSettle,
  getAffiliateById,
  getPayableReferralBundle,
  getSellerEmailForPubkey,
  markReferralsPayableBySchedule,
  recordPayoutFailure,
  tryAdvisoryLock,
} from "@/utils/db/affiliates";

const mAff = getAffiliateById as jest.Mock;
const mBundles = getPayableReferralBundle as jest.Mock;
const mMarkPayable = markReferralsPayableBySchedule as jest.Mock;
const mSettle = createPayoutAndSettle as jest.Mock;
const mRecordFailure = recordPayoutFailure as jest.Mock;
const mClearFailure = clearPayoutFailure as jest.Mock;
const mLock = tryAdvisoryLock as jest.Mock;
const mSellerEmail = getSellerEmailForPubkey as jest.Mock;

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

const baseAffiliate = {
  id: 7,
  seller_pubkey: "a".repeat(64),
  name: "Alice",
  email: "alice@example.com",
  affiliate_pubkey: "b".repeat(64),
  invite_token: "tok_alice",
  invite_claimed_at: new Date(),
  lightning_address: null,
  stripe_account_id: "acct_test",
  notes: null,
  payouts_enabled: true,
  payout_failure_count: 0,
  last_payout_failure_at: null,
  last_payout_failure_reason: null,
  email_notifications_enabled: true,
  stripe_charges_enabled: true,
  stripe_payouts_enabled: true,
  stripe_onboarding_complete: true,
  created_at: new Date(),
  updated_at: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AFFILIATE_PAYOUT_CRON_SECRET = "test-cron-secret";
  process.env.AFFILIATE_UNSUBSCRIBE_SECRET = "x".repeat(32);
  process.env.STRIPE_SECRET_KEY = "sk_test_x";

  mLock.mockImplementation(async () => ({
    release: jest.fn().mockResolvedValue(undefined),
  }));
  mAff.mockResolvedValue({ ...baseAffiliate });
  mBundles.mockResolvedValue([
    {
      currency: "usd",
      total_smallest: "1000",
      referral_ids: [11, 12],
      seller_pubkey: baseAffiliate.seller_pubkey,
    },
  ]);
  mMarkPayable.mockResolvedValue({ promoted: 0 });
  mSettle.mockResolvedValue({ payoutId: 999 });
  mRecordFailure.mockResolvedValue(baseAffiliate);
  mClearFailure.mockResolvedValue(undefined);
  mSellerEmail.mockResolvedValue("seller@example.com");
  stripeTransfersCreate.mockResolvedValue({
    id: "tr_123",
    amount: 1000,
    currency: "usd",
  });
  stripeAccountsRetrieve.mockResolvedValue({
    charges_enabled: true,
    payouts_enabled: true,
  });
  queryFn.mockResolvedValue({ rows: [{ affiliate_id: 7 }] });
});

function callHandler(
  overrides: Partial<{
    authorization: string;
    query: Record<string, string>;
  }> = {}
) {
  const req: any = {
    method: "POST",
    query: { schedule: "monthly", ...(overrides.query ?? {}) },
    headers: {
      authorization:
        overrides.authorization ??
        `Bearer ${process.env.AFFILIATE_PAYOUT_CRON_SECRET}`,
    },
    body: {},
  };
  const res = mockRes();
  return handler(req as any, res as any).then(() => res);
}

describe("process-payouts auth + locking", () => {
  it("rejects non-POST", async () => {
    const req: any = { method: "GET", query: {}, headers: {} };
    const res = mockRes();
    await handler(req, res as any);
    expect(res.statusCode).toBe(405);
  });

  it("rejects missing bearer secret", async () => {
    const res = await callHandler({ authorization: "" });
    expect(res.statusCode).toBe(401);
    expect(mMarkPayable).not.toHaveBeenCalled();
  });

  it("rejects when AFFILIATE_PAYOUT_CRON_SECRET is unset", async () => {
    delete process.env.AFFILIATE_PAYOUT_CRON_SECRET;
    const req: any = {
      method: "POST",
      query: { schedule: "monthly" },
      headers: { authorization: "Bearer anything" },
      body: {},
    };
    const res = mockRes();
    await handler(req, res as any);
    expect(res.statusCode).toBe(500);
  });

  it("rejects unknown schedule", async () => {
    const res = await callHandler({ query: { schedule: "annually" } });
    expect(res.statusCode).toBe(400);
  });

  it("returns 409 when the schedule advisory lock is held", async () => {
    mLock.mockResolvedValueOnce(null);
    const res = await callHandler();
    expect(res.statusCode).toBe(409);
  });
});

describe("process-payouts business rules", () => {
  it("skips affiliates whose payouts_enabled flag is off", async () => {
    mAff.mockResolvedValueOnce({ ...baseAffiliate, payouts_enabled: false });
    const res = await callHandler();
    expect(res.statusCode).toBe(200);
    expect(stripeTransfersCreate).not.toHaveBeenCalled();
    expect(res.body.processed[0]).toMatchObject({
      affiliateId: 7,
      success: false,
    });
    expect(res.body.processed[0].error).toMatch(/disabled/i);
  });

  it("dry-run does not promote referrals or move money", async () => {
    const res = await callHandler({
      query: { schedule: "monthly", dryRun: "1" },
    });
    expect(res.statusCode).toBe(200);
    expect(mMarkPayable).not.toHaveBeenCalled();
    expect(stripeTransfersCreate).not.toHaveBeenCalled();
  });

  it("happy path: Stripe transfer fires, referrals marked paid, success email sent", async () => {
    const res = await callHandler();
    expect(res.statusCode).toBe(200);
    expect(stripeTransfersCreate).toHaveBeenCalledTimes(1);
    const args = stripeTransfersCreate.mock.calls[0]![0];
    expect(args).toMatchObject({
      amount: 1000,
      currency: "usd",
      destination: "acct_test",
    });
    // Idempotency key MUST be stable + non-empty so retries dedupe.
    expect(stripeTransfersCreate.mock.calls[0]![1].idempotencyKey).toBeTruthy();
    expect(mSettle).toHaveBeenCalledWith(
      expect.objectContaining({
        affiliateId: 7,
        method: "stripe",
        amountSmallest: 1000,
        currency: "usd",
        externalRef: "tr_123",
        referralIds: [11, 12],
      })
    );
    expect(mClearFailure).toHaveBeenCalledWith(7);
    expect(sendPaid).toHaveBeenCalledTimes(1);
    expect(sendPaid.mock.calls[0]![1].unsubscribeUrl).toMatch(/unsubscribe/);
  });

  it("does not send the paid email when affiliate opted out", async () => {
    mAff.mockResolvedValueOnce({
      ...baseAffiliate,
      email_notifications_enabled: false,
    });
    const res = await callHandler();
    expect(res.statusCode).toBe(200);
    expect(sendPaid).not.toHaveBeenCalled();
  });

  it("Stripe transfer failure records a failure and never marks paid", async () => {
    stripeTransfersCreate.mockRejectedValueOnce(new Error("acct closed"));
    const res = await callHandler();
    expect(res.statusCode).toBe(200);
    expect(mRecordFailure).toHaveBeenCalledWith(
      7,
      expect.stringMatching(/acct closed/)
    );
    expect(mSettle).not.toHaveBeenCalled();
  });

  it("auto-disables and notifies after MAX_PAYOUT_FAILURES is reached", async () => {
    stripeTransfersCreate.mockRejectedValueOnce(new Error("blocked"));
    // First call: initial fetch at top of loop. Second call: re-read after
    // recordPayoutFailure to detect that the threshold was crossed.
    mAff.mockResolvedValueOnce({ ...baseAffiliate }).mockResolvedValueOnce({
      ...baseAffiliate,
      payouts_enabled: false,
      payout_failure_count: 3,
      last_payout_failure_reason: "blocked",
    });
    const res = await callHandler();
    expect(res.statusCode).toBe(200);
    expect(sendPausedAffiliate).toHaveBeenCalledTimes(1);
    expect(sendPausedAffiliate.mock.calls[0]![1].unsubscribeUrl).toMatch(
      /unsubscribe/
    );
    expect(sendPausedSeller).toHaveBeenCalledTimes(1);
  });

  it("respects the per-currency minimum payout threshold", async () => {
    mBundles.mockResolvedValueOnce([
      {
        currency: "usd",
        total_smallest: "10",
        referral_ids: [1],
        seller_pubkey: baseAffiliate.seller_pubkey,
      },
    ]);
    const res = await callHandler();
    expect(res.statusCode).toBe(200);
    expect(stripeTransfersCreate).not.toHaveBeenCalled();
    expect(res.body.processed[0].error).toMatch(/minimum/i);
  });
});
