import type {
  HodlInvoiceSubscription,
  HodlInvoiceSubscriptionHandlers,
} from "../hodl-invoice-subscription";
import type { HodlInvoiceProvider } from "../hodl-invoice-provider";

const listPendingHodlEscrowOrderPaymentHashesMock = jest.fn();
const updateHodlEscrowOrderStatusIfAdvancingMock = jest.fn();
const getHodlInvoiceProviderMock = jest.fn();

jest.mock("@/utils/db/db-service", () => ({
  listPendingHodlEscrowOrderPaymentHashes: (...args: unknown[]) =>
    listPendingHodlEscrowOrderPaymentHashesMock(...args),
  updateHodlEscrowOrderStatusIfAdvancing: (...args: unknown[]) =>
    updateHodlEscrowOrderStatusIfAdvancingMock(...args),
}));

jest.mock("../hodl-invoice-provider-registry", () => ({
  getHodlInvoiceProvider: (...args: unknown[]) =>
    getHodlInvoiceProviderMock(...args),
}));

import {
  addOrderToWatcher,
  getWatchedPaymentHashes,
  installHodlWatcherShutdownHandlers,
  startHodlInvoiceWatcher,
  stopHodlInvoiceWatcher,
  SUBSCRIPTIONS_UNSUPPORTED_WARNING,
} from "../hodl-invoice-watcher";

const ORDER_A = "a".repeat(64);
const ORDER_B = "b".repeat(64);
const ORDER_C = "c".repeat(64);

/**
 * Stand-in for `LndHodlInvoiceProvider`'s streaming capability.
 *
 * Holds each order's handlers so a test can push a message at the exact
 * moment it wants to, which is what lets "a status changed while the watcher
 * was down" be simulated as the first message on the stream rather than as
 * real elapsed time.
 */
class FakeStreamingProvider {
  readonly handlers = new Map<string, HodlInvoiceSubscriptionHandlers>();
  readonly subscribeCalls: string[] = [];
  readonly closedSubscriptions: string[] = [];
  /** Payment hashes whose subscribe call should reject. */
  readonly refuse = new Set<string>();

  async subscribeToInvoice(
    paymentHash: string,
    handlers: HodlInvoiceSubscriptionHandlers
  ): Promise<HodlInvoiceSubscription> {
    this.subscribeCalls.push(paymentHash);
    if (this.refuse.has(paymentHash)) {
      throw new Error("stream refused");
    }
    this.handlers.set(paymentHash, handlers);
    return {
      close: () => {
        this.closedSubscriptions.push(paymentHash);
        this.handlers.delete(paymentHash);
      },
    };
  }

  /** Delivers one message on an order's stream. Throws if it has none. */
  emitStatus(paymentHash: string, status: string): void {
    const handlers = this.handlers.get(paymentHash);
    if (!handlers) {
      throw new Error(`no open subscription for ${paymentHash}`);
    }
    handlers.onStatus(status as never);
  }

  hasSubscription(paymentHash: string): boolean {
    return this.handlers.has(paymentHash);
  }
}

/** A provider with no streaming capability, like the mock backend. */
const nonStreamingProvider = {} as HodlInvoiceProvider;

/** Lets the watcher's per-order update chains drain. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function installProvider(): FakeStreamingProvider {
  const provider = new FakeStreamingProvider();
  getHodlInvoiceProviderMock.mockReturnValue(provider);
  return provider;
}

describe("hodl invoice watcher", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listPendingHodlEscrowOrderPaymentHashesMock.mockResolvedValue([]);
    updateHodlEscrowOrderStatusIfAdvancingMock.mockResolvedValue("accepted");
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(async () => {
    await stopHodlInvoiceWatcher();
    jest.restoreAllMocks();
  });

  describe("startHodlInvoiceWatcher", () => {
    it("opens one subscription per pending order", async () => {
      const provider = installProvider();
      listPendingHodlEscrowOrderPaymentHashesMock.mockResolvedValue([
        ORDER_A,
        ORDER_B,
        ORDER_C,
      ]);

      const result = await startHodlInvoiceWatcher();

      expect(result).toEqual({ started: true, watching: 3, failed: 0 });
      expect(provider.subscribeCalls.sort()).toEqual(
        [ORDER_A, ORDER_B, ORDER_C].sort()
      );
      expect(getWatchedPaymentHashes().sort()).toEqual(
        [ORDER_A, ORDER_B, ORDER_C].sort()
      );
    });

    it("keeps the other orders when one subscription cannot be opened", async () => {
      const provider = installProvider();
      provider.refuse.add(ORDER_B);
      listPendingHodlEscrowOrderPaymentHashesMock.mockResolvedValue([
        ORDER_A,
        ORDER_B,
      ]);

      const result = await startHodlInvoiceWatcher();

      expect(result).toEqual({ started: true, watching: 1, failed: 1 });
      expect(getWatchedPaymentHashes()).toEqual([ORDER_A]);
    });

    it("no-ops with a named reason when the provider cannot stream", async () => {
      getHodlInvoiceProviderMock.mockReturnValue(nonStreamingProvider);
      listPendingHodlEscrowOrderPaymentHashesMock.mockResolvedValue([ORDER_A]);

      const result = await startHodlInvoiceWatcher();

      expect(result).toEqual({
        started: false,
        reason: "subscriptions-unsupported",
      });
      expect(console.warn).toHaveBeenCalledWith(
        SUBSCRIPTIONS_UNSUPPORTED_WARNING
      );
      // Not even the pending orders are read: nothing could be done with them.
      expect(
        listPendingHodlEscrowOrderPaymentHashesMock
      ).not.toHaveBeenCalled();
      expect(getWatchedPaymentHashes()).toEqual([]);
    });

    it("refuses to start a second time without a stop", async () => {
      installProvider();
      listPendingHodlEscrowOrderPaymentHashesMock.mockResolvedValue([ORDER_A]);

      await startHodlInvoiceWatcher();
      const second = await startHodlInvoiceWatcher();

      expect(second).toEqual({ started: false, reason: "already-running" });
      expect(getWatchedPaymentHashes()).toEqual([ORDER_A]);
    });
  });

  describe("stream messages", () => {
    it("recovers a status change that happened while the watcher was down", async () => {
      // The order was `open` when the watcher stopped; the buyer paid in the
      // meantime. LND replays the current state as the stream's first
      // message, which is the only thing that tells this process about it.
      const provider = installProvider();
      listPendingHodlEscrowOrderPaymentHashesMock.mockResolvedValue([ORDER_A]);
      updateHodlEscrowOrderStatusIfAdvancingMock.mockResolvedValue("accepted");

      await startHodlInvoiceWatcher();
      provider.emitStatus(ORDER_A, "accepted");
      await flush();

      expect(updateHodlEscrowOrderStatusIfAdvancingMock).toHaveBeenCalledWith(
        ORDER_A,
        "accepted"
      );
      // Non-terminal, so the fast path stays open for the settle/cancel that
      // follows.
      expect(getWatchedPaymentHashes()).toEqual([ORDER_A]);
    });

    it("closes the subscription on a terminal state and processes nothing after it", async () => {
      const provider = installProvider();
      listPendingHodlEscrowOrderPaymentHashesMock.mockResolvedValue([
        ORDER_A,
        ORDER_B,
      ]);
      updateHodlEscrowOrderStatusIfAdvancingMock.mockResolvedValue("settled");

      await startHodlInvoiceWatcher();
      const handlers = provider.handlers.get(ORDER_A)!;
      provider.emitStatus(ORDER_A, "settled");
      await flush();

      expect(provider.closedSubscriptions).toEqual([ORDER_A]);
      expect(provider.hasSubscription(ORDER_A)).toBe(false);
      expect(getWatchedPaymentHashes()).toEqual([ORDER_B]);

      // A late message on the released stream — grpc-js can deliver one after
      // cancel() — must not produce another write.
      updateHodlEscrowOrderStatusIfAdvancingMock.mockClear();
      handlers.onStatus("cancelled");
      await flush();

      expect(updateHodlEscrowOrderStatusIfAdvancingMock).not.toHaveBeenCalled();
    });

    it("drops an order whose row no longer exists", async () => {
      const provider = installProvider();
      listPendingHodlEscrowOrderPaymentHashesMock.mockResolvedValue([ORDER_A]);
      updateHodlEscrowOrderStatusIfAdvancingMock.mockResolvedValue("not-found");

      await startHodlInvoiceWatcher();
      provider.emitStatus(ORDER_A, "accepted");
      await flush();

      expect(getWatchedPaymentHashes()).toEqual([]);
      expect(provider.closedSubscriptions).toEqual([ORDER_A]);
    });

    it("isolates a failing message to its own order", async () => {
      const provider = installProvider();
      listPendingHodlEscrowOrderPaymentHashesMock.mockResolvedValue([
        ORDER_A,
        ORDER_B,
      ]);
      updateHodlEscrowOrderStatusIfAdvancingMock.mockImplementation(
        async (paymentHash: string) => {
          if (paymentHash === ORDER_A) {
            throw new Error("database is unavailable");
          }
          return "accepted";
        }
      );

      await startHodlInvoiceWatcher();
      provider.emitStatus(ORDER_A, "accepted");
      provider.emitStatus(ORDER_B, "accepted");
      await flush();

      // A's write blew up and was logged; B's landed, and both subscriptions
      // are still open.
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("database is unavailable")
      );
      expect(updateHodlEscrowOrderStatusIfAdvancingMock).toHaveBeenCalledWith(
        ORDER_B,
        "accepted"
      );
      expect(getWatchedPaymentHashes().sort()).toEqual(
        [ORDER_A, ORDER_B].sort()
      );
      expect(provider.closedSubscriptions).toEqual([]);
    });

    it("drops only the failing order when its stream errors", async () => {
      const provider = installProvider();
      listPendingHodlEscrowOrderPaymentHashesMock.mockResolvedValue([
        ORDER_A,
        ORDER_B,
      ]);

      await startHodlInvoiceWatcher();
      provider.handlers.get(ORDER_A)!.onError(new Error("stream reset"));
      await flush();

      expect(getWatchedPaymentHashes()).toEqual([ORDER_B]);
      expect(provider.closedSubscriptions).toEqual([ORDER_A]);

      // B keeps working after A's stream died.
      provider.emitStatus(ORDER_B, "accepted");
      await flush();
      expect(updateHodlEscrowOrderStatusIfAdvancingMock).toHaveBeenCalledWith(
        ORDER_B,
        "accepted"
      );
    });
  });

  describe("addOrderToWatcher", () => {
    it("subscribes a newly created order", async () => {
      const provider = installProvider();
      await startHodlInvoiceWatcher();

      const result = await addOrderToWatcher(ORDER_C);

      expect(result).toBe("added");
      expect(provider.subscribeCalls).toEqual([ORDER_C]);
      expect(getWatchedPaymentHashes()).toEqual([ORDER_C]);
    });

    it("logs the order it subscribed, so the fast path is observable", async () => {
      // Without this line the watcher reports only a count at startup and
      // nothing per order, which makes "did it pick up the order I just
      // created?" unanswerable from the log.
      installProvider();
      await startHodlInvoiceWatcher();

      await addOrderToWatcher(ORDER_C);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining(ORDER_C)
      );
    });

    it("stays quiet for the outcomes that are not news", async () => {
      const provider = installProvider();
      listPendingHodlEscrowOrderPaymentHashesMock.mockResolvedValue([ORDER_A]);
      await startHodlInvoiceWatcher();
      (console.warn as jest.Mock).mockClear();

      // Already watched, and — after the stop — no watcher at all. The second
      // is what every registration returns in a deployment whose watcher
      // lives in another process, so logging it would bury the real lines.
      await addOrderToWatcher(ORDER_A);
      await stopHodlInvoiceWatcher();
      await addOrderToWatcher(ORDER_B);

      expect(console.warn).not.toHaveBeenCalled();
      expect(provider.subscribeCalls).toEqual([ORDER_A]);
    });

    it("does not open a second subscription for an order already watched", async () => {
      const provider = installProvider();
      listPendingHodlEscrowOrderPaymentHashesMock.mockResolvedValue([ORDER_A]);
      await startHodlInvoiceWatcher();

      const result = await addOrderToWatcher(ORDER_A);

      expect(result).toBe("already-watched");
      expect(provider.subscribeCalls).toEqual([ORDER_A]);
      expect(getWatchedPaymentHashes()).toEqual([ORDER_A]);
    });

    it("deduplicates concurrent calls for the same order", async () => {
      const provider = installProvider();
      await startHodlInvoiceWatcher();

      const results = await Promise.all([
        addOrderToWatcher(ORDER_C),
        addOrderToWatcher(ORDER_C),
      ]);

      expect(results.sort()).toEqual(["added", "already-watched"]);
      expect(provider.subscribeCalls).toEqual([ORDER_C]);
    });

    it("normalizes the payment hash before deduplicating", async () => {
      const provider = installProvider();
      listPendingHodlEscrowOrderPaymentHashesMock.mockResolvedValue([ORDER_A]);
      await startHodlInvoiceWatcher();

      expect(await addOrderToWatcher(ORDER_A.toUpperCase())).toBe(
        "already-watched"
      );
      expect(provider.subscribeCalls).toEqual([ORDER_A]);
    });

    it("is a no-op when no watcher is running in this process", async () => {
      const provider = installProvider();

      const result = await addOrderToWatcher(ORDER_C);

      expect(result).toBe("watcher-not-running");
      expect(provider.subscribeCalls).toEqual([]);
    });

    it("reports a refused subscription without throwing", async () => {
      const provider = installProvider();
      provider.refuse.add(ORDER_C);
      await startHodlInvoiceWatcher();

      expect(await addOrderToWatcher(ORDER_C)).toBe("failed");
      expect(getWatchedPaymentHashes()).toEqual([]);
      // The slot was released, so a later attempt can retry.
      provider.refuse.delete(ORDER_C);
      expect(await addOrderToWatcher(ORDER_C)).toBe("added");
    });
  });

  describe("stopHodlInvoiceWatcher", () => {
    it("closes every open subscription and empties the pool", async () => {
      const provider = installProvider();
      listPendingHodlEscrowOrderPaymentHashesMock.mockResolvedValue([
        ORDER_A,
        ORDER_B,
      ]);
      await startHodlInvoiceWatcher();

      await stopHodlInvoiceWatcher();

      expect(provider.closedSubscriptions.sort()).toEqual(
        [ORDER_A, ORDER_B].sort()
      );
      expect(getWatchedPaymentHashes()).toEqual([]);
      expect(await addOrderToWatcher(ORDER_A)).toBe("watcher-not-running");
    });

    it("registers a handler for each shutdown signal", async () => {
      // The handler bodies are not invoked here: they end in process.kill,
      // which would take the test runner down with them. What this pins is
      // that the signals are wired at all, and wired with `once` so repeated
      // registration across dev-server reloads cannot stack handlers.
      const onceSpy = jest
        .spyOn(process, "once")
        .mockImplementation(() => process);

      installHodlWatcherShutdownHandlers();

      expect(onceSpy.mock.calls.map((call) => call[0])).toEqual([
        "SIGTERM",
        "SIGINT",
      ]);
    });

    it("can be started again after a stop", async () => {
      const provider = installProvider();
      listPendingHodlEscrowOrderPaymentHashesMock.mockResolvedValue([ORDER_A]);
      await startHodlInvoiceWatcher();
      await stopHodlInvoiceWatcher();

      const result = await startHodlInvoiceWatcher();

      expect(result).toEqual({ started: true, watching: 1, failed: 0 });
      expect(provider.subscribeCalls).toEqual([ORDER_A, ORDER_A]);
    });
  });
});
