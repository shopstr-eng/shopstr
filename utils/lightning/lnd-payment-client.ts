import {
  describeGrpcFailure,
  type LndGrpcError,
} from "./lnd-hodl-invoice-provider";
import { normalizePaymentHash } from "./payment-hash";

// Uses a separate macaroon scoped to SendPaymentV2 and TrackPaymentV2.
// LND decodes the payout invoice; no DecodePayReq permission is needed.

/** Injection seam mirroring the generated grpc-js Router client. */
export interface LndRouterClient {
  SendPaymentV2(request: SendPaymentV2Request): LndPaymentStream;
  TrackPaymentV2(request: TrackPaymentV2Request): LndPaymentStream;
  close?(): void;
}

/**
 * Both RPCs here are server-streaming — LND streams payment updates until a
 * terminal state — so there is no unary callback shape to mirror, unlike most
 * of {@link file://./lnd-hodl-invoice-provider.ts}.
 */
export interface LndPaymentStream {
  on(event: "data", listener: (payment: LndPaymentUpdate) => void): void;
  on(event: "error", listener: (error: LndGrpcError) => void): void;
  on(event: "end", listener: () => void): void;
  cancel(): void;
}

interface SendPaymentV2Request {
  payment_request: string;
  fee_limit_sat: number;
}

interface TrackPaymentV2Request {
  payment_hash: Uint8Array;
}

/** Only the fields this client reads off `lnrpc.Payment`. */
interface LndPaymentUpdate {
  payment_hash?: string;
  payment_preimage?: string;
  status?: string;
  failure_reason?: string;
}

/** A closed or timed-out stream is unknown, never proof that a payment failed. */
export type LndPaymentOutcome =
  | { status: "succeeded"; paymentHash: string; preimage: string }
  | { status: "failed"; paymentHash?: string; failureReason: string }
  | { status: "unknown" };

export interface LndPaymentClientOptions {
  /** Pre-built client, or a factory for one. Supplied by tests. */
  client?: LndRouterClient | (() => Promise<LndRouterClient>);
  /** How long a stream may run with no terminal update before it is treated
   *  as `unknown` and cancelled. */
  streamTimeoutMs?: number;
}

const DEFAULT_STREAM_TIMEOUT_MS = 60_000;

const LOADER_OPTIONS = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
} as const;

const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED"]);

/**
 * Infrastructure failure: connection, credentials, or an uninterpretable
 * response. Message is always pre-redacted via {@link describeGrpcFailure}.
 */
export class LndPaymentError extends Error {
  public readonly grpcCode?: number;

  constructor(message: string, grpcCode?: number) {
    super(message);
    this.name = "LndPaymentError";
    if (grpcCode !== undefined) this.grpcCode = grpcCode;
  }
}

/** Missing/invalid configuration: no payment RPC was attempted. */
export class LndPaymentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LndPaymentConfigError";
  }
}

export class LndPaymentClient {
  private readonly streamTimeoutMs: number;
  private readonly clientFactory: () => Promise<LndRouterClient>;
  private clientPromise: Promise<LndRouterClient> | null = null;

  constructor(options: LndPaymentClientOptions = {}) {
    this.streamTimeoutMs = options.streamTimeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS;

    const injected = options.client;
    if (typeof injected === "function") {
      this.clientFactory = injected;
    } else if (injected) {
      this.clientFactory = async () => injected;
    } else {
      this.clientFactory = createLndRouterClient;
    }
  }

  /** Send the invoice and await a terminal outcome, redacting all secret-looking error values. */
  async sendPayment(params: {
    paymentRequest: string;
    feeLimitSat: number;
  }): Promise<LndPaymentOutcome> {
    const client = await this.getClient();

    let stream: LndPaymentStream;
    try {
      stream = client.SendPaymentV2({
        payment_request: params.paymentRequest,
        fee_limit_sat: params.feeLimitSat,
      });
    } catch (error) {
      throw translatePaymentError(error, "SendPaymentV2");
    }

    const lastUpdate = await this.consumeStream(stream, "SendPaymentV2");
    return outcomeFromUpdate(lastUpdate);
  }

  /** Reports the current/final status of a payment already sent. */
  async trackPayment(params: {
    paymentHash: string;
  }): Promise<LndPaymentOutcome> {
    const normalized = normalizePaymentHash(params.paymentHash);
    const client = await this.getClient();

    let stream: LndPaymentStream;
    try {
      stream = client.TrackPaymentV2({
        payment_hash: hexToBytes(normalized),
      });
    } catch (error) {
      throw translatePaymentError(error, "TrackPaymentV2", normalized);
    }

    const lastUpdate = await this.consumeStream(
      stream,
      "TrackPaymentV2",
      normalized
    );
    return outcomeFromUpdate(lastUpdate);
  }

  /** Releases the gRPC channel. */
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

  private async getClient(): Promise<LndRouterClient> {
    if (!this.clientPromise) {
      this.clientPromise = this.clientFactory().catch((error: unknown) => {
        this.clientPromise = null;
        if (error instanceof LndPaymentConfigError) throw error;
        throw new LndPaymentError(
          `Could not connect to the Lightning node: ${describeGrpcFailure(error)}`
        );
      });
    }
    return this.clientPromise;
  }

  /** A terminal update, stream end or timeout resolves; transport errors reject with redaction. */
  private consumeStream(
    stream: LndPaymentStream,
    method: string,
    allowedHash?: string
  ): Promise<LndPaymentUpdate | null> {
    return new Promise((resolve, reject) => {
      let lastUpdate: LndPaymentUpdate | null = null;
      let settled = false;

      const finish = (value: LndPaymentUpdate | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          stream.cancel();
        } catch {
          // Already torn down by the transport.
        }
        resolve(value);
      };

      const timer = setTimeout(() => finish(lastUpdate), this.streamTimeoutMs);

      stream.on("data", (update) => {
        if (settled) return;
        lastUpdate = update;
        if (TERMINAL_STATUSES.has(update.status ?? "")) finish(lastUpdate);
      });
      stream.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(translatePaymentError(error, method, allowedHash));
      });
      stream.on("end", () => finish(lastUpdate));
    });
  }
}

function outcomeFromUpdate(update: LndPaymentUpdate | null): LndPaymentOutcome {
  if (update?.status === "SUCCEEDED") {
    return {
      status: "succeeded",
      paymentHash: update.payment_hash ?? "",
      preimage: update.payment_preimage ?? "",
    };
  }
  if (update?.status === "FAILED") {
    return {
      status: "failed",
      ...(update.payment_hash ? { paymentHash: update.payment_hash } : {}),
      failureReason: update.failure_reason ?? "FAILURE_REASON_NONE",
    };
  }
  return { status: "unknown" };
}

/** Maps a gRPC/stream failure onto a typed, redacted error. */
function translatePaymentError(
  error: unknown,
  method: string,
  allowedHash?: string
): Error {
  if (error instanceof LndPaymentConfigError) return error;
  const grpcError = error as LndGrpcError | undefined;
  return new LndPaymentError(
    `LND ${method} failed: ${describeGrpcFailure(error, allowedHash)}`,
    grpcError?.code
  );
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new LndPaymentConfigError(`Missing required env var ${name}`);
  }
  return value;
}

function decodeHexEnv(name: string): Buffer {
  const raw = requireEnv(name).trim();
  if (!/^[0-9a-f]+$/i.test(raw) || raw.length % 2 !== 0) {
    // Length only — never the value, which for the macaroon is a credential.
    throw new LndPaymentConfigError(
      `${name} is not valid hex (${raw.length} characters)`
    );
  }
  return Buffer.from(raw, "hex");
}

function interopRequire<T>(module: T): T {
  const candidate = (module as T & { default?: T }).default;
  return candidate ?? module;
}

/** Create the TLS-pinned Router client with its restricted payment macaroon. */
async function createLndRouterClient(): Promise<LndRouterClient> {
  process.env.GRPC_SSL_CIPHER_SUITES ??= "HIGH+ECDSA";

  const [grpcNamespace, protoLoaderNamespace] = await Promise.all([
    import("@grpc/grpc-js"),
    import("@grpc/proto-loader"),
  ]);
  const grpc = interopRequire(grpcNamespace);
  const protoLoader = interopRequire(protoLoaderNamespace);

  const host = requireEnv("LND_HOST");
  const tlsCert = decodeHexEnv("LND_TLS_CERT_HEX");
  const macaroonHex = decodeHexEnv("LND_PAYMENT_MACAROON_HEX").toString("hex");

  const protoDir =
    process.env.LND_PROTO_DIR ?? `${process.cwd()}/utils/lightning/lnd-proto`;
  const packageDefinition = protoLoader.loadSync(
    ["lightning.proto", "router.proto"],
    { ...LOADER_OPTIONS, includeDirs: [protoDir] }
  );

  const descriptor = grpc.loadPackageDefinition(
    packageDefinition
  ) as unknown as {
    routerrpc: {
      Router: new (
        address: string,
        credentials: ReturnType<typeof grpc.credentials.createSsl>
      ) => LndRouterClient;
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

  return new descriptor.routerrpc.Router(host, credentials);
}

let defaultClient: LndPaymentClient | null = null;

/** The process-wide payment client, built lazily on first use. */
export function getLndPaymentClient(): LndPaymentClient {
  if (!defaultClient) defaultClient = new LndPaymentClient();
  return defaultClient;
}
