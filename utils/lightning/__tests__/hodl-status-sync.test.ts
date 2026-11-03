const getHodlEscrowOrderStatusMock = jest.fn();
const updateHodlEscrowOrderStatusIfAdvancingMock = jest.fn();
const listPendingHodlEscrowOrderPaymentHashesMock = jest.fn();
const lookupInvoiceMock = jest.fn();
const getHodlInvoiceProviderMock = jest.fn();

jest.mock("@/utils/db/db-service", () => ({
  getHodlEscrowOrderStatus: (...args: unknown[]) =>
    getHodlEscrowOrderStatusMock(...args),
  updateHodlEscrowOrderStatusIfAdvancing: (...args: unknown[]) =>
    updateHodlEscrowOrderStatusIfAdvancingMock(...args),
  listPendingHodlEscrowOrderPaymentHashes: (...args: unknown[]) =>
    listPendingHodlEscrowOrderPaymentHashesMock(...args),
}));

jest.mock("@/utils/lightning/hodl-invoice-provider-registry", () => ({
  getHodlInvoiceProvider: (...args: unknown[]) =>
    getHodlInvoiceProviderMock(...args),
}));

import {
  syncHodlOrderStatus,
  syncAllPendingHodlOrders,
} from "../hodl-status-sync";

const PAYMENT_HASH = "b".repeat(64);
const OTHER_PAYMENT_HASH = "c".repeat(64);

describe("syncHodlOrderStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getHodlInvoiceProviderMock.mockReturnValue({
      lookupInvoice: lookupInvoiceMock,
    });
  });

  it("moves open to accepted when the provider says the buyer paid", async () => {
    getHodlEscrowOrderStatusMock.mockResolvedValue("open");
    lookupInvoiceMock.mockResolvedValue({ status: "accepted" });
    updateHodlEscrowOrderStatusIfAdvancingMock.mockResolvedValue("accepted");

    const result = await syncHodlOrderStatus(PAYMENT_HASH);

    expect(result).toBe("accepted");
    expect(lookupInvoiceMock).toHaveBeenCalledWith(PAYMENT_HASH);
    // syncHodlOrderStatus only ever proposes a (paymentHash, newStatus) pair —
    // it has no accepted_at parameter to pass, and none of the assertions in
    // this file could observe accepted_at even if it did, since db-service is
    // mocked out entirely here. Stamping accepted_at on this exact
    // open -> accepted transition happens inside
    // updateHodlEscrowOrderStatusIfAdvancing's own guarded UPDATE and is
    // verified against the real SQL in
    // utils/db/__tests__/hodl-escrow-orders.test.ts ("accepted_at stamping").
    expect(updateHodlEscrowOrderStatusIfAdvancingMock).toHaveBeenCalledWith(
      PAYMENT_HASH,
      "accepted"
    );
  });

  it.each([
    [
      "open",
      "moves open to cancelled when the provider says the invoice expired",
    ],
    [
      "accepted",
      "moves accepted to cancelled when the provider says the held HTLC was released",
    ],
  ])("%s -> cancelled: %s", async (storedStatus) => {
    getHodlEscrowOrderStatusMock.mockResolvedValue(storedStatus);
    lookupInvoiceMock.mockResolvedValue({ status: "cancelled" });
    updateHodlEscrowOrderStatusIfAdvancingMock.mockResolvedValue("cancelled");

    const result = await syncHodlOrderStatus(PAYMENT_HASH);

    expect(result).toBe("cancelled");
    expect(updateHodlEscrowOrderStatusIfAdvancingMock).toHaveBeenCalledWith(
      PAYMENT_HASH,
      "cancelled"
    );
  });

  it("never downgrades a settled row even on a stale provider read", async () => {
    getHodlEscrowOrderStatusMock.mockResolvedValue("settled");
    // A stale/late provider read claiming the invoice is still just held.
    lookupInvoiceMock.mockResolvedValue({ status: "accepted" });
    // The DB layer is the actual enforcement point; simulate its refusal to
    // move a terminal row by having it echo back the unchanged status.
    updateHodlEscrowOrderStatusIfAdvancingMock.mockResolvedValue("settled");

    const result = await syncHodlOrderStatus(PAYMENT_HASH);

    expect(result).toBe("settled");
    // The provider is still consulted for a terminal row — the guarantee
    // lives in the guarded update, not in skipping the lookup.
    expect(lookupInvoiceMock).toHaveBeenCalledTimes(1);
    expect(updateHodlEscrowOrderStatusIfAdvancingMock).toHaveBeenCalledWith(
      PAYMENT_HASH,
      "accepted"
    );
  });

  it("never downgrades a cancelled row even on a stale provider read", async () => {
    getHodlEscrowOrderStatusMock.mockResolvedValue("cancelled");
    lookupInvoiceMock.mockResolvedValue({ status: "open" });
    updateHodlEscrowOrderStatusIfAdvancingMock.mockResolvedValue("cancelled");

    const result = await syncHodlOrderStatus(PAYMENT_HASH);

    expect(result).toBe("cancelled");
  });

  it.each(["accepted", "settled"])(
    "is a no-op when the provider status matches a stored %s status",
    async (status) => {
      getHodlEscrowOrderStatusMock.mockResolvedValue(status);
      lookupInvoiceMock.mockResolvedValue({ status });

      const result = await syncHodlOrderStatus(PAYMENT_HASH);

      expect(result).toBe(status);
      // No write attempted at all when nothing has changed.
      expect(updateHodlEscrowOrderStatusIfAdvancingMock).not.toHaveBeenCalled();
    }
  );

  it("returns null and never calls the provider when no order exists", async () => {
    getHodlEscrowOrderStatusMock.mockResolvedValue(null);

    const result = await syncHodlOrderStatus(PAYMENT_HASH);

    expect(result).toBeNull();
    expect(lookupInvoiceMock).not.toHaveBeenCalled();
    expect(updateHodlEscrowOrderStatusIfAdvancingMock).not.toHaveBeenCalled();
  });

  it("normalizes a mixed-case payment hash before querying anything", async () => {
    getHodlEscrowOrderStatusMock.mockResolvedValue("open");
    lookupInvoiceMock.mockResolvedValue({ status: "open" });

    await syncHodlOrderStatus(PAYMENT_HASH.toUpperCase());

    expect(getHodlEscrowOrderStatusMock).toHaveBeenCalledWith(PAYMENT_HASH);
    expect(lookupInvoiceMock).toHaveBeenCalledWith(PAYMENT_HASH);
  });

  it("falls back to the pre-sync status if the row vanishes mid-sync", async () => {
    getHodlEscrowOrderStatusMock.mockResolvedValue("open");
    lookupInvoiceMock.mockResolvedValue({ status: "accepted" });
    updateHodlEscrowOrderStatusIfAdvancingMock.mockResolvedValue("not-found");

    const result = await syncHodlOrderStatus(PAYMENT_HASH);

    expect(result).toBe("open");
  });

  it("propagates a provider lookup failure", async () => {
    getHodlEscrowOrderStatusMock.mockResolvedValue("open");
    lookupInvoiceMock.mockRejectedValue(new Error("provider unreachable"));

    await expect(syncHodlOrderStatus(PAYMENT_HASH)).rejects.toThrow(
      "provider unreachable"
    );
    expect(updateHodlEscrowOrderStatusIfAdvancingMock).not.toHaveBeenCalled();
  });
});

describe("syncAllPendingHodlOrders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getHodlInvoiceProviderMock.mockReturnValue({
      lookupInvoice: lookupInvoiceMock,
    });
  });

  it("only queries and syncs orders still in a non-terminal state", async () => {
    listPendingHodlEscrowOrderPaymentHashesMock.mockResolvedValue([
      PAYMENT_HASH,
      OTHER_PAYMENT_HASH,
    ]);
    getHodlEscrowOrderStatusMock.mockImplementation(async (hash: string) =>
      hash === PAYMENT_HASH ? "open" : "accepted"
    );
    lookupInvoiceMock.mockImplementation(async (hash: string) => ({
      status: hash === PAYMENT_HASH ? "accepted" : "accepted",
    }));
    updateHodlEscrowOrderStatusIfAdvancingMock.mockResolvedValue("accepted");

    const results = await syncAllPendingHodlOrders();

    expect(listPendingHodlEscrowOrderPaymentHashesMock).toHaveBeenCalledTimes(
      1
    );
    // The batch sweep never asks the DB for settled/cancelled rows in the
    // first place — that filtering is the pending-hashes query's job, and
    // this function only ever iterates what it returned.
    expect(getHodlEscrowOrderStatusMock).toHaveBeenCalledTimes(2);
    expect(getHodlEscrowOrderStatusMock).toHaveBeenCalledWith(PAYMENT_HASH);
    expect(getHodlEscrowOrderStatusMock).toHaveBeenCalledWith(
      OTHER_PAYMENT_HASH
    );
    expect(results).toEqual([
      { paymentHash: PAYMENT_HASH, ok: true, status: "accepted" },
      { paymentHash: OTHER_PAYMENT_HASH, ok: true, status: "accepted" },
    ]);
  });

  it("does nothing when there are no pending orders", async () => {
    listPendingHodlEscrowOrderPaymentHashesMock.mockResolvedValue([]);

    const results = await syncAllPendingHodlOrders();

    expect(results).toEqual([]);
    expect(getHodlEscrowOrderStatusMock).not.toHaveBeenCalled();
    expect(lookupInvoiceMock).not.toHaveBeenCalled();
  });

  it("isolates a single order's failure from the rest of the sweep", async () => {
    listPendingHodlEscrowOrderPaymentHashesMock.mockResolvedValue([
      PAYMENT_HASH,
      OTHER_PAYMENT_HASH,
    ]);
    getHodlEscrowOrderStatusMock.mockImplementation(async (hash: string) => {
      if (hash === PAYMENT_HASH) throw new Error("db down");
      return "open";
    });
    lookupInvoiceMock.mockResolvedValue({ status: "open" });
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const results = await syncAllPendingHodlOrders();

    expect(results).toEqual(
      expect.arrayContaining([
        { paymentHash: PAYMENT_HASH, ok: false },
        { paymentHash: OTHER_PAYMENT_HASH, ok: true, status: "open" },
      ])
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("makes no write for orders whose provider status has not changed", async () => {
    listPendingHodlEscrowOrderPaymentHashesMock.mockResolvedValue([
      PAYMENT_HASH,
    ]);
    getHodlEscrowOrderStatusMock.mockResolvedValue("accepted");
    lookupInvoiceMock.mockResolvedValue({ status: "accepted" });

    const results = await syncAllPendingHodlOrders();

    expect(results).toEqual([
      { paymentHash: PAYMENT_HASH, ok: true, status: "accepted" },
    ]);
    expect(updateHodlEscrowOrderStatusIfAdvancingMock).not.toHaveBeenCalled();
  });
});
