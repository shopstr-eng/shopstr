import type {
  HodlInvoiceProvider,
  HodlInvoiceStatus,
} from "./hodl-invoice-provider";

/**
 * Optional streaming capability on top of {@link HodlInvoiceProvider}.
 *
 * The four methods on the base interface are all request/response: something
 * has to ask the backend "what is this invoice doing now?". That is fine for
 * the transitions this app causes itself (settle, cancel), but the two
 * transitions it never causes — a buyer paying (`open` -> `accepted`) and an
 * unpaid invoice expiring (`open` -> `cancelled`) — happen inside the backend
 * with nothing to announce them, which is why
 * {@link file://./hodl-status-sync.ts} exists as a poll-based fallback.
 *
 * A backend that can push state changes closes that gap: the app learns about
 * a transition when it happens rather than at the next poll. Not every
 * backend can, so this is deliberately a *separate* interface rather than
 * more methods on {@link HodlInvoiceProvider} — a provider that cannot stream
 * stays a complete, valid provider, and callers branch with
 * {@link supportsInvoiceSubscriptions} instead of implementing a stub that
 * pretends to subscribe.
 *
 * This is a fast path, never a source of truth on its own: a subscription can
 * drop, and the process holding it can be down when a transition happens. The
 * polling sweep remains the backstop.
 */

/** Handle to one open subscription. */
export interface HodlInvoiceSubscription {
  /**
   * Stops delivery and releases the underlying stream. Idempotent, and safe
   * to call from inside a handler.
   *
   * After this returns, no further handler on this subscription is invoked —
   * including `onError` for whatever cancellation error the transport raises
   * as a result of this very call.
   */
  close(): void;
}

/**
 * Callbacks a subscriber supplies. All three are invoked from the transport's
 * event loop, so an implementation must not let a throwing handler escape
 * into the transport — a handler that throws is reported through `onError`.
 */
export interface HodlInvoiceSubscriptionHandlers {
  /**
   * The invoice's state. Fired once immediately on subscribe with the state
   * *at that moment* — not only on later changes — which is what lets a
   * subscriber that was down for a while catch up on what it missed.
   *
   * May repeat the same status more than once; subscribers must be idempotent.
   */
  onStatus(status: HodlInvoiceStatus): void;
  /**
   * The stream failed, or a message could not be interpreted. The
   * subscription may or may not still be live; a subscriber that cares should
   * treat this as "assume the fast path is gone" and lean on polling.
   */
  onError(error: unknown): void;
  /** The backend ended the stream normally. No further messages will arrive. */
  onClose(): void;
}

/** A {@link HodlInvoiceProvider} that can also push invoice state changes. */
export interface HodlInvoiceSubscriptionProvider extends HodlInvoiceProvider {
  /**
   * Opens a stream of state changes for one invoice.
   *
   * Resolves once the stream is established, so a caller that awaits it holds
   * a handle it can close. Rejects if the subscription could not be opened at
   * all.
   */
  subscribeToInvoice(
    paymentHash: string,
    handlers: HodlInvoiceSubscriptionHandlers
  ): Promise<HodlInvoiceSubscription>;
}

/**
 * Whether the installed provider can stream.
 *
 * A method check rather than an `instanceof`, so a test double or a future
 * backend can satisfy it without importing any concrete provider class.
 */
export function supportsInvoiceSubscriptions(
  provider: HodlInvoiceProvider
): provider is HodlInvoiceSubscriptionProvider {
  return (
    typeof (provider as Partial<HodlInvoiceSubscriptionProvider>)
      .subscribeToInvoice === "function"
  );
}
