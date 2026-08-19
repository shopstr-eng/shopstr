import {
  CreateHoldInvoiceParams,
  CreateHoldInvoiceResult,
  HodlInvoiceError,
  HodlInvoiceErrorCode,
  HodlInvoiceProvider,
  HodlInvoiceStatus,
  LookupInvoiceResult,
} from "./hodl-invoice-provider";
import type {
  HodlInvoiceSubscription,
  HodlInvoiceSubscriptionHandlers,
  HodlInvoiceSubscriptionProvider,
} from "./hodl-invoice-subscription";
import { normalizePaymentHash, paymentHashFromPreimage } from "./payment-hash";

/**
 * {@link HodlInvoiceProvider} backed by a real LND node over gRPC.
 *
 * Speaks to LND's `invoicesrpc.Invoices` service: `AddHoldInvoice`,
 * `LookupInvoiceV2`, `SettleInvoice`, `CancelInvoice`, and — via the optional
 * {@link file://./hodl-invoice-subscription.ts} capability —
 * `SubscribeSingleInvoice`. The connection setup
 * (TLS from `LND_TLS_CERT_HEX`, macaroon from `LND_INVOICE_MACAROON_HEX`,
 * `GRPC_SSL_CIPHER_SUITES=HIGH+ECDSA`, LND's documented proto-loader options)
 * is the pattern proven by `scripts/lnd-test-connection.mjs`.
 *
 * Everything LND returns is translated down into the narrow shapes the
 * interface already defines, so swapping this in for
 * {@link file://./mock-hodl-invoice-provider.ts} requires no changes anywhere
 * else. In particular this class deliberately does NOT widen the contract:
 * `lookupInvoice` returns only `status` and (once settled) `preimage`, and the
 * rich LND invoice — `add_index`, `settle_index`, `amt_paid_msat`, `htlcs` —
 * stops here.
 *
 * Like the interface and the mock, this performs no identity checks: anyone
 * holding the preimage can settle, anyone holding the payment hash can cancel.
 * Authorization lives in a layer above.
 */

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
  /**
   * Server-streaming, so unlike the four unary calls it returns a stream
   * instead of taking a callback, and carries no deadline — the whole point
   * is that it stays open.
   *
   * Optional so that every fake client written against the unary methods
   * stays a valid `LndInvoicesClient`; `subscribeToInvoice` checks for it and
   * fails loudly rather than calling undefined.
   */
  SubscribeSingleInvoice?(
    request: SubscribeSingleInvoiceRequest
  ): LndInvoiceStream;
  close?(): void;
}

/**
 * The slice of grpc-js's `ClientReadableStream` this provider uses.
 *
 * `cancel()` rather than `destroy()`: cancelling tells the server to stop
 * sending, which is what releases the subscription on LND's side. It also
 * makes the stream emit a CANCELLED error, which the subscription swallows
 * because it asked for it.
 */
export interface LndInvoiceStream {
  on(event: "data", listener: (invoice: LndInvoiceResponse) => void): void;
  on(event: "error", listener: (error: LndGrpcError) => void): void;
  on(event: "end", listener: () => void): void;
  cancel(): void;
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
 * Note the field is `r_hash`, not `payment_hash` — `invoices.proto` spells
 * this one differently from `CancelInvoiceMsg`, and `keepCase: true` means
 * the proto's own spelling is what the client expects. Getting it wrong
 * yields a subscription to the all-zero hash rather than an error.
 */
interface SubscribeSingleInvoiceRequest {
  r_hash: Uint8Array;
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

/** Matches the mock's default, so switching backends does not silently
 *  change how long unpaid invoices stay payable. */
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

/**
 * LND's `Invoice.InvoiceState` enum → our status strings.
 *
 * Two traps encoded here, both observed against a live node rather than
 * assumed:
 *  1. LND spells it `CANCELED` (one L); this codebase's interface uses
 *     `cancelled` (two). Mapping through an explicit table is what keeps that
 *     divergence from turning into a status that matches nothing downstream.
 *  2. `ACCEPTED` is the state escrow actually depends on — a paid-but-held
 *     HTLC. It is not an error or a transient, and must not collapse to
 *     `open`.
 *
 * `enums: String` in the loader options is what makes these arrive as names
 * rather than integers. If someone drops that option, every lookup starts
 * throwing here instead of silently mapping the wrong state.
 */
const INVOICE_STATE_TO_STATUS: Readonly<Record<string, HodlInvoiceStatus>> = {
  OPEN: "open",
  ACCEPTED: "accepted",
  SETTLED: "settled",
  CANCELED: "cancelled",
};

/**
 * LND error `details` → our typed codes.
 *
 * Matching on the message text rather than the gRPC status code is not
 * sloppiness, it is forced: LND returns status 2 (`UNKNOWN`) for nearly every
 * semantic failure in this API. Verified against a live node:
 *
 *   duplicate payment hash    → 2 UNKNOWN  "invoice with payment hash already exists"
 *   settle an unpaid invoice  → 2 UNKNOWN  "invoice still open"
 *   settle a cancelled one    → 2 UNKNOWN  "invoice already canceled"
 *   cancel a settled one      → 2 UNKNOWN  "invoice already settled"
 *   settle/cancel unknown     → 2 UNKNOWN  "unable to locate invoice"
 *   lookup unknown            → 5 NOT_FOUND "unable to locate invoice"
 *
 * So branching on `code` alone would fold "already settled" together with
 * "TLS handshake failed". The status code is still honoured for `NOT_FOUND`,
 * which LND does use correctly on the lookup path.
 *
 * `message` is our own prose in every case: LND's text is matched against but
 * never forwarded, so nothing this table produces can echo request data.
 */
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

/**
 * Infrastructure failure: the node was unreachable, rejected our credentials,
 * timed out, or answered with something this provider could not interpret.
 *
 * Deliberately NOT a {@link HodlInvoiceError}. That type's `code` union
 * enumerates conditions the *caller* caused and can act on, and every existing
 * consumer already treats an unrecognised throw from a provider method as a
 * retryable 502 while mapping `HodlInvoiceError` to a 4xx. Reporting "LND is
 * down" as a caller error would invert that: it would tell a buyer their
 * request was malformed and stop the retry that would have succeeded.
 *
 * `message` is always redacted via {@link describeGrpcFailure} before it gets
 * here, so this error is safe to log.
 */
export class LndProviderError extends Error {
  /** gRPC status code, when the failure came back from a call. */
  public readonly grpcCode?: number;

  constructor(message: string, grpcCode?: number) {
    super(message);
    this.name = "LndProviderError";
    if (grpcCode !== undefined) this.grpcCode = grpcCode;
  }
}

/**
 * Renders a gRPC failure as a log-safe string.
 *
 * Same discipline as `describeFailure` in the settle/dispute API routes, and
 * for a sharper reason here: this module is the one place that handles a raw
 * preimage, and an LND error can quote the request it failed on. The rules:
 *
 *  1. The message is rebuilt from `code` and `details`/`message` only. The
 *     error object is never passed through, so a preimage hanging off a
 *     `cause`, a stack frame, or a metadata trailer cannot ride along.
 *  2. Every 64-hex run other than `allowedHash` is replaced. Redacting by
 *     shape rather than by comparing against the secret covers the case that
 *     matters most — an error that quotes a value this scope never held.
 *
 * @param allowedHash Payment hash that may appear in the clear. Omit on paths
 * where no hash is safe to echo.
 */
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

/**
 * Reads a 64-bit LND field that arrives as a decimal string.
 *
 * `longs: String` in the loader options means `add_index`, `value`,
 * `settle_index`, `amt_paid_msat` and friends come back as `"7"`, not `7` —
 * confirmed against a live node. The failure mode this guards is quiet:
 * `add_index > 0` on the string `"7"` happens to work, `"10" < "9"` does not,
 * and `record.add_index + 1` yields `"71"`. So every such field is parsed
 * explicitly instead of being trusted to coerce.
 *
 * Accepts a number too, so the provider keeps working if the loader options
 * are ever changed to `longs: Number`.
 *
 * @returns The value as a safe integer, or `undefined` if absent or malformed.
 */
export function parseLndInteger(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? value : undefined;
  }
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export class LndHodlInvoiceProvider
  implements HodlInvoiceProvider, HodlInvoiceSubscriptionProvider
{
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

    // Validated here rather than left to LND, because LND does not agree with
    // the mock about what is valid: `AddHoldInvoice` with `value: 0` succeeds
    // and yields an open-amount invoice any payer can satisfy for 1 sat. On an
    // escrow order that is a silent underpayment, so a zero or fractional
    // amount has to be rejected before the call, exactly as the mock does.
    if (!Number.isInteger(amountSats) || amountSats <= 0) {
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

    // Gated on both the state and a non-empty buffer. LND returns `r_preimage`
    // as 32 zero-length bytes until settlement — observed as `""` while
    // ACCEPTED — so keying off presence alone would surface an empty-string
    // preimage, which reads as "revealed" to any caller doing a truthiness or
    // `"preimage" in result` check. Absent in every non-settled state, exactly
    // like the mock.
    const preimage =
      status === "settled" ? bytesToHex(invoice.r_preimage) : undefined;

    return {
      status,
      ...(preimage === undefined || preimage.length === 0 ? {} : { preimage }),
    };
  }

  async settleInvoice(preimage: string): Promise<void> {
    // Deriving the hash from the preimage mirrors the mock: possession of the
    // secret is the only thing this call requires. It also gives the redactor
    // one hash it may safely echo, while the preimage itself stays redacted.
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

  /**
   * Opens LND's `SubscribeSingleInvoice` stream for one invoice.
   *
   * LND sends the invoice's *current* state as the first message and then one
   * message per transition, so a subscriber that was offline learns what it
   * missed from that first message rather than needing a separate catch-up
   * lookup.
   *
   * Failures are reported two different ways on purpose. Anything that stops
   * the stream from opening at all rejects the returned promise, because the
   * caller has no handle to close and nothing was subscribed. Anything after
   * that — a dropped connection, an uninterpretable message — goes to
   * `handlers.onError`, because by then the caller does hold a subscription
   * and has to decide whether to close it.
   *
   * There is no reconnect here. A subscription is a fast path layered over
   * polling, and a provider that silently reconnected would hide from its
   * caller that the fast path lapsed, along with any transition that happened
   * meanwhile.
   */
  async subscribeToInvoice(
    paymentHash: string,
    handlers: HodlInvoiceSubscriptionHandlers
  ): Promise<HodlInvoiceSubscription> {
    const normalized = normalizePaymentHash(paymentHash);
    const client = await this.getClient();

    if (typeof client.SubscribeSingleInvoice !== "function") {
      throw new LndProviderError(
        "The LND client does not expose SubscribeSingleInvoice; check that " +
          "invoices.proto was loaded"
      );
    }

    let stream: LndInvoiceStream;
    try {
      stream = client.SubscribeSingleInvoice({
        r_hash: hexToBytes(normalized),
      });
    } catch (error) {
      throw translateGrpcError(error, "SubscribeSingleInvoice", normalized);
    }

    // Set by close(), and by `end`. Every handler checks it first so that
    // cancelling inside a handler cannot produce one more callback after the
    // caller believed it was done — including the CANCELLED error grpc-js
    // raises in response to our own cancel().
    let closed = false;

    stream.on("data", (invoice) => {
      if (closed) return;
      let status: HodlInvoiceStatus;
      try {
        status = readInvoiceStatus(invoice, normalized);
      } catch (error) {
        // A message for the wrong invoice, or a state this build cannot map.
        // Reported rather than thrown: throwing here would escape into
        // grpc-js's emitter as an uncaught exception.
        handlers.onError(error);
        return;
      }
      try {
        handlers.onStatus(status);
      } catch (error) {
        handlers.onError(error);
      }
    });

    stream.on("error", (error) => {
      if (closed) return;
      handlers.onError(
        translateGrpcError(error, "SubscribeSingleInvoice", normalized)
      );
    });

    stream.on("end", () => {
      if (closed) return;
      closed = true;
      handlers.onClose();
    });

    return {
      close: () => {
        if (closed) return;
        closed = true;
        try {
          stream.cancel();
        } catch {
          // Already torn down by the transport; nothing left to release.
        }
      },
    };
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

/**
 * Reads the status out of an LND invoice message, rejecting anything that
 * cannot be trusted.
 *
 * Shared by `lookupInvoice` and `subscribeToInvoice` so the two paths cannot
 * drift: both check that the invoice is the one that was asked for — a
 * mixed-up hash would report someone else's escrow as settled — and both
 * refuse an unrecognised state rather than mapping it to a guess, since
 * guessing `open` invites cancelling funds that are actually held and
 * guessing `settled` releases an order nobody paid.
 *
 * @param expectedHash The payment hash this message must belong to.
 */
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

/**
 * Unwraps a dynamically imported CommonJS module.
 *
 * Both gRPC packages are CommonJS. Node's ESM loader synthesizes a `default`
 * that is `module.exports`, but a CommonJS-targeted transform (Jest here, and
 * potentially a server bundler) hands back a namespace whose named exports are
 * the API and whose `default` is undefined. Destructuring `{ default: grpc }`
 * therefore works under plain `node` — which is why
 * `scripts/lnd-test-connection.mjs` never hit this — and yields `undefined`
 * under Jest, surfacing as "Cannot read properties of undefined (reading
 * 'loadSync')" at the first call rather than at import.
 *
 * Preferring `default` when present and falling back to the namespace covers
 * both worlds.
 */
function interopRequire<T>(module: T): T {
  const candidate = (module as T & { default?: T }).default;
  return candidate ?? module;
}

/**
 * Builds the real gRPC client, following the setup proven by
 * `scripts/lnd-test-connection.mjs`.
 *
 * `@grpc/grpc-js` and `@grpc/proto-loader` are imported dynamically so that
 * merely importing this module does not pull a native-ish server-only
 * dependency into a bundle or a jsdom test environment. Tests inject a fake
 * client and never reach this function.
 *
 * A stale or corrupted `LND_TLS_CERT_HEX` surfaces as gRPC's
 * "self-signed certificate" — which means "the pinned cert is not the one the
 * node presents", not "self-signed certs are unsupported". Compare
 * fingerprints against the node before suspecting anything else.
 */
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

  return new descriptor.invoicesrpc.Invoices(host, credentials);
}
