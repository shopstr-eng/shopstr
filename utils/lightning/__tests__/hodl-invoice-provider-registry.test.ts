import {
  getHodlInvoiceProvider,
  HodlInvoiceProviderMisconfiguredError,
  HodlInvoiceProviderUnavailableError,
  setHodlInvoiceProvider,
  UNCONFIGURED_PRODUCTION_PROVIDER_WARNING,
} from "@/utils/lightning/hodl-invoice-provider-registry";
import { LndHodlInvoiceProvider } from "@/utils/lightning/lnd-hodl-invoice-provider";
import { MockHodlInvoiceProvider } from "@/utils/lightning/mock-hodl-invoice-provider";

/**
 * The five resolution rules `HODL_INVOICE_PROVIDER` encodes. What matters
 * here is not only which class comes back but how the two bad configurations
 * fail: an explicit `lnd` with no credentials and an unrecognized value both
 * have to be loud, because the alternative — quietly handing out the mock —
 * tells buyers an escrow order is live when no funds can ever be locked.
 */

/** Valid-looking LND credentials. Hex only; nothing here reaches a node. */
const VALID_LND_ENV = {
  LND_HOST: "127.0.0.1:10009",
  LND_TLS_CERT_HEX: "deadbeef",
  LND_INVOICE_MACAROON_HEX: "0badc0de",
} as const;

const ENV_KEYS = [
  "NODE_ENV",
  "HODL_INVOICE_PROVIDER",
  ...Object.keys(VALID_LND_ENV),
] as const;

/** `NODE_ENV` is read-only in the Node typings but writable at runtime. */
function setEnv(name: string, value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env[name];
  } else {
    env[name] = value;
  }
}

function setLndEnv(
  overrides: Partial<Record<string, string | undefined>> = {}
) {
  for (const [name, value] of Object.entries(VALID_LND_ENV)) {
    setEnv(name, value);
  }
  for (const [name, value] of Object.entries(overrides)) {
    setEnv(name, value);
  }
}

describe("getHodlInvoiceProvider", () => {
  const originalEnv = new Map<string, string | undefined>();
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      setEnv(key, undefined);
    }
    // Nothing resolved yet: the registry caches its first answer.
    setHodlInvoiceProvider(null);
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    for (const [key, value] of originalEnv) {
      setEnv(key, value);
    }
    originalEnv.clear();
    setHodlInvoiceProvider(null);
  });

  describe("HODL_INVOICE_PROVIDER=mock", () => {
    it("serves the mock outside production", () => {
      setEnv("NODE_ENV", "development");
      setEnv("HODL_INVOICE_PROVIDER", "mock");

      expect(getHodlInvoiceProvider()).toBeInstanceOf(MockHodlInvoiceProvider);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("serves the mock in production, silently — saying so is the opt-in", () => {
      setEnv("NODE_ENV", "production");
      setEnv("HODL_INVOICE_PROVIDER", "mock");

      expect(getHodlInvoiceProvider()).toBeInstanceOf(MockHodlInvoiceProvider);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe("HODL_INVOICE_PROVIDER=lnd", () => {
    it("serves the LND provider when all three credentials are present", () => {
      setEnv("NODE_ENV", "production");
      setEnv("HODL_INVOICE_PROVIDER", "lnd");
      setLndEnv();

      expect(getHodlInvoiceProvider()).toBeInstanceOf(LndHodlInvoiceProvider);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it.each(Object.keys(VALID_LND_ENV))(
      "throws when %s is missing, rather than falling back to the mock",
      (missing) => {
        setEnv("NODE_ENV", "production");
        setEnv("HODL_INVOICE_PROVIDER", "lnd");
        setLndEnv({ [missing]: undefined });

        expect(() => getHodlInvoiceProvider()).toThrow(
          HodlInvoiceProviderMisconfiguredError
        );
        expect(() => getHodlInvoiceProvider()).toThrow(
          new RegExp(`${missing} is missing`)
        );
      }
    );

    it("throws when a credential is present but blank", () => {
      setEnv("HODL_INVOICE_PROVIDER", "lnd");
      setLndEnv({ LND_HOST: "   " });

      expect(() => getHodlInvoiceProvider()).toThrow(/LND_HOST is missing/);
    });

    it.each(["nothex!", "abc"])(
      "throws when LND_TLS_CERT_HEX is malformed (%s)",
      (malformed) => {
        setEnv("HODL_INVOICE_PROVIDER", "lnd");
        setLndEnv({ LND_TLS_CERT_HEX: malformed });

        expect(() => getHodlInvoiceProvider()).toThrow(
          HodlInvoiceProviderMisconfiguredError
        );
        expect(() => getHodlInvoiceProvider()).toThrow(
          /LND_TLS_CERT_HEX is not valid hex/
        );
      }
    );

    it("throws when LND_INVOICE_MACAROON_HEX is malformed, without echoing the credential", () => {
      setEnv("HODL_INVOICE_PROVIDER", "lnd");
      setLndEnv({ LND_INVOICE_MACAROON_HEX: "not-a-macaroon" });

      expect(() => getHodlInvoiceProvider()).toThrow(
        /LND_INVOICE_MACAROON_HEX is not valid hex/
      );
      try {
        getHodlInvoiceProvider();
      } catch (error) {
        expect((error as Error).message).not.toContain("not-a-macaroon");
      }
    });

    it("reports every missing credential at once", () => {
      setEnv("HODL_INVOICE_PROVIDER", "lnd");
      // All three unset by beforeEach.

      let message = "";
      try {
        getHodlInvoiceProvider();
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toContain("LND_HOST is missing");
      expect(message).toContain("LND_TLS_CERT_HEX is missing");
      expect(message).toContain("LND_INVOICE_MACAROON_HEX is missing");
    });

    it("caches nothing when resolution fails, so fixing the env is enough", () => {
      setEnv("HODL_INVOICE_PROVIDER", "lnd");

      expect(() => getHodlInvoiceProvider()).toThrow(
        HodlInvoiceProviderMisconfiguredError
      );

      setLndEnv();
      expect(getHodlInvoiceProvider()).toBeInstanceOf(LndHodlInvoiceProvider);
    });
  });

  describe("HODL_INVOICE_PROVIDER unset", () => {
    it("serves the mock silently outside production", () => {
      setEnv("NODE_ENV", "development");

      expect(getHodlInvoiceProvider()).toBeInstanceOf(MockHodlInvoiceProvider);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("serves the mock in production but warns exactly once, with the fix", () => {
      setEnv("NODE_ENV", "production");

      expect(getHodlInvoiceProvider()).toBeInstanceOf(MockHodlInvoiceProvider);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        UNCONFIGURED_PRODUCTION_PROVIDER_WARNING
      );

      // The constant is what operators read in the logs, so pin what it says
      // rather than only that some warning fired.
      expect(UNCONFIGURED_PRODUCTION_PROVIDER_WARNING).toContain(
        "HODL_INVOICE_PROVIDER is not set"
      );
      expect(UNCONFIGURED_PRODUCTION_PROVIDER_WARNING).toContain(
        "cannot process real payments"
      );
      expect(UNCONFIGURED_PRODUCTION_PROVIDER_WARNING).toContain(
        "HODL_INVOICE_PROVIDER=lnd"
      );
    });

    it("treats a blank value as unset", () => {
      setEnv("NODE_ENV", "production");
      setEnv("HODL_INVOICE_PROVIDER", "   ");

      expect(getHodlInvoiceProvider()).toBeInstanceOf(MockHodlInvoiceProvider);
      expect(warnSpy).toHaveBeenCalledWith(
        UNCONFIGURED_PRODUCTION_PROVIDER_WARNING
      );
    });
  });

  describe("HODL_INVOICE_PROVIDER set to an unrecognized value", () => {
    it.each(["lnd-rest", "LND2", "cln", "true"])(
      "throws naming %s and both valid options",
      (invalid) => {
        setEnv("NODE_ENV", "development");
        setEnv("HODL_INVOICE_PROVIDER", invalid);
        setLndEnv();

        let message = "";
        expect(() => {
          try {
            getHodlInvoiceProvider();
          } catch (error) {
            message = (error as Error).message;
            throw error;
          }
        }).toThrow(HodlInvoiceProviderMisconfiguredError);

        expect(message).toContain(`"${invalid}"`);
        expect(message).toContain('"mock"');
        expect(message).toContain('"lnd"');
      }
    );

    it("is catchable as HodlInvoiceProviderUnavailableError, so routes still 503", () => {
      setEnv("HODL_INVOICE_PROVIDER", "cln");

      expect(() => getHodlInvoiceProvider()).toThrow(
        HodlInvoiceProviderUnavailableError
      );
    });
  });

  it("accepts a surrounding-whitespace or upper-case value from a secrets store", () => {
    setEnv("NODE_ENV", "production");
    setEnv("HODL_INVOICE_PROVIDER", " Mock\n");

    expect(getHodlInvoiceProvider()).toBeInstanceOf(MockHodlInvoiceProvider);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns an explicitly installed provider without consulting the env", () => {
    setEnv("NODE_ENV", "production");
    setEnv("HODL_INVOICE_PROVIDER", "nonsense");
    const installed = new MockHodlInvoiceProvider();
    setHodlInvoiceProvider(installed);

    expect(getHodlInvoiceProvider()).toBe(installed);
  });
});
