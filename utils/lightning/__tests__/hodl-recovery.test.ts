jest.mock("../hodl-status-sync", () => ({
  syncAllPendingHodlOrders: jest.fn(),
}));
jest.mock("../hodl-seller-payout", () => ({ reconcileHodlPayouts: jest.fn() }));
jest.mock("../resolve-hodl-dispute", () => ({
  executeHodlResolution: jest.fn(),
}));
jest.mock("../settle-hodl-invoice", () => ({
  executeHodlSettlement: jest.fn(),
}));
import { reconcileHodlEscrows } from "../hodl-recovery";
import { syncAllPendingHodlOrders } from "../hodl-status-sync";
import { executeHodlResolution } from "../resolve-hodl-dispute";
import { executeHodlSettlement } from "../settle-hodl-invoice";
import { reconcileHodlPayouts } from "../hodl-seller-payout";
it("recovers published decisions only for verified accepted orders and still retries payouts", async () => {
  (syncAllPendingHodlOrders as jest.Mock).mockResolvedValue([
    { paymentHash: "held", ok: true, status: "accepted" },
    { paymentHash: "open", ok: true, status: "open" },
    { paymentHash: "bad", ok: false },
  ]);
  (executeHodlResolution as jest.Mock).mockResolvedValue({
    statusCode: 403,
    body: { reason: "no_release_event" },
  });
  await reconcileHodlEscrows();
  expect(executeHodlResolution).toHaveBeenCalledWith("held");
  expect(executeHodlResolution).toHaveBeenCalledTimes(1);
  expect(executeHodlSettlement).toHaveBeenCalledWith("held");
  expect(reconcileHodlPayouts).toHaveBeenCalled();
});
it("does not override a pending or unavailable arbiter decision", async () => {
  jest.clearAllMocks();
  (syncAllPendingHodlOrders as jest.Mock).mockResolvedValue([
    { paymentHash: "held", ok: true, status: "accepted" },
  ]);
  (executeHodlResolution as jest.Mock).mockResolvedValue({
    statusCode: 403,
    body: { reason: "dispute_not_yet_actionable" },
  });
  await reconcileHodlEscrows();
  expect(executeHodlSettlement).not.toHaveBeenCalled();
});
it.each(["pubkey_mismatch", "order_mismatch"])(
  "does not let an unauthorized ruling (%s) block buyer confirmation recovery",
  async (reason) => {
    jest.clearAllMocks();
    (syncAllPendingHodlOrders as jest.Mock).mockResolvedValue([
      { paymentHash: "held", ok: true, status: "accepted" },
    ]);
    (executeHodlResolution as jest.Mock).mockResolvedValue({
      statusCode: 403,
      body: { reason },
    });
    await reconcileHodlEscrows();
    expect(executeHodlSettlement).toHaveBeenCalledWith("held");
  }
);
it.each([
  "relay_unavailable",
  "arbiter_key_unavailable",
  "no_actionable_dispute",
])(
  "keeps recovery closed when the ruling cannot be safely bypassed (%s)",
  async (reason) => {
    jest.clearAllMocks();
    (syncAllPendingHodlOrders as jest.Mock).mockResolvedValue([
      { paymentHash: "held", ok: true, status: "accepted" },
    ]);
    (executeHodlResolution as jest.Mock).mockResolvedValue({
      statusCode: 503,
      body: { reason },
    });
    await reconcileHodlEscrows();
    expect(executeHodlSettlement).not.toHaveBeenCalled();
  }
);
