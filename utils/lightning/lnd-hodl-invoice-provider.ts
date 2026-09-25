import { getHodlPolicy, holdTiming } from "./hodl-policy";
import {
  CreateHoldInvoiceParams,
  CreateHoldInvoiceResult,
  HodlInvoiceError,
  HodlInvoiceErrorCode,
  HodlInvoiceProvider,
  HodlInvoiceStatus,
  LookupInvoiceResult,
} from "./hodl-invoice-provider";
import { normalizePaymentHash, paymentHashFromPreimage } from "./payment-hash";

/** LND invoice RPCs; authorization is enforced by the API handlers. */

/** Injection seam. Mirrors the generated grpc-js client for the four calls
 *  used here, so tests can supply a fake and never load `@grpc/grpc-js`. */
export interface LndInvoicesClient {
  AddHoldInvoice(
    request: AddHoldInvoiceRequest,
    options: LndCallOptions,
    callback: LndCallback<AddHoldInvoiceResponse>
  ): void;
  LookupInvoiceV2(
    request: LookupInvoiceRequest,
    options: LndCallOptions,
    callback: LndCallback<LndInvoiceResponse>
  ): void;
  SettleInvoice(
    request: SettleInvoiceRequest,
    options: LndCallOptions,
    callback: LndCallback<Record<string, never>>
  ): void;
  CancelInvoice(
    request: CancelInvoiceRequest,
    options: LndCallOptions,
    callback: LndCallback<Record<string, never>>
  ): void;
  GetInfo?(
    request: Record<string, never>,
    options: LndCallOptions,
    callback: LndCallback<{ block_height?: number; synced_to_chain?: boolean }>
  ): void;
  close?(): void;
}

export interface LndCallOptions {
  deadline: number;
}

export type LndCallback<T> = (
  error: LndGrpcError | null | undefined,
  response?: T
) => void;

/** The shape grpc-js errors actually arrive in. */
export interface LndGrpcError extends Error {
  code?: number;
  details?: string;
}

interface AddHoldInvoiceRequest {
  hash: Uint8Array;
  value: number;
  expiry: number;
  cltv_expiry: number;
  memo?: string;
}

interface LookupInvoiceRequest {
  payment_hash: Uint8Array;
}

interface SettleInvoiceRequest {
  preimage: Uint8Array;
}

interface CancelInvoiceRequest {
  payment_hash: Uint8Array;
}

/**
 * Only the fields this provider reads. `add_index` is typed `string | number`
 * on purpose — see {@link parseLndInteger}.
 */
interface AddHoldInvoiceResponse {
  payment_request?: string;
  add_index?: string | number;
  payment_addr?: Uint8Array;
}

interface LndInvoiceResponse {
  htlcs?: Parameters<typeof holdTiming>[0];
  state?: string;
  r_hash?: Uint8Array;
  r_preimage?: Uint8Array;
}

export interface LndHodlInvoiceProviderOptions {
  /**
   * Pre-built client, or a factory for one. Supplied by tests; in production
   * this is omitted and the real gRPC client is built lazily and cached.
   */
  client?: LndInvoicesClient | (() => Promise<LndInvoicesClient>);
  /** Per-call deadline in milliseconds. */
  callTimeoutMs?: number;
  /** Invoice lifetime used when the caller does not specify one. */
  defaultExpirySeconds?: number;
}

/** Lifetime of an unpaid invoice; accepted HTLCs have separate block deadlines. */
const DEFAULT_EXPIRY_SECONDS = 3600;
const DEFAULT_CALL_TIMEOUT_MS = 15_000;

/** LND's documented client loading options. `longs: String` is why every
 *  64-bit field arrives as a string; see {@link parseLndInteger}. */
const LOADER_OPTIONS = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
} as const;

/** Subset of grpc status codes this provider reasons about. */
const GRPC_STATUS_NOT_FOUND = 5;

const HEX_32_BYTE_RUN = /\b[0-9a-f]{64}\b/gi;

// Preserve ACCEPTED (held) separately from OPEN; LND spells CANCELED with one L.
const INVOICE_STATE_TO_STATUS: Readonly<Record<string, HodlInvoiceStatus>> = {
  OPEN: "open",
  ACCEPTED: "accepted",
  SETTLED: "settled",
  CANCELED: "cancelled",
};

// LND uses UNKNOWN for multiple semantic errors, so match known details.
// Return our own messages; never forward raw node errors containing secrets.
const ERROR_SIGNATURES: ReadonlyArray<{
  pattern: RegExp;
  code: HodlInvoiceErrorCode;
  message: string;
}> = [
  {
    pattern: /invoice with payment hash already exists/i,
    code: "duplicate_payment_hash",
    message: "An invoice already exists for this payment hash",
  },
  {
    pattern: /unable to locate invoice/i,
    code: "invoice_not_found",
    message: "No invoice found for this payment hash",
  },
  {
    pattern: /invoice still open/i,
    code: "invalid_state_transition",
    message:
      'Cannot settle an invoice in state "open"; only an accepted (held) HTLC can be settled',
  },
  {
    // LND spells it with one L. Both spellings accepted so an LND wording
    // change cannot silently demote this to an untyped infrastructure error.
    pattern: /invoice already cancell?ed/i,
    code: "invalid_state_transition",
    message:
      'Cannot settle an invoice in state "cancelled"; the HTLC has already been released',
  },
  {
    pattern: /invoice already settled/i,
    code: "invalid_state_transition",
    message:
      "Cannot cancel a settled invoice; the funds have already been released",
  },
  {
    pattern: /invalid hash length/i,
    code: "invalid_payment_hash",
    message: "Payment hash must be 32 bytes of hex (64 characters)",
  },
  {
    pattern: /invalid preimage length/i,
    code: "invalid_preimage",
    message: "Preimage must be 32 bytes of hex (64 characters)",
  },
];

/** Node/transport failure, distinct from invalid invoice requests. Messages are redacted. */
export class LndProviderError extends Error {
  /** gRPC status code, when the failure came back from a call. */
  public readonly grpcCode?: number;

  constructor(message: string, grpcCode?: number) {
    super(message);
    this.name = "LndProviderError";
    if (grpcCode !== undefined) this.grpcCode = grpcCode;
  }
}

// Rebuild errors from scalar fields and redact every 32-byte hex value except the allowed hash.
export function describeGrpcFailure(
  error: unknown,
  allowedHash?: string
): string {
  const grpcError = error as LndGrpcError | undefined;
  const detail =
    (typeof grpcError?.details === "string" && grpcError.details) ||
    (error instanceof Error && error.message) ||
    "unknown error";
  const rendered =
    grpcError?.code === undefined
      ? detail
      : `grpc status ${grpcError.code}: ${detail}`;

  return rendered.replace(HEX_32_BYTE_RUN, (match) =>
    allowedHash !== undefined &&
    match.toLowerCase() === allowedHash.toLowerCase()
      ? match
      : "[redacted]"
  );
}

/** Decode LND int64 strings without unsafe integer coercion. */
export function parseLndInteger(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? value : undefined;
  }
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export class LndHodlInvoiceProvider implements HodlInvoiceProvider {
  private readonly callTimeoutMs: number;
  private readonly defaultExpirySeconds: number;
  private readonly clientFactory: () => Promise<LndInvoicesClient>;
  /** Cached so the TLS handshake happens once, not per call. */
  private clientPromise: Promise<LndInvoicesClient> | null = null;

  constructor(options: LndHodlInvoiceProviderOptions = {}) {
    this.callTimeoutMs = options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
    this.defaultExpirySeconds =
      options.defaultExpirySeconds ?? DEFAULT_EXPIRY_SECONDS;

    const injected = options.client;
    if (typeof injected === "function") {
      this.clientFactory = injected;
    } else if (injected) {
      this.clientFactory = async () => injected;
    } else {
      this.clientFactory = createLndInvoicesClient;
    }
  }

  async createHoldInvoice(
    params: CreateHoldInvoiceParams
  ): Promise<CreateHoldInvoiceResult> {
    const { amountSats, memo, expirySeconds } = params;
    const paymentHash = normalizePaymentHash(params.paymentHash);

    // LND accepts zero-amount invoices, which would allow escrow underpayment.
    if (!Number.isSafeInteger(amountSats) || amountSats <= 0) {
      throw new HodlInvoiceError(
        "invalid_amount",
        "amountSats must be a positive integer number of satoshis"
      );
    }
    if (
      expirySeconds !== undefined &&
      (!Number.isInteger(expirySeconds) || expirySeconds <= 0)
    ) {
      throw new HodlInvoiceError(
        "invalid_amount",
        "expirySeconds must be a positive integer"
      );
    }

    const response = await this.call<AddHoldInvoiceResponse>(
      "AddHoldInvoice",
      (client, options, callback) =>
        client.AddHoldInvoice(
          {
            hash: hexToBytes(paymentHash),
            value: amountSats,
            expiry: expirySeconds ?? this.defaultExpirySeconds,
            cltv_expiry: getHodlPolicy().cltvDelta,
            ...(memo === undefined ? {} : { memo }),
          },
          options,
          callback
        ),
      paymentHash
    );

    const invoice = response?.payment_request;
    if (typeof invoice !== "string" || invoice.length === 0) {
      throw new LndProviderError(
        "LND accepted the hold invoice but returned no payment request"
      );
    }

    // `add_index` is not part of the interface's result and is not returned.
    // It is parsed only as an assertion that the response decoded the way this
    // provider expects: a non-integer here means the loader options drifted
    // (a `Long` object, or camelCased fields), which would also mean `state`
    // and `r_preimage` can no longer be trusted on the lookup path.
    if (
      response.add_index !== undefined &&
      parseLndInteger(response.add_index) === undefined
    ) {
      throw new LndProviderError(
        "LND returned a malformed add_index; check the proto-loader options"
      );
    }

    return { invoice, paymentHash };
  }

  async lookupInvoice(paymentHash: string): Promise<LookupInvoiceResult> {
    const normalized = normalizePaymentHash(paymentHash);

    const invoice = await this.call<LndInvoiceResponse>(
      "LookupInvoiceV2",
      (client, options, callback) =>
        client.LookupInvoiceV2(
          { payment_hash: hexToBytes(normalized) },
          options,
          callback
        ),
      normalized
    );

    const status = readInvoiceStatus(invoice, normalized);

    // Do not expose an absent preimage before settlement.
    const preimage =
      status === "settled" ? bytesToHex(invoice.r_preimage) : undefined;

    const timing = holdTiming(invoice.htlcs ?? []);
    const info = timing.holdExpiryHeight ? await this.getNodeInfo() : undefined;
    if (info && !info.synced) throw new Error("Lightning node is not synced");
    return {
      ...timing,
      ...(info ? { observedBlockHeight: info.blockHeight } : {}),
      status,
      ...(preimage === undefined || preimage.length === 0 ? {} : { preimage }),
    };
  }

  async getNodeInfo(): Promise<{ blockHeight: number; synced: boolean }> {
    const info = await this.call<{
      block_height?: number;
      synced_to_chain?: boolean;
    }>(
      "GetInfo",
      (client, options, callback) => {
        if (!client.GetInfo)
          throw new LndProviderError("LND GetInfo is unavailable");
        client.GetInfo({}, options, callback);
      },
      ""
    );
    if (!Number.isSafeInteger(info.block_height) || info.block_height! < 0)
      throw new LndProviderError("Invalid LND block height");
    return {
      blockHeight: info.block_height!,
      synced: info.synced_to_chain === true,
    };
  }

  async settleInvoice(preimage: string): Promise<void> {
    // Validate the secret and derive the only hash safe to include in errors.
    const paymentHash = paymentHashFromPreimage(preimage);

    // LND is natively idempotent here: settling an already-SETTLED invoice
    // returns an empty response rather than an error (verified against a live
    // node), which is the behaviour the interface requires. Settling from
    // `open` or `cancelled` errors, and ERROR_SIGNATURES turns those into
    // `invalid_state_transition`.
    await this.call<Record<string, never>>(
      "SettleInvoice",
      (client, options, callback) =>
        client.SettleInvoice(
          { preimage: hexToBytes(preimage) },
          options,
          callback
        ),
      paymentHash
    );
  }

  async cancelInvoice(paymentHash: string): Promise<void> {
    const normalized = normalizePaymentHash(paymentHash);

    // Also natively idempotent: cancelling an already-CANCELED invoice returns
    // an empty response. Cancelling a SETTLED one errors, and becomes
    // `invalid_state_transition`.
    await this.call<Record<string, never>>(
      "CancelInvoice",
      (client, options, callback) =>
        client.CancelInvoice(
          { payment_hash: hexToBytes(normalized) },
          options,
          callback
        ),
      normalized
    );
  }

  /** Releases the gRPC channel. Not part of the interface. */
  async close(): Promise<void> {
    const pending = this.clientPromise;
    this.clientPromise = null;
    if (!pending) return;
    try {
      const client = await pending;
      client.close?.();
    } catch {
      // Nothing to close: the connection never came up.
    }
  }

  private async getClient(): Promise<LndInvoicesClient> {
    if (!this.clientPromise) {
      // Cleared on failure so a transient startup error (node not up yet)
      // does not poison every later call with a cached rejection.
      this.clientPromise = this.clientFactory().catch((error: unknown) => {
        this.clientPromise = null;
        throw new LndProviderError(
          `Could not connect to the Lightning node: ${describeGrpcFailure(error)}`
        );
      });
    }
    return this.clientPromise;
  }

  /**
   * Runs one unary call and funnels every failure through the translation
   * layer, so no raw gRPC error escapes this class.
   */
  private async call<T>(
    method: string,
    invoke: (
      client: LndInvoicesClient,
      options: LndCallOptions,
      callback: LndCallback<T>
    ) => void,
    allowedHash: string
  ): Promise<T> {
    const client = await this.getClient();
    const options: LndCallOptions = {
      deadline: Date.now() + this.callTimeoutMs,
    };

    let response: T;
    try {
      response = await new Promise<T>((resolve, reject) => {
        let settled = false;
        try {
          invoke(client, options, (error, value) => {
            // grpc-js should call back once, but a fake or a buggy
            // interceptor calling twice would otherwise surface as an
            // unhandled rejection far from here.
            if (settled) return;
            settled = true;
            if (error) reject(error);
            else resolve(value as T);
          });
        } catch (thrown) {
          // A client that throws synchronously (channel already closed).
          if (!settled) {
            settled = true;
            reject(thrown);
          }
        }
      });
    } catch (error) {
      throw translateGrpcError(error, method, allowedHash);
    }
    return response;
  }
}

/**
 * Maps a gRPC failure onto a typed error, defaulting to
 * {@link LndProviderError} so an unrecognised failure is reported as
 * infrastructure rather than misattributed to the caller.
 */
function translateGrpcError(
  error: unknown,
  method: string,
  allowedHash: string
): Error {
  // A HodlInvoiceError can reach here from a fake client in tests; pass it
  // through rather than wrapping it into an infrastructure error.
  if (error instanceof HodlInvoiceError) return error;

  const grpcError = error as LndGrpcError | undefined;
  const haystack = `${grpcError?.details ?? ""} ${grpcError?.message ?? ""}`;

  for (const signature of ERROR_SIGNATURES) {
    if (signature.pattern.test(haystack)) {
      return new HodlInvoiceError(signature.code, signature.message);
    }
  }

  // LND does use NOT_FOUND correctly on the lookup path; honour it even if the
  // wording changes.
  if (grpcError?.code === GRPC_STATUS_NOT_FOUND) {
    return new HodlInvoiceError(
      "invoice_not_found",
      "No invoice found for this payment hash"
    );
  }

  return new LndProviderError(
    `LND ${method} failed: ${describeGrpcFailure(error, allowedHash)}`,
    grpcError?.code
  );
}

/** Reject mismatched hashes and unknown states instead of guessing payment status. */
function readInvoiceStatus(
  invoice: LndInvoiceResponse | undefined,
  expectedHash: string
): HodlInvoiceStatus {
  const returnedHash = bytesToHex(invoice?.r_hash);
  if (returnedHash !== undefined && returnedHash !== expectedHash) {
    throw new LndProviderError(
      "LND returned an invoice for a different payment hash"
    );
  }

  const state = invoice?.state;
  const status =
    typeof state === "string" ? INVOICE_STATE_TO_STATUS[state] : undefined;
  if (!status) {
    throw new LndProviderError(
      `LND returned an unrecognised invoice state: ${sanitizeStateLabel(state)}`
    );
  }
  return status;
}

/** Keeps an unexpected `state` value from smuggling anything into a message. */
function sanitizeStateLabel(state: unknown): string {
  if (typeof state !== "string") return typeof state;
  const trimmed = state.slice(0, 32).replace(/[^A-Za-z0-9_]/g, "");
  return trimmed.length > 0 ? trimmed : "empty";
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

/** Proto `bytes` arrive as Buffer/Uint8Array; empty means "not set". */
function bytesToHex(bytes: Uint8Array | undefined): string | undefined {
  if (!bytes || bytes.length === 0) return undefined;
  return Buffer.from(bytes).toString("hex");
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new LndProviderError(`Missing required env var ${name}`);
  }
  return value;
}

function decodeHexEnv(name: string): Buffer {
  const raw = requireEnv(name).trim();
  if (!/^[0-9a-f]+$/i.test(raw) || raw.length % 2 !== 0) {
    // Length only — never the value, which for the macaroon is a credential.
    throw new LndProviderError(
      `${name} is not valid hex (${raw.length} characters)`
    );
  }
  return Buffer.from(raw, "hex");
}

/** Support both native ESM and CommonJS-transformed imports of the gRPC libraries. */
function interopRequire<T>(module: T): T {
  const candidate = (module as T & { default?: T }).default;
  return candidate ?? module;
}

/** Load server-only gRPC dependencies lazily and pin TLS to the configured node certificate. */
async function createLndInvoicesClient(): Promise<LndInvoicesClient> {
  // LND's tls.cert is ECDSA; LND's own docs require announcing this cipher
  // suite or the handshake fails. Set before credentials are constructed.
  process.env.GRPC_SSL_CIPHER_SUITES ??= "HIGH+ECDSA";

  const [grpcNamespace, protoLoaderNamespace] = await Promise.all([
    import("@grpc/grpc-js"),
    import("@grpc/proto-loader"),
  ]);
  const grpc = interopRequire(grpcNamespace);
  const protoLoader = interopRequire(protoLoaderNamespace);

  const host = requireEnv("LND_HOST");
  const tlsCert = decodeHexEnv("LND_TLS_CERT_HEX");
  // Travels as hex *text* in the metadata header. The env var is already hex,
  // so this round-trip is really an assertion that it decodes cleanly.
  const macaroonHex = decodeHexEnv("LND_INVOICE_MACAROON_HEX").toString("hex");

  // `invoices.proto` does `import "lightning.proto"`, so both are loaded
  // together with the directory on the include path.
  const protoDir =
    process.env.LND_PROTO_DIR ?? `${process.cwd()}/utils/lightning/lnd-proto`;
  const packageDefinition = protoLoader.loadSync(
    ["lightning.proto", "invoices.proto"],
    { ...LOADER_OPTIONS, includeDirs: [protoDir] }
  );

  const descriptor = grpc.loadPackageDefinition(
    packageDefinition
  ) as unknown as {
    lnrpc: {
      Lightning: new (
        address: string,
        credentials: ReturnType<typeof grpc.credentials.createSsl>
      ) => LndInvoicesClient;
    };
    invoicesrpc: {
      Invoices: new (
        address: string,
        credentials: ReturnType<typeof grpc.credentials.createSsl>
      ) => LndInvoicesClient;
    };
  };

  const credentials = grpc.credentials.combineChannelCredentials(
    grpc.credentials.createSsl(tlsCert),
    grpc.credentials.createFromMetadataGenerator((_args, callback) => {
      const metadata = new grpc.Metadata();
      metadata.add("macaroon", macaroonHex);
      callback(null, metadata);
    })
  );

  const invoices = new descriptor.invoicesrpc.Invoices(host, credentials);
  const lightning = new descriptor.lnrpc.Lightning(host, credentials);
  invoices.GetInfo = lightning.GetInfo!.bind(lightning);
  const close = invoices.close?.bind(invoices);
  invoices.close = () => {
    close?.();
    lightning.close?.();
  };
  return invoices;
}
