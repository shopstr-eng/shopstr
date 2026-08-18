import type { HodlInvoiceProvider } from "./hodl-invoice-provider";
import { LndHodlInvoiceProvider } from "./lnd-hodl-invoice-provider";
import { MockHodlInvoiceProvider } from "./mock-hodl-invoice-provider";

/**
 * Single place that answers "which hold-invoice backend is installed?", so no
 * API route has to name one.
 *
 * `HODL_INVOICE_PROVIDER` selects the backend explicitly:
 *
 * - `mock` — {@link MockHodlInvoiceProvider}, in any environment. Saying it
 *   out loud in production is the deliberate opt-in to unpayable invoices.
 * - `lnd` — {@link LndHodlInvoiceProvider}, which needs `LND_HOST`,
 *   `LND_TLS_CERT_HEX` and `LND_INVOICE_MACAROON_HEX`.
 * - unset — the mock, silently outside production and with a loud warning in
 *   production.
 *
 * Anything else is a configuration mistake and throws. A deployment never
 * silently gets a backend other than the one it asked for.
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

/**
 * Thrown when `HODL_INVOICE_PROVIDER` names something this build cannot
 * serve — an unrecognized value, or `lnd` without usable credentials.
 *
 * A subclass of {@link HodlInvoiceProviderUnavailableError} so the routes'
 * existing "escrow is unavailable" 503 path still catches it; the distinct
 * type is there for anything that wants to tell "operator typo" apart from
 * "nothing configured".
 */
export class HodlInvoiceProviderMisconfiguredError extends HodlInvoiceProviderUnavailableError {
  constructor(message: string) {
    super(message);
    this.name = "HodlInvoiceProviderMisconfiguredError";
  }
}

/** Env vars {@link LndHodlInvoiceProvider} cannot connect without. */
const REQUIRED_LND_ENV_VARS = [
  "LND_HOST",
  "LND_TLS_CERT_HEX",
  "LND_INVOICE_MACAROON_HEX",
] as const;

/** The two values `HODL_INVOICE_PROVIDER` may take. */
const VALID_PROVIDER_NAMES = ["mock", "lnd"] as const;

/**
 * The exact warning logged when production falls back to the mock because
 * nothing was configured. Exported so the test asserting it cannot drift from
 * the string operators actually see in their logs.
 */
export const UNCONFIGURED_PRODUCTION_PROVIDER_WARNING =
  "HODL_INVOICE_PROVIDER is not set; falling back to the mock hold-invoice " +
  "provider in production. The mock cannot process real payments — it hands " +
  "out invoices no wallet can pay, so buyers are told their escrow order is " +
  "live while no funds can ever be locked. Set HODL_INVOICE_PROVIDER=lnd " +
  "(with LND_HOST, LND_TLS_CERT_HEX and LND_INVOICE_MACAROON_HEX) to use a " +
  "real node, or set HODL_INVOICE_PROVIDER=mock to acknowledge the mock and " +
  "silence this warning.";

let installedProvider: HodlInvoiceProvider | null = null;

/**
 * The configured provider name, or `null` when the var is unset or blank.
 * Trimmed and lower-cased so a stray newline out of a secrets manager is not
 * treated as a typo.
 */
function readConfiguredProviderName(): string | null {
  const raw = process.env.HODL_INVOICE_PROVIDER;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

/**
 * Renders an operator-supplied value for an error message: quoted, truncated,
 * and stripped of the newlines that would otherwise let it forge log lines.
 */
function describeValue(value: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  const clipped =
    collapsed.length > 64 ? `${collapsed.slice(0, 64)}…` : collapsed;
  return JSON.stringify(clipped);
}

/**
 * Mirrors {@link LndHodlInvoiceProvider}'s own env handling — non-empty host,
 * even-length hex for the cert and macaroon — so the registry rejects exactly
 * what the provider would have rejected, only at resolution time instead of
 * at the first gRPC call.
 *
 * Values are never included in the message: the macaroon is a credential.
 */
function findLndEnvProblems(): string[] {
  const problems: string[] = [];

  for (const name of REQUIRED_LND_ENV_VARS) {
    const raw = process.env[name];
    if (typeof raw !== "string" || raw.trim().length === 0) {
      problems.push(`${name} is missing`);
      continue;
    }

    if (name === "LND_HOST") continue;

    const hex = raw.trim();
    if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
      problems.push(`${name} is not valid hex (${hex.length} characters)`);
    }
  }

  return problems;
}

function createLndProvider(): HodlInvoiceProvider {
  const problems = findLndEnvProblems();
  if (problems.length > 0) {
    throw new HodlInvoiceProviderMisconfiguredError(
      `HODL_INVOICE_PROVIDER=lnd, but the LND connection is not configured: ` +
        `${problems.join("; ")}. All of ` +
        `${REQUIRED_LND_ENV_VARS.join(", ")} are required.`
    );
  }

  return new LndHodlInvoiceProvider();
}

/**
 * Resolves the provider named by `HODL_INVOICE_PROVIDER`, or the mock when it
 * is unset — warning first if that fallback happens in production.
 */
function resolveProviderFromEnv(): HodlInvoiceProvider {
  const configured = readConfiguredProviderName();

  if (configured === null) {
    if (process.env.NODE_ENV === "production") {
      console.warn(UNCONFIGURED_PRODUCTION_PROVIDER_WARNING);
    }
    return new MockHodlInvoiceProvider();
  }

  if (configured === "mock") return new MockHodlInvoiceProvider();
  if (configured === "lnd") return createLndProvider();

  throw new HodlInvoiceProviderMisconfiguredError(
    `Invalid HODL_INVOICE_PROVIDER value ${describeValue(
      process.env.HODL_INVOICE_PROVIDER as string
    )}. Valid values are ${VALID_PROVIDER_NAMES.map((name) =>
      JSON.stringify(name)
    ).join(" and ")}.`
  );
}

/**
 * The installed provider.
 *
 * The first resolution is cached, so a mid-process env change is not picked
 * up; tests call {@link setHodlInvoiceProvider} with `null` to clear it.
 *
 * @throws {HodlInvoiceProviderMisconfiguredError} when
 * `HODL_INVOICE_PROVIDER` is unrecognized, or is `lnd` while the LND
 * credentials are missing or malformed. Nothing is cached in that case, so a
 * later call re-reads the environment.
 */
export function getHodlInvoiceProvider(): HodlInvoiceProvider {
  if (installedProvider) return installedProvider;

  installedProvider = resolveProviderFromEnv();
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
