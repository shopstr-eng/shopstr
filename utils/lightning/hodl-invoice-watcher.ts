import { getHodlInvoiceProvider } from "./hodl-invoice-provider-registry";
import {
  supportsInvoiceSubscriptions,
  type HodlInvoiceSubscription,
} from "./hodl-invoice-subscription";
import type { HodlInvoiceStatus } from "./hodl-invoice-provider";
import {
  listPendingHodlEscrowOrderPaymentHashes,
  updateHodlEscrowOrderStatusIfAdvancing,
  type HodlEscrowOrderStatus,
} from "@/utils/db/db-service";

/**
 * Push-based fast path for hold-invoice escrow order status.
 *
 * `hodl-status-sync.ts` explains the underlying gap: a buyer paying
 * (`open` -> `accepted`) and an invoice expiring unclaimed
 * (`open`/`accepted` -> `cancelled`) both happen inside the Lightning
 * provider, and nothing tells this app about them. That module closes the gap
 * by asking — on demand from `hodl-order-status`, and in bulk from the
 * `sync-hodl-orders` sweep. This module closes it by *listening*, holding one
 * open `SubscribeSingleInvoice` stream per pending order so a transition is
 * recorded when it happens rather than at the next poll.
 *
 * It is strictly an additional layer. Both existing sync paths are untouched
 * and remain the source of truth, for reasons this watcher cannot engineer
 * away:
 *
 *  - it only knows about orders that were pending when it started, plus ones
 *    handed to it by {@link addOrderToWatcher} in the *same process*;
 *  - a stream can drop, and this deliberately does not reconnect (see
 *    {@link handleSubscriptionFailure});
 *  - the process holding the streams can be down while a transition happens.
 *
 * In every one of those cases the sweep catches up. Losing this watcher costs
 * latency, never correctness.
 *
 * ## Which provider this works with
 *
 * Only a provider implementing the optional
 * {@link file://./hodl-invoice-subscription.ts} capability —
 * `LndHodlInvoiceProvider` today. `MockHodlInvoiceProvider` has no stream to
 * subscribe to; its invoices change state only when this app's own code moves
 * them, which is exactly the case that needs no watcher. Rather than
 * pretending to watch, {@link startHodlInvoiceWatcher} logs a named reason
 * and returns `started: false`, so an operator who set the watcher up and
 * sees nothing happening gets told why instead of having to guess.
 *
 * ## Process model
 *
 * See `instrumentation.ts` for how this is actually started, and what that
 * means for {@link addOrderToWatcher}.
 */

/** Statuses after which no further provider update is possible. */
const TERMINAL_STATUSES: ReadonlySet<HodlEscrowOrderStatus> = new Set([
  "settled",
  "cancelled",
]);

function isTerminal(status: HodlEscrowOrderStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * One watched order.
 *
 * Placed in the pool *before* its subscription exists, so two concurrent
 * calls for the same payment hash cannot both get past the dedupe check while
 * the first one is still awaiting the provider.
 */
interface WatchEntry {
  paymentHash: string;
  /** Null until the provider hands back a handle. */
  subscription: HodlInvoiceSubscription | null;
  /** Set once this entry is done; every callback checks it. */
  closed: boolean;
  /**
   * Serializes this order's status updates.
   *
   * `updateHodlEscrowOrderStatusIfAdvancing` is row-locked, so overlapping
   * writes are safe rather than corrupting — but two messages applied
   * concurrently would resolve in arrival-independent order, and the terminal
   * check below would run against whichever finished last. Chaining keeps one
   * order's messages in the order LND sent them. Chains are per-entry, so a
   * slow database write for one order never delays another's.
   */
  queue: Promise<void>;
}

/**
 * The pool of open subscriptions, keyed by payment hash.
 *
 * Module-level, i.e. one watcher per process. That is the intent: the streams
 * are a shared resource, and a second independent pool in the same process
 * would double every subscription for no benefit.
 */
const watched = new Map<string, WatchEntry>();

/**
 * Whether {@link startHodlInvoiceWatcher} has completed and
 * {@link stopHodlInvoiceWatcher} has not run since.
 *
 * Separate from `watched.size`: a watcher with zero pending orders is running
 * and must still accept {@link addOrderToWatcher}.
 */
let running = false;

export type StartWatcherResult =
  | { started: true; watching: number; failed: number }
  | {
      started: false;
      /**
       * - `already-running` — a second start with no intervening stop.
       * - `subscriptions-unsupported` — the installed provider cannot stream.
       */
      reason: "already-running" | "subscriptions-unsupported";
    };

/**
 * The exact warning logged when the installed provider cannot stream.
 * Exported so the test asserting it cannot drift from what operators see.
 */
export const SUBSCRIPTIONS_UNSUPPORTED_WARNING =
  "The installed hold-invoice provider does not support invoice " +
  "subscriptions, so the hodl invoice watcher will not open any streams and " +
  "no order status will be updated by it. Escrow order status still tracks " +
  "the provider through POST /api/lightning/sync-hodl-orders and the " +
  "on-demand sync in /api/lightning/hodl-order-status. Set " +
  "HODL_INVOICE_PROVIDER=lnd to give the watcher something to subscribe to.";

/**
 * Opens a subscription for every order currently in `open` or `accepted`.
 *
 * Each order's stream delivers its current state immediately, so the startup
 * pass doubles as the catch-up for anything that changed while no watcher was
 * running — there is no separate reconciliation step, and none is needed.
 *
 * A subscription that cannot be opened is counted in `failed` and logged; it
 * does not stop the others. Those orders keep being covered by the sweep.
 *
 * @throws {HodlInvoiceProviderUnavailableError} when no provider is
 * configured, and whatever the database throws when the pending orders cannot
 * be listed. Both mean the watcher never started, which the caller should
 * surface rather than swallow.
 */
export async function startHodlInvoiceWatcher(): Promise<StartWatcherResult> {
  if (running) return { started: false, reason: "already-running" };

  const provider = getHodlInvoiceProvider();
  if (!supportsInvoiceSubscriptions(provider)) {
    console.warn(SUBSCRIPTIONS_UNSUPPORTED_WARNING);
    return { started: false, reason: "subscriptions-unsupported" };
  }

  const paymentHashes = await listPendingHodlEscrowOrderPaymentHashes();

  // Marked running before subscribing, so an order registered while this
  // startup pass is still in flight is accepted by addOrderToWatcher (and
  // deduped against this pass by the pool) rather than dropped.
  running = true;

  const results = await Promise.all(
    paymentHashes.map((paymentHash) => subscribeToOrder(paymentHash))
  );

  const watching = results.filter((result) => result === "added").length;
  return {
    started: true,
    watching,
    failed: results.length - watching,
  };
}

export type AddOrderToWatcherResult =
  /** A new subscription is open. */
  | "added"
  /** Already in the pool; nothing was opened. */
  | "already-watched"
  /**
   * No watcher in this process. Not an error — see `instrumentation.ts`: when
   * the watcher runs elsewhere, or is switched off, the API server calling
   * this is expected to do nothing.
   */
  | "watcher-not-running"
  /** The provider refused or could not open the stream. Logged. */
  | "failed";

/**
 * Adds one order to the pool, so a freshly created order is watched without
 * waiting for a restart.
 *
 * Safe to call for an order that is already watched, already terminal, or
 * that this process knows nothing about. Never throws: a caller registering
 * an escrow order must not fail because the fast path could not be attached.
 */
export async function addOrderToWatcher(
  paymentHash: string
): Promise<AddOrderToWatcherResult> {
  if (!running) return "watcher-not-running";

  const result = await subscribeToOrder(paymentHash);

  // Logged only on "added". The other outcomes are either already logged
  // ("failed", by subscribeToOrder) or are the uninteresting steady state:
  // "watcher-not-running" is what every registration returns in a deployment
  // whose watcher lives elsewhere, and logging that on each one would bury
  // the lines that mean something.
  //
  // This line exists because without it the watcher is unobservable per
  // order: startup reports a count, and nothing else ever says which orders
  // are actually being watched. An operator asking "did the fast path pick up
  // the order I just made?" had no way to answer from the log.
  //
  // console.warn because this repo's lint allows only warn/error, and the
  // payment hash is deliberately included — see logOrderFailure.
  if (result === "added") {
    console.warn(
      `Hodl invoice watcher subscribed to newly registered order ${paymentHash.toLowerCase()}`
    );
  }

  return result;
}

/** Closes every open subscription and empties the pool. */
export async function stopHodlInvoiceWatcher(): Promise<void> {
  running = false;

  const entries = [...watched.values()];
  watched.clear();

  for (const entry of entries) {
    closeEntry(entry);
  }

  // Let in-flight status writes finish rather than abandoning a transition
  // that was already read off a stream. Each queue already swallows its own
  // failures, so this cannot reject.
  await Promise.all(entries.map((entry) => entry.queue));
}

/**
 * Registers SIGTERM/SIGINT handlers that close the open streams before the
 * process exits, rather than leaving the node holding them until it notices
 * the peer is gone.
 *
 * This lives here rather than in `instrumentation.ts`, where it is called
 * from, for a build reason rather than a design one. Next.js compiles the
 * instrumentation hook for *both* the Node.js and Edge runtimes — the edge
 * copy is given the middleware webpack layer, in which the bundler warns on
 * every `process.*` member access except `process.env`. So `process.once`,
 * `process.removeAllListeners`, `process.pid` and `process.kill` written
 * directly in that file each produce a compile warning, on a code path the
 * `NEXT_RUNTIME !== "nodejs"` guard means can never run under Edge. The
 * bundler does not follow the dynamic import that reaches this module, which
 * is also why nothing warns about `pg` or `@grpc/grpc-js`, so moving the
 * calls one import away silences all of it without changing behaviour.
 *
 * Idempotent in the sense that matters: `once`, and only for signals nothing
 * else in this app listens for, so repeated calls across dev-server reloads
 * cannot accumulate handlers that each try to stop the watcher.
 */
export function installHodlWatcherShutdownHandlers(): void {
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      void stopHodlInvoiceWatcher().finally(() => {
        // Re-raise on the default handler so the normal exit path runs —
        // swallowing the signal would leave the process unkillable.
        process.removeAllListeners(signal);
        process.kill(process.pid, signal);
      });
    });
  }
}

/** Payment hashes currently watched. For tests and diagnostics. */
export function getWatchedPaymentHashes(): string[] {
  return [...watched.keys()];
}

/**
 * Opens one subscription and registers it in the pool.
 *
 * Shared by startup and {@link addOrderToWatcher} so both go through the same
 * dedupe, the same handlers, and the same failure handling.
 */
async function subscribeToOrder(
  paymentHash: string
): Promise<"added" | "already-watched" | "failed"> {
  const normalizedHash = paymentHash.toLowerCase();
  if (watched.has(normalizedHash)) return "already-watched";

  const entry: WatchEntry = {
    paymentHash: normalizedHash,
    subscription: null,
    closed: false,
    queue: Promise.resolve(),
  };
  // Claims the slot before the await, which is what makes the dedupe above
  // hold against concurrent callers.
  watched.set(normalizedHash, entry);

  let provider;
  try {
    provider = getHodlInvoiceProvider();
  } catch (error) {
    // Only reachable if the provider became unavailable after startup
    // resolved one; treated as a per-order failure like any other.
    watched.delete(normalizedHash);
    logOrderFailure(normalizedHash, error, "resolve a provider for");
    return "failed";
  }

  if (!supportsInvoiceSubscriptions(provider)) {
    watched.delete(normalizedHash);
    return "failed";
  }

  let subscription: HodlInvoiceSubscription;
  try {
    subscription = await provider.subscribeToInvoice(normalizedHash, {
      onStatus: (status) => enqueueStatus(entry, status),
      onError: (error) => handleSubscriptionFailure(entry, error),
      onClose: () => handleSubscriptionFailure(entry, null),
    });
  } catch (error) {
    watched.delete(normalizedHash);
    logOrderFailure(normalizedHash, error, "subscribe to");
    return "failed";
  }

  entry.subscription = subscription;

  // stopHodlInvoiceWatcher (or a terminal first message) can land while the
  // provider call above is still in flight, in which case the entry was
  // already dropped from the pool and its handle has to be released here or
  // the stream leaks.
  if (entry.closed || watched.get(normalizedHash) !== entry) {
    entry.closed = true;
    subscription.close();
    return "added";
  }

  return "added";
}

/**
 * Queues one streamed status for this order.
 *
 * Nothing is awaited by the caller: this runs on the transport's event loop,
 * where a rejected promise has nowhere to go. Every failure is therefore
 * caught and logged inside the chain, mirroring the per-order try/catch in
 * `syncAllPendingHodlOrders` — one order's database error, malformed message,
 * or dead stream must never take down another order's subscription or the
 * watcher itself.
 */
function enqueueStatus(entry: WatchEntry, status: HodlInvoiceStatus): void {
  entry.queue = entry.queue.then(async () => {
    try {
      await applyStatus(entry, status);
    } catch (error) {
      console.error(
        `Hodl invoice watcher failed to apply status for order ${
          entry.paymentHash
        }: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}

/**
 * Records one streamed status.
 *
 * Writes through {@link updateHodlEscrowOrderStatusIfAdvancing} — the single
 * place that decides whether a transition is legal — rather than through
 * `syncHodlOrderStatus`, which would turn around and ask the provider for the
 * state the stream just delivered. Skipping that round trip is the entire
 * point of subscribing; the direction and terminal-state guarantees are
 * unaffected, since they live in the database write either way.
 */
async function applyStatus(
  entry: WatchEntry,
  status: HodlInvoiceStatus
): Promise<void> {
  if (entry.closed) return;

  const result = await updateHodlEscrowOrderStatusIfAdvancing(
    entry.paymentHash,
    status
  );

  if (result === "not-found") {
    // No row to keep in sync — the order was never registered, or was
    // removed. Nothing this stream reports can matter now.
    dropEntry(entry);
    return;
  }

  // Closed on the *stored* status rather than the streamed one: the store is
  // what every other part of the app reads, and it is what decides whether
  // any further transition is possible. A stale terminal message on a row
  // that is already terminal lands in the same branch and closes just the
  // same.
  if (isTerminal(result)) dropEntry(entry);
}

/**
 * A stream failed or ended before reaching a terminal state.
 *
 * The subscription is dropped rather than retried. Reconnect loops here would
 * silently paper over a node that is down or credentials that expired, and
 * the order is not actually unmonitored: the sweep still covers it, at poll
 * latency. Re-establishing the fast path is a restart, or a later
 * {@link addOrderToWatcher} for the same order — which now succeeds, because
 * this released the pool slot.
 *
 * @param error The failure, or null when the provider closed the stream
 * normally.
 */
function handleSubscriptionFailure(entry: WatchEntry, error: unknown): void {
  if (entry.closed) return;

  if (error === null) {
    console.warn(
      `Hodl invoice watcher: subscription for order ${entry.paymentHash} ` +
        `ended; falling back to the periodic sync for this order`
    );
  } else {
    logOrderFailure(entry.paymentHash, error, "receive updates for");
  }

  dropEntry(entry);
}

/** Closes an entry and removes it from the pool. Idempotent. */
function dropEntry(entry: WatchEntry): void {
  // Only if this exact entry still owns the slot: a stale callback must not
  // evict a replacement subscription opened for the same order.
  if (watched.get(entry.paymentHash) === entry) {
    watched.delete(entry.paymentHash);
  }
  closeEntry(entry);
}

function closeEntry(entry: WatchEntry): void {
  if (entry.closed) return;
  entry.closed = true;
  try {
    // Null when the provider has not resolved a handle yet; subscribeToOrder
    // sees `closed` and closes it on arrival.
    entry.subscription?.close();
  } catch (error) {
    console.error(
      `Hodl invoice watcher failed to close the subscription for order ${
        entry.paymentHash
      }: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Logs a per-order failure.
 *
 * Payment hashes appear in these logs deliberately: they are the only handle
 * an operator has on which order stopped being watched, and this is a
 * server-side log, not a response body. Only the error's message is rendered
 * — never the error object — so nothing hanging off a `cause` or a stack
 * frame rides along.
 */
function logOrderFailure(
  paymentHash: string,
  error: unknown,
  action: string
): void {
  console.error(
    `Hodl invoice watcher failed to ${action} order ${paymentHash}: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
}
