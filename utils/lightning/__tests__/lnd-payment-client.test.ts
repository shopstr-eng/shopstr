/**
 * @jest-environment node
 */

/**
 * These tests inject a fake Router client, so they never open a socket and
 * run in CI with no Polar node present.
 *
 * The response shapes mirror the fields captured live via
 * `scripts/lnd-payment-test.mjs` against a real Polar node: `status` as one
 * of the `PaymentStatus` enum names (`enums: String` in the loader options),
 * `payment_hash`/`payment_preimage` as hex strings on `lnrpc.Payment`, and
 * `failure_reason` as a `PaymentFailureReason` enum name.
 */

import {
  LndPaymentClient,
  LndPaymentConfigError,
  LndPaymentError,
  type LndPaymentStream,
  type LndRouterClient,
} from "@/utils/lightning/lnd-payment-client";

const PAYMENT_HASH = "c".repeat(64);
const PREIMAGE = "d".repeat(64);
const PAYMENT_REQUEST = "lnbcrt50u1p4g94mnpp5examplepaymentrequest";

interface PaymentUpdate {
  payment_hash?: string;
  payment_preimage?: string;
  status?: string;
  failure_reason?: string;
}

type ErrorLike = Error & { code?: number; details?: string };

/** A fake server-streaming call: emits queued events on the next tick. */
class FakeStream implements LndPaymentStream {
  private dataListener: ((payment: PaymentUpdate) => void) | null = null;
  private errorListener: ((error: ErrorLike) => void) | null = null;
  private endListener: (() => void) | null = null;
  public cancelled = 0;

  on(event: "data", listener: (payment: PaymentUpdate) => void): void;
  on(event: "error", listener: (error: ErrorLike) => void): void;
  on(event: "end", listener: () => void): void;
  on(
    event: "data" | "error" | "end",
    listener:
      | ((payment: PaymentUpdate) => void)
      | ((error: ErrorLike) => void)
      | (() => void)
  ): void {
    if (event === "data")
      this.dataListener = listener as (payment: PaymentUpdate) => void;
    if (event === "error")
      this.errorListener = listener as (error: ErrorLike) => void;
    if (event === "end") this.endListener = listener as () => void;
  }

  cancel(): void {
    this.cancelled += 1;
  }

  emitData(update: PaymentUpdate): void {
    this.dataListener?.(update);
  }

  emitError(error: ErrorLike): void {
    this.errorListener?.(error);
  }

  emitEnd(): void {
    this.endListener?.();
  }
}

/** Fake Router client whose SendPaymentV2/TrackPaymentV2 hand back a
 *  pre-scripted FakeStream so tests can drive it after the call returns. */
class FakeRouterClient implements LndRouterClient {
  public sendStream: FakeStream | null = null;
  public trackStream: FakeStream | null = null;
  public sendRequests: unknown[] = [];
  public trackRequests: unknown[] = [];
  public closed = 0;

  SendPaymentV2(request: unknown): LndPaymentStream {
    this.sendRequests.push(request);
    this.sendStream = new FakeStream();
    return this.sendStream;
  }

  TrackPaymentV2(request: unknown): LndPaymentStream {
    this.trackRequests.push(request);
    this.trackStream = new FakeStream();
    return this.trackStream;
  }

  close(): void {
    this.closed += 1;
  }
}

function makeGrpcError(code: number, details: string): ErrorLike {
  const error = new Error(`${code} ${details}`) as ErrorLike;
  error.code = code;
  error.details = details;
  return error;
}

function clientWith(fake: FakeRouterClient): LndPaymentClient {
  return new LndPaymentClient({ client: fake });
}

/**
 * Lets the client's internal `getClient()` promise chain resolve before a
 * test reaches into the fake stream it produced. `sendPayment`/`trackPayment`
 * call the fake's method asynchronously (via `await this.getClient()`), so
 * `fake.sendStream`/`fake.trackStream` are not set on the same tick the call
 * was made.
 */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("LndPaymentClient.sendPayment", () => {
  it("calls SendPaymentV2 with only payment_request and fee_limit_sat", async () => {
    const fake = new FakeRouterClient();
    const client = clientWith(fake);

    const pending = client.sendPayment({
      paymentRequest: PAYMENT_REQUEST,
      feeLimitSat: 42,
    });
    await flush();
    fake.sendStream!.emitData({
      status: "SUCCEEDED",
      payment_hash: PAYMENT_HASH,
      payment_preimage: PREIMAGE,
    });
    await pending;

    expect(fake.sendRequests).toEqual([
      { payment_request: PAYMENT_REQUEST, fee_limit_sat: 42 },
    ]);
  });

  it("resolves succeeded with the payment hash and preimage on SUCCEEDED", async () => {
    const fake = new FakeRouterClient();
    const client = clientWith(fake);

    const pending = client.sendPayment({
      paymentRequest: PAYMENT_REQUEST,
      feeLimitSat: 42,
    });
    await flush();
    fake.sendStream!.emitData({
      status: "IN_FLIGHT",
    });
    fake.sendStream!.emitData({
      status: "SUCCEEDED",
      payment_hash: PAYMENT_HASH,
      payment_preimage: PREIMAGE,
    });

    await expect(pending).resolves.toEqual({
      status: "succeeded",
      paymentHash: PAYMENT_HASH,
      preimage: PREIMAGE,
    });
    // A terminal update ends the stream rather than leaving it hanging.
    expect(fake.sendStream!.cancelled).toBe(1);
  });

  it("resolves failed — not retried blindly as a success — on a FAILED terminal state", async () => {
    const fake = new FakeRouterClient();
    const client = clientWith(fake);

    const pending = client.sendPayment({
      paymentRequest: PAYMENT_REQUEST,
      feeLimitSat: 42,
    });
    await flush();
    fake.sendStream!.emitData({
      status: "FAILED",
      payment_hash: PAYMENT_HASH,
      failure_reason: "FAILURE_REASON_NO_ROUTE",
    });

    await expect(pending).resolves.toEqual({
      status: "failed",
      paymentHash: PAYMENT_HASH,
      failureReason: "FAILURE_REASON_NO_ROUTE",
    });
  });

  it("resolves unknown — neither success nor failure — when the stream ends without a terminal state", async () => {
    const fake = new FakeRouterClient();
    const client = clientWith(fake);

    const pending = client.sendPayment({
      paymentRequest: PAYMENT_REQUEST,
      feeLimitSat: 42,
    });
    await flush();
    fake.sendStream!.emitData({ status: "IN_FLIGHT" });
    fake.sendStream!.emitEnd();

    await expect(pending).resolves.toEqual({ status: "unknown" });
  });

  it("resolves unknown when the stream ends with no update at all", async () => {
    const fake = new FakeRouterClient();
    const client = clientWith(fake);

    const pending = client.sendPayment({
      paymentRequest: PAYMENT_REQUEST,
      feeLimitSat: 42,
    });
    await flush();
    fake.sendStream!.emitEnd();

    await expect(pending).resolves.toEqual({ status: "unknown" });
  });

  it("rejects with a redacted LndPaymentError on a stream error, never the raw gRPC error", async () => {
    const fake = new FakeRouterClient();
    const client = clientWith(fake);

    const pending = client.sendPayment({
      paymentRequest: PAYMENT_REQUEST,
      feeLimitSat: 42,
    });
    await flush();
    fake.sendStream!.emitError(
      makeGrpcError(2, `internal error, preimage ${PREIMAGE} rejected`)
    );

    const error = await pending.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LndPaymentError);
    const message = (error as Error).message;
    expect(message).toContain("[redacted]");
    expect(message).not.toContain(PREIMAGE);
  });
});

describe("LndPaymentClient.trackPayment", () => {
  it("calls TrackPaymentV2 with the payment hash as bytes", async () => {
    const fake = new FakeRouterClient();
    const client = clientWith(fake);

    const pending = client.trackPayment({ paymentHash: PAYMENT_HASH });
    await flush();
    fake.trackStream!.emitData({
      status: "SUCCEEDED",
      payment_hash: PAYMENT_HASH,
      payment_preimage: PREIMAGE,
    });
    await pending;

    expect(fake.trackRequests).toEqual([
      { payment_hash: Buffer.from(PAYMENT_HASH, "hex") },
    ]);
  });

  it("reports the current status for a real payment hash", async () => {
    const fake = new FakeRouterClient();
    const client = clientWith(fake);

    const pending = client.trackPayment({ paymentHash: PAYMENT_HASH });
    await flush();
    fake.trackStream!.emitData({
      status: "SUCCEEDED",
      payment_hash: PAYMENT_HASH,
      payment_preimage: PREIMAGE,
    });

    await expect(pending).resolves.toEqual({
      status: "succeeded",
      paymentHash: PAYMENT_HASH,
      preimage: PREIMAGE,
    });
  });

  it("allows the tracked payment hash through redaction but scrubs everything else", async () => {
    const fake = new FakeRouterClient();
    const client = clientWith(fake);

    const pending = client.trackPayment({ paymentHash: PAYMENT_HASH });
    await flush();
    fake.trackStream!.emitError(
      makeGrpcError(
        5,
        `unable to locate payment ${PAYMENT_HASH}, secret ${PREIMAGE}`
      )
    );

    const error = (await pending.catch((e: unknown) => e)) as Error;
    const message = error.message;
    expect(message).toContain(PAYMENT_HASH);
    expect(message).toContain("[redacted]");
    expect(message).not.toContain(PREIMAGE);
  });
});

describe("LndPaymentClient configuration", () => {
  it("rejects with LndPaymentConfigError, not a generic error, when the client factory reports missing config", async () => {
    const client = new LndPaymentClient({
      client: () =>
        Promise.reject(
          new LndPaymentConfigError(
            "Missing required env var LND_PAYMENT_MACAROON_HEX"
          )
        ),
    });

    await expect(
      client.sendPayment({ paymentRequest: PAYMENT_REQUEST, feeLimitSat: 10 })
    ).rejects.toBeInstanceOf(LndPaymentConfigError);
  });

  it("wraps a non-config factory failure as LndPaymentError", async () => {
    const client = new LndPaymentClient({
      client: () => Promise.reject(new Error("connection refused")),
    });

    const error = await client
      .sendPayment({ paymentRequest: PAYMENT_REQUEST, feeLimitSat: 10 })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LndPaymentError);
  });
});
