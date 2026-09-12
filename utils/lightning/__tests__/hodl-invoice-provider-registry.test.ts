import { LndHodlInvoiceProvider } from "../lnd-hodl-invoice-provider";

const originalEnv = process.env;
const credentials = {
  LND_HOST: "127.0.0.1:10009",
  LND_TLS_CERT_HEX: "deadbeef",
  LND_INVOICE_MACAROON_HEX: "0badc0de",
};

beforeEach(() => {
  jest.resetModules();
  process.env = {
    ...originalEnv,
    ...credentials,
    HODL_INVOICE_PROVIDER: "lnd",
  };
});
afterEach(() => {
  process.env = originalEnv;
});

function registry() {
  return require("../hodl-invoice-provider-registry") as typeof import("../hodl-invoice-provider-registry");
}

it.each(["development", "production", "test"] as const)(
  "never serves fake invoices in %s",
  (environment) => {
    process.env = { ...process.env, NODE_ENV: environment };
    const { getHodlInvoiceProvider, HodlInvoiceProviderUnavailableError } =
      registry();
    for (const value of [undefined, "", "  ", "mock", "cln", "lnd-rest"]) {
      if (value === undefined) delete process.env.HODL_INVOICE_PROVIDER;
      else process.env.HODL_INVOICE_PROVIDER = value;
      expect(getHodlInvoiceProvider).toThrow(
        HodlInvoiceProviderUnavailableError
      );
    }
  }
);

it.each(Object.keys(credentials))(
  "rejects missing %s without caching failure",
  (name) => {
    delete process.env[name];
    const { getHodlInvoiceProvider, HodlInvoiceProviderMisconfiguredError } =
      registry();
    expect(getHodlInvoiceProvider).toThrow(
      HodlInvoiceProviderMisconfiguredError
    );
    process.env[name] = credentials[name as keyof typeof credentials];
    const provider = getHodlInvoiceProvider();
    expect(provider.constructor.name).toBe(LndHodlInvoiceProvider.name);
    expect(getHodlInvoiceProvider()).toBe(provider);
  }
);

it.each(["LND_TLS_CERT_HEX", "LND_INVOICE_MACAROON_HEX"])(
  "rejects malformed %s without disclosing the secret",
  (name) => {
    const { getHodlInvoiceProvider } = registry();
    for (const value of ["", " ", "abc", "secret-not-hex"]) {
      process.env[name] = value;
      expect(getHodlInvoiceProvider).toThrow(new RegExp(name));
      if (value.trim()) {
        try {
          getHodlInvoiceProvider();
        } catch (error) {
          expect((error as Error).message).not.toContain(value);
        }
      }
    }
  }
);

it("normalizes the explicit LND selection", () => {
  process.env.HODL_INVOICE_PROVIDER = " LND\n";
  expect(registry().getHodlInvoiceProvider().constructor.name).toBe(
    LndHodlInvoiceProvider.name
  );
});
