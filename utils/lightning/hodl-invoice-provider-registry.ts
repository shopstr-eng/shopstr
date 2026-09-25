import type { HodlInvoiceProvider } from "./hodl-invoice-provider";
import { LndHodlInvoiceProvider } from "./lnd-hodl-invoice-provider";

export class HodlInvoiceProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HodlInvoiceProviderUnavailableError";
  }
}

export class HodlInvoiceProviderMisconfiguredError extends HodlInvoiceProviderUnavailableError {
  constructor(message: string) {
    super(message);
    this.name = "HodlInvoiceProviderMisconfiguredError";
  }
}

let provider: HodlInvoiceProvider | undefined;

/** Explicit LND configuration is required in every environment. Never issue fake invoices. */
export function getHodlInvoiceProvider(): HodlInvoiceProvider {
  if (provider) return provider;
  if (process.env.HODL_INVOICE_PROVIDER?.trim().toLowerCase() !== "lnd") {
    throw new HodlInvoiceProviderUnavailableError(
      "Set HODL_INVOICE_PROVIDER=lnd to enable Lightning escrow"
    );
  }
  for (const name of [
    "LND_HOST",
    "LND_TLS_CERT_HEX",
    "LND_INVOICE_MACAROON_HEX",
  ]) {
    const value = process.env[name]?.trim();
    if (!value)
      throw new HodlInvoiceProviderMisconfiguredError(`${name} is missing`);
    if (
      name !== "LND_HOST" &&
      (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0)
    ) {
      throw new HodlInvoiceProviderMisconfiguredError(
        `${name} is not valid hex`
      );
    }
  }
  provider = new LndHodlInvoiceProvider();
  return provider;
}
