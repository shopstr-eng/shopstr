/** @jest-environment node */
const runMock = jest.fn();
jest.mock("@/utils/db/hodl-payout-store", () => ({
  withHodlPayout: (...args: unknown[]) => runMock(...args),
}));
import { payoutToSeller, type PayoutDependencies } from "../hodl-seller-payout";
const hash = "ab".repeat(32);
const invoice = {
  paymentRequest: "invoice-one",
  paymentHash: "cd".repeat(32),
  satoshi: 42,
  hasExpired: () => false,
};
let row: any;
let deps: PayoutDependencies;
beforeEach(() => {
  row = {
    orderStatus: "settled",
    amountSats: 42,
    sellerNostrPubkey: "ef".repeat(32),
    status: "pending",
    invoice: null,
    attemptCount: 0,
    saveInvoice: jest.fn(async (value: string) => {
      row.invoice = value;
    }),
    recordAttempt: jest.fn(async () => {
      row.attemptCount++;
    }),
    finish: jest.fn(async (status: string) => {
      row.status = status;
    }),
  };
  runMock.mockImplementation(async (_hash, work) => work(row));
  deps = {
    resolveAddress: jest.fn(async () => "seller@example.com"),
    requestInvoice: jest.fn(async () => invoice),
    decodeInvoice: jest.fn(() => invoice),
    trackPayment: jest.fn(async () => ({ status: "not_found" as const })),
    sendPayment: jest.fn(async () => ({ status: "succeeded" as const })),
  };
});
it("stores an immutable invoice before sending, then records payment", async () => {
  (deps.sendPayment as jest.Mock).mockImplementation(async () => {
    expect(row.invoice).toBe("invoice-one");
    return { status: "succeeded" };
  });
  expect((await payoutToSeller(hash, deps)).status).toBe("paid");
  expect(row.finish).toHaveBeenCalledWith("paid", null);
});
it.each(["unknown", "offline"])(
  "never sends or replaces an existing invoice when LND is %s",
  async (status) => {
    row.invoice = "invoice-one";
    (deps.trackPayment as jest.Mock).mockImplementation(async () => {
      if (status === "offline") throw new Error("offline");
      return { status };
    });
    expect((await payoutToSeller(hash, deps)).status).toBe("unverified");
    expect(deps.sendPayment).not.toHaveBeenCalled();
    expect(deps.requestInvoice).not.toHaveBeenCalled();
  }
);
it("recovers a payment that succeeded before a database/process failure", async () => {
  row.invoice = "invoice-one";
  (deps.trackPayment as jest.Mock).mockResolvedValue({ status: "succeeded" });
  expect((await payoutToSeller(hash, deps)).status).toBe("already_paid");
  expect(deps.sendPayment).not.toHaveBeenCalled();
});
it("retries the same invoice after a definitive failure without requesting another", async () => {
  row.invoice = "invoice-one";
  (deps.trackPayment as jest.Mock).mockResolvedValue({ status: "failed" });
  expect((await payoutToSeller(hash, deps)).status).toBe("paid");
  expect(deps.requestInvoice).not.toHaveBeenCalled();
  expect(deps.sendPayment).toHaveBeenCalledWith("invoice-one", 42);
});
it("keeps an expired invoice for reconciliation rather than replacing it", async () => {
  row.invoice = "invoice-one";
  (deps.decodeInvoice as jest.Mock).mockReturnValue({
    ...invoice,
    hasExpired: () => true,
  });
  expect((await payoutToSeller(hash, deps)).status).toBe("abandoned");
  expect(row.invoice).toBe("invoice-one");
  expect(deps.sendPayment).not.toHaveBeenCalled();
});
it("rejects an invoice for a different amount", async () => {
  (deps.requestInvoice as jest.Mock).mockResolvedValue({
    ...invoice,
    satoshi: 1000,
  });
  expect((await payoutToSeller(hash, deps)).status).toBe("failed");
  expect(row.saveInvoice).not.toHaveBeenCalled();
});
it.each(["open", "accepted", "cancelled"])(
  "does not pay for an order that is %s",
  async (status) => {
    row.orderStatus = status;
    expect((await payoutToSeller(hash, deps)).status).toBe("not_settled");
    expect(deps.sendPayment).not.toHaveBeenCalled();
  }
);
it("reports a competing worker without attempting payment", async () => {
  runMock.mockResolvedValue(null);
  expect((await payoutToSeller(hash, deps)).status).toBe("in_progress");
});
it("does not retry a paid obligation", async () => {
  row.status = "paid";
  expect((await payoutToSeller(hash, deps)).status).toBe("already_paid");
  expect(deps.sendPayment).not.toHaveBeenCalled();
});
