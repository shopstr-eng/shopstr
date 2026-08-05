import type { HodlInvoiceProvider } from "./hodl-invoice-provider";
import { MockHodlInvoiceProvider } from "./mock-hodl-invoice-provider";

/**
 * Single place that answers "which hold-invoice backend is installed?", so no
 * API route has to name one.
 *
 * Which node or service ends up behind {@link HodlInvoiceProvider} — LND,
 * CLN, LNbits, something else — is still an open decision. Whoever makes it
 * implements the interface and registers it here (or via
 * {@link setHodlInvoiceProvider} at server start); nothing that calls
 * {@link getHodlInvoiceProvider} has to change.
 */

/**
 * Thrown when no usable provider is installed. Callers should surface this as
 * "escrow is unavailable right now", not as a bad request: the buyer did
 * nothing wrong.
 */
export class HodlInvoiceProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HodlInvoiceProviderUnavailableError";
  }
}

let installedProvider: HodlInvoiceProvider | null = null;

/**
 * The mock hands out `lnmock1…` strings that no wallet can pay. In
 * development that is the point; in production it would mean telling a buyer
 * their escrow order is live when no funds can ever be locked, so serving it
 * there takes a deliberate `HODL_INVOICE_PROVIDER=mock` opt-in.
 */
function isMockProviderAllowed(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.HODL_INVOICE_PROVIDER === "mock"
  );
}

/**
 * The installed provider.
 *
 * @throws {HodlInvoiceProviderUnavailableError} when nothing has been
 * registered and the mock is not allowed in this environment.
 */
export function getHodlInvoiceProvider(): HodlInvoiceProvider {
  if (installedProvider) return installedProvider;

  if (!isMockProviderAllowed()) {
    throw new HodlInvoiceProviderUnavailableError(
      "No Lightning hold-invoice provider is configured"
    );
  }

  installedProvider = new MockHodlInvoiceProvider();
  return installedProvider;
}

/**
 * Installs a provider, replacing whatever was resolved before. Pass `null` to
 * clear it — tests use that to get back to a known state.
 */
export function setHodlInvoiceProvider(
  provider: HodlInvoiceProvider | null
): void {
  installedProvider = provider;
}
