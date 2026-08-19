import {
  HodlInvoiceError,
  isHodlInvoiceError,
} from "@/utils/lightning/hodl-invoice-provider";
import {
  describeGrpcFailure,
  LndHodlInvoiceProvider,
  LndProviderError,
  parseLndInteger,
  type LndCallback,
  type LndCallOptions,
  type LndGrpcError,
  type LndInvoicesClient,
  type LndInvoiceStream,
} from "@/utils/lightning/lnd-hodl-invoice-provider";
import { paymentHashFromPreimage } from "@/utils/lightning/payment-hash";

/**
 * These tests inject a fake gRPC client, so they never open a socket and run
 * in CI with no Polar node present.
 *
 * The fixtures are not invented: every response shape and every error
 * `details` string below was captured from a live Polar LND node (v0.18,
 * regtest) while building this provider — including the ones that look wrong,
 * like `CANCELED` with one L, `add_index` as the string `"7"`, and status 2
 * (UNKNOWN) on semantic failures that would normally be FAILED_PRECONDITION.
 *
 * To re-verify against a real node instead of these fakes, run the diagnostic
 * script, which exercises the same calls end to end over a real connection:
 *
 *   LND_HOST=127.0.0.1:10002 \
 *   LND_TLS_CERT_HEX=$(xxd -p -c 100000 ~/.polar/networks/1/volumes/lnd/bob/tls.cert | tr -d '\n') \
 *   LND_INVOICE_MACAROON_HEX=$(xxd -p -c 100000 \
 *     ~/.polar/networks/1/volumes/lnd/bob/data/chain/bitcoin/regtest/invoice.macaroon | tr -d '\n') \
 *   node scripts/lnd-test-connection.mjs
 *
 * Reaching `accepted` needs a payer, since only a real HTLC locks the invoice:
 *
 *   docker exec polar-n1-alice lncli --network=regtest --lnddir=/home/lnd/.lnd \
 *     --rpcserver=localhost:10009 payinvoice --force <payment_request>
 *
 * That call hangs by design — a hold invoice parks the HTLC — at which point
 * `lookupInvoice` reports `accepted` and `settleInvoice` releases it.
 */

const PREIMAGE =
  "ae6d2bd38a108b41c73992ed11c8f3ada99c7707e5a36322f51716bca76e5af8";
const PAYMENT_HASH = paymentHashFromPreimage(PREIMAGE);

const PAYMENT_REQUEST =
  "lnbcrt50u1p4g94mnpp5xa03fdz02567aevzf9ep8lzzv9gt62z5md3zpxra70gql8sy3vmqdpcwd5x7urnw3ezq6r0v3kzqetnvdex7aeq";

type Method =
  "AddHoldInvoice" | "LookupInvoiceV2" | "SettleInvoice" | "CancelInvoice";

interface RecordedCall {
  method: Method;
  request: unknown;
  options: LndCallOptions;
}

type Responder = (
  request: unknown
) => { response: unknown } | { error: LndGrpcError } | { throws: Error };

/** Fake grpc-js client. Records requests and replays canned outcomes. */
class FakeInvoicesClient implements LndInvoicesClient {
  public readonly calls: RecordedCall[] = [];
  public closed = 0;
  private readonly responders = new Map<Method, Responder[]>();

  on(method: Method, responder: Responder): this {
    const existing = this.responders.get(method) ?? [];
    existing.push(responder);
    this.responders.set(method, existing);
    return this;
  }

  /** Convenience: always answer `method` with a successful `response`. */
  ok(method: Method, response: unknown): this {
    return this.on(method, () => ({ response }));
  }

  /** Convenience: always fail `method` with a grpc-shaped error. */
  fail(method: Method, code: number, details: string): this {
    return this.on(method, () => ({
      error: makeGrpcError(code, details),
    }));
  }

  private dispatch<T>(
    method: Method,
    request: unknown,
    options: LndCallOptions,
    callback: LndCallback<T>
  ): void {
    this.calls.push({ method, request, options });
    const queue = this.responders.get(method);
    if (!queue || queue.length === 0) {
      throw new Error(
        `FakeInvoicesClient: no responder registered for ${method}`
      );
    }
    // Last responder repeats, so a single registration serves repeat calls
    // while a sequence can model changing node state.
    const responder = queue.length > 1 ? queue.shift()! : queue[0]!;
    const outcome = responder(request);

    if ("throws" in outcome) throw outcome.throws;
    // Async, like a real call.
    if ("error" in outcome) {
      setTimeout(() => callback(outcome.error), 0);
      return;
    }
    setTimeout(() => callback(null, outcome.response as T), 0);
  }

  AddHoldInvoice(
    request: unknown,
    options: LndCallOptions,
    callback: LndCallback<never>
  ): void {
    this.dispatch("AddHoldInvoice", request, options, callback);
  }
  LookupInvoiceV2(
    request: unknown,
    options: LndCallOptions,
    callback: LndCallback<never>
  ): void {
    this.dispatch("LookupInvoiceV2", request, options, callback);
  }
  SettleInvoice(
    request: unknown,
    options: LndCallOptions,
    callback: LndCallback<never>
  ): void {
    this.dispatch("SettleInvoice", request, options, callback);
  }
  CancelInvoice(
    request: unknown,
    options: LndCallOptions,
    callback: LndCallback<never>
  ): void {
    this.dispatch("CancelInvoice", request, options, callback);
  }
  close(): void {
    this.closed += 1;
  }
}

function makeGrpcError(code: number, details: string): LndGrpcError {
  const error = new Error(`${code} ${details}`) as LndGrpcError;
  error.code = code;
  error.details = details;
  return error;
}

function hex(value: string): Buffer {
  return Buffer.from(value, "hex");
}

/**
 * A LookupInvoiceV2 response with the full field set a real node returns,
 * including the numeric-string fields, so tests exercise the real shape.
 */
function invoiceResponse(
  state: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    memo: "order #1",
    r_hash: hex(PAYMENT_HASH),
    r_preimage: state === "SETTLED" ? hex(PREIMAGE) : Buffer.alloc(0),
    value: "5000",
    value_msat: "5000000",
    settled: state === "SETTLED",
    creation_date: "1786960223",
    settle_date: state === "SETTLED" ? "1786960299" : "0",
    payment_request: PAYMENT_REQUEST,
    expiry: "600",
    cltv_expiry: "80",
    add_index: "7",
    settle_index: state === "SETTLED" ? "2" : "0",
    amt_paid_sat: state === "OPEN" ? "0" : "5000",
    amt_paid_msat: state === "OPEN" ? "0" : "5000000",
    state,
    htlcs: [],
    ...overrides,
  };
}

function providerWith(client: FakeInvoicesClient): LndHodlInvoiceProvider {
  return new LndHodlInvoiceProvider({ client });
}

/** Asserts the thrown value is a HodlInvoiceError carrying `code`. */
async function expectCode(op: Promise<unknown>, code: string): Promise<void> {
  await expect(op).rejects.toBeInstanceOf(HodlInvoiceError);
  await op.catch((err) => {
    expect((err as HodlInvoiceError).code).toBe(code);
  });
}

describe("createHoldInvoice", () => {
  it("translates AddHoldInvoice into the interface's result shape", async () => {
    const client = new FakeInvoicesClient().ok("AddHoldInvoice", {
      payment_request: PAYMENT_REQUEST,
      add_index: "7",
      payment_addr: hex(
        "bb4ec3558e6df0c8d7dee65cf97666e436b968415902814666c7c38caa9d27c6"
      ),
    });

    const result = await providerWith(client).createHoldInvoice({
      amountSats: 5000,
      paymentHash: PAYMENT_HASH,
      memo: "order #1",
      expirySeconds: 600,
    });

    // Exactly the mock's shape: nothing from LND's richer response leaks.
    expect(result).toEqual({
      invoice: PAYMENT_REQUEST,
      paymentHash: PAYMENT_HASH,
    });
    expect(Object.keys(result).sort()).toEqual(["invoice", "paymentHash"]);
  });

  it("sends the payment hash as 32 raw bytes, not hex text", async () => {
    const client = new FakeInvoicesClient().ok("AddHoldInvoice", {
      payment_request: PAYMENT_REQUEST,
      add_index: "1",
    });

    await providerWith(client).createHoldInvoice({
      amountSats: 5000,
      paymentHash: PAYMENT_HASH,
    });

    const request = client.calls[0]!.request as {
      hash: Uint8Array;
      value: number;
      expiry: number;
      memo?: string;
    };
    expect(request.hash).toHaveLength(32);
    expect(Buffer.from(request.hash).toString("hex")).toBe(PAYMENT_HASH);
    expect(request.value).toBe(5000);
    // Omitted rather than sent as undefined, matching the mock's handling.
    expect("memo" in request).toBe(false);
  });

  it("applies a default expiry matching the mock's when none is given", async () => {
    const client = new FakeInvoicesClient().ok("AddHoldInvoice", {
      payment_request: PAYMENT_REQUEST,
      add_index: "1",
    });

    await providerWith(client).createHoldInvoice({
      amountSats: 5000,
      paymentHash: PAYMENT_HASH,
    });

    expect((client.calls[0]!.request as { expiry: number }).expiry).toBe(3600);
  });

  it("rejects a zero or negative amount before calling LND", async () => {
    // Not a redundant guard: a live node accepts `value: 0` and issues an
    // open-amount invoice, which on an escrow order is a silent underpayment.
    const client = new FakeInvoicesClient().ok("AddHoldInvoice", {
      payment_request: PAYMENT_REQUEST,
    });
    const provider = providerWith(client);

    await expectCode(
      provider.createHoldInvoice({ amountSats: 0, paymentHash: PAYMENT_HASH }),
      "invalid_amount"
    );
    await expectCode(
      provider.createHoldInvoice({ amountSats: -1, paymentHash: PAYMENT_HASH }),
      "invalid_amount"
    );
    await expectCode(
      provider.createHoldInvoice({
        amountSats: 1.5,
        paymentHash: PAYMENT_HASH,
      }),
      "invalid_amount"
    );
    expect(client.calls).toHaveLength(0);
  });

  it("rejects a malformed payment hash before calling LND", async () => {
    const client = new FakeInvoicesClient();
    await expectCode(
      providerWith(client).createHoldInvoice({
        amountSats: 5000,
        paymentHash: "not-a-hash",
      }),
      "invalid_payment_hash"
    );
    expect(client.calls).toHaveLength(0);
  });

  it("maps LND's duplicate-hash error to duplicate_payment_hash", async () => {
    // Real node: status 2 (UNKNOWN), not ALREADY_EXISTS.
    const client = new FakeInvoicesClient().fail(
      "AddHoldInvoice",
      2,
      "invoice with payment hash already exists"
    );
    await expectCode(
      providerWith(client).createHoldInvoice({
        amountSats: 5000,
        paymentHash: PAYMENT_HASH,
      }),
      "duplicate_payment_hash"
    );
  });

  it("fails loudly when LND returns no payment request", async () => {
    const client = new FakeInvoicesClient().ok("AddHoldInvoice", {
      add_index: "7",
    });
    await expect(
      providerWith(client).createHoldInvoice({
        amountSats: 5000,
        paymentHash: PAYMENT_HASH,
      })
    ).rejects.toBeInstanceOf(LndProviderError);
  });

  it("rejects an add_index that is not an integer string", async () => {
    // Guards a loader-option regression: `longs: Number` yields a Long object
    // here, which would mean `state` and `r_preimage` are untrustworthy too.
    const client = new FakeInvoicesClient().ok("AddHoldInvoice", {
      payment_request: PAYMENT_REQUEST,
      add_index: { low: 7, high: 0, unsigned: true },
    });
    await expect(
      providerWith(client).createHoldInvoice({
        amountSats: 5000,
        paymentHash: PAYMENT_HASH,
      })
    ).rejects.toBeInstanceOf(LndProviderError);
  });

  it("accepts add_index as a string without coercion bugs", async () => {
    // "10" < "9" is true as strings; this is the field where that would bite.
    const client = new FakeInvoicesClient().ok("AddHoldInvoice", {
      payment_request: PAYMENT_REQUEST,
      add_index: "10",
    });
    await expect(
      providerWith(client).createHoldInvoice({
        amountSats: 5000,
        paymentHash: PAYMENT_HASH,
      })
    ).resolves.toEqual({ invoice: PAYMENT_REQUEST, paymentHash: PAYMENT_HASH });
  });
});

describe("lookupInvoice state mapping", () => {
  const cases: ReadonlyArray<[string, string]> = [
    ["OPEN", "open"],
    ["ACCEPTED", "accepted"],
    ["SETTLED", "settled"],
    // One L from LND, two in this codebase's interface.
    ["CANCELED", "cancelled"],
  ];

  it.each(cases)("maps LND state %s to %s", async (lndState, expected) => {
    const client = new FakeInvoicesClient().ok(
      "LookupInvoiceV2",
      invoiceResponse(lndState)
    );
    const result = await providerWith(client).lookupInvoice(PAYMENT_HASH);
    expect(result.status).toBe(expected);
  });

  it("covers every status the interface defines", () => {
    expect(cases.map(([, status]) => status).sort()).toEqual([
      "accepted",
      "cancelled",
      "open",
      "settled",
    ]);
  });

  it("sends the payment hash as raw bytes", async () => {
    const client = new FakeInvoicesClient().ok(
      "LookupInvoiceV2",
      invoiceResponse("OPEN")
    );
    await providerWith(client).lookupInvoice(PAYMENT_HASH);
    const request = client.calls[0]!.request as { payment_hash: Uint8Array };
    expect(Buffer.from(request.payment_hash).toString("hex")).toBe(
      PAYMENT_HASH
    );
  });

  it("accepts an uppercase payment hash, like the mock", async () => {
    const client = new FakeInvoicesClient().ok(
      "LookupInvoiceV2",
      invoiceResponse("OPEN")
    );
    const result = await providerWith(client).lookupInvoice(
      PAYMENT_HASH.toUpperCase()
    );
    expect(result.status).toBe("open");
  });

  it("throws on an unrecognised state rather than guessing", async () => {
    const client = new FakeInvoicesClient().ok(
      "LookupInvoiceV2",
      invoiceResponse("SOMETHING_NEW")
    );
    await expect(
      providerWith(client).lookupInvoice(PAYMENT_HASH)
    ).rejects.toBeInstanceOf(LndProviderError);
  });

  it("throws when enums arrive as integers (loader-option regression)", async () => {
    const client = new FakeInvoicesClient().ok(
      "LookupInvoiceV2",
      invoiceResponse("OPEN", { state: 0 })
    );
    await expect(
      providerWith(client).lookupInvoice(PAYMENT_HASH)
    ).rejects.toBeInstanceOf(LndProviderError);
  });

  it("rejects an invoice for a different payment hash", async () => {
    const client = new FakeInvoicesClient().ok(
      "LookupInvoiceV2",
      invoiceResponse("SETTLED", { r_hash: hex("ab".repeat(32)) })
    );
    await expect(
      providerWith(client).lookupInvoice(PAYMENT_HASH)
    ).rejects.toBeInstanceOf(LndProviderError);
  });

  it("maps NOT_FOUND to invoice_not_found", async () => {
    const client = new FakeInvoicesClient().fail(
      "LookupInvoiceV2",
      5,
      "unable to locate invoice"
    );
    await expectCode(
      providerWith(client).lookupInvoice(PAYMENT_HASH),
      "invoice_not_found"
    );
  });
});

describe("lookupInvoice preimage exposure", () => {
  it("returns the preimage once settled", async () => {
    const client = new FakeInvoicesClient().ok(
      "LookupInvoiceV2",
      invoiceResponse("SETTLED")
    );
    const result = await providerWith(client).lookupInvoice(PAYMENT_HASH);
    expect(result).toEqual({ status: "settled", preimage: PREIMAGE });
    // Round-trips: the revealed secret really does hash to this invoice.
    expect(paymentHashFromPreimage(result.preimage!)).toBe(PAYMENT_HASH);
  });

  it.each(["OPEN", "ACCEPTED", "CANCELED"])(
    "omits the preimage entirely in state %s",
    async (state) => {
      const client = new FakeInvoicesClient().ok(
        "LookupInvoiceV2",
        invoiceResponse(state)
      );
      const result = await providerWith(client).lookupInvoice(PAYMENT_HASH);
      // Absent, not undefined-valued — callers use `in` and truthiness checks.
      expect("preimage" in result).toBe(false);
    }
  );

  it("omits the preimage when LND reports settled with an empty buffer", async () => {
    // An empty-string preimage would read as "revealed" to a caller doing an
    // `in` check while being useless to settle with.
    const client = new FakeInvoicesClient().ok(
      "LookupInvoiceV2",
      invoiceResponse("SETTLED", { r_preimage: Buffer.alloc(0) })
    );
    const result = await providerWith(client).lookupInvoice(PAYMENT_HASH);
    expect(result).toEqual({ status: "settled" });
    expect("preimage" in result).toBe(false);
  });

  it("never exposes a preimage while the HTLC is merely held", async () => {
    // The escrow-critical case: `accepted` means the buyer's funds are locked
    // but must not be claimable until someone deliberately settles.
    const client = new FakeInvoicesClient().ok(
      "LookupInvoiceV2",
      invoiceResponse("ACCEPTED", { r_preimage: hex(PREIMAGE) })
    );
    const result = await providerWith(client).lookupInvoice(PAYMENT_HASH);
    expect(result).toEqual({ status: "accepted" });
  });
});

describe("settleInvoice", () => {
  it("sends the preimage as raw bytes and resolves on an empty response", async () => {
    const client = new FakeInvoicesClient().ok("SettleInvoice", {});
    await expect(
      providerWith(client).settleInvoice(PREIMAGE)
    ).resolves.toBeUndefined();

    const request = client.calls[0]!.request as { preimage: Uint8Array };
    expect(request.preimage).toHaveLength(32);
    expect(Buffer.from(request.preimage).toString("hex")).toBe(PREIMAGE);
  });

  it("is idempotent when the invoice is already settled", async () => {
    // A live node returns an empty response rather than an error here, which
    // is the behaviour the interface requires; nothing extra to do.
    const client = new FakeInvoicesClient().ok("SettleInvoice", {});
    const provider = providerWith(client);
    await provider.settleInvoice(PREIMAGE);
    await expect(provider.settleInvoice(PREIMAGE)).resolves.toBeUndefined();
  });

  it("rejects a malformed preimage before calling LND", async () => {
    const client = new FakeInvoicesClient();
    await expectCode(
      providerWith(client).settleInvoice("nope"),
      "invalid_preimage"
    );
    expect(client.calls).toHaveLength(0);
  });

  it('maps "invoice still open" to invalid_state_transition', async () => {
    const client = new FakeInvoicesClient().fail(
      "SettleInvoice",
      2,
      "invoice still open"
    );
    await expectCode(
      providerWith(client).settleInvoice(PREIMAGE),
      "invalid_state_transition"
    );
  });

  it('maps "invoice already canceled" to invalid_state_transition', async () => {
    const client = new FakeInvoicesClient().fail(
      "SettleInvoice",
      2,
      "invoice already canceled"
    );
    await expectCode(
      providerWith(client).settleInvoice(PREIMAGE),
      "invalid_state_transition"
    );
  });

  it("maps an unknown invoice to invoice_not_found", async () => {
    const client = new FakeInvoicesClient().fail(
      "SettleInvoice",
      2,
      "unable to locate invoice"
    );
    await expectCode(
      providerWith(client).settleInvoice(PREIMAGE),
      "invoice_not_found"
    );
  });
});

describe("cancelInvoice", () => {
  it("sends the payment hash as raw bytes and resolves on an empty response", async () => {
    const client = new FakeInvoicesClient().ok("CancelInvoice", {});
    await expect(
      providerWith(client).cancelInvoice(PAYMENT_HASH)
    ).resolves.toBeUndefined();

    const request = client.calls[0]!.request as { payment_hash: Uint8Array };
    expect(Buffer.from(request.payment_hash).toString("hex")).toBe(
      PAYMENT_HASH
    );
  });

  it("is idempotent when the invoice is already cancelled", async () => {
    const client = new FakeInvoicesClient().ok("CancelInvoice", {});
    const provider = providerWith(client);
    await provider.cancelInvoice(PAYMENT_HASH);
    await expect(provider.cancelInvoice(PAYMENT_HASH)).resolves.toBeUndefined();
  });

  it('maps "invoice already settled" to invalid_state_transition', async () => {
    const client = new FakeInvoicesClient().fail(
      "CancelInvoice",
      2,
      "invoice already settled"
    );
    await expectCode(
      providerWith(client).cancelInvoice(PAYMENT_HASH),
      "invalid_state_transition"
    );
  });

  it("maps an unknown invoice to invoice_not_found", async () => {
    const client = new FakeInvoicesClient().fail(
      "CancelInvoice",
      2,
      "unable to locate invoice"
    );
    await expectCode(
      providerWith(client).cancelInvoice(PAYMENT_HASH),
      "invoice_not_found"
    );
  });

  it("rejects a malformed payment hash before calling LND", async () => {
    const client = new FakeInvoicesClient();
    await expectCode(
      providerWith(client).cancelInvoice("zz"),
      "invalid_payment_hash"
    );
    expect(client.calls).toHaveLength(0);
  });
});

describe("error translation never leaks raw gRPC text", () => {
  it("reports infrastructure failures as LndProviderError, not HodlInvoiceError", async () => {
    // Status 14 UNAVAILABLE must not be misattributed to the caller: existing
    // consumers turn HodlInvoiceError into a 4xx and anything else into a
    // retryable 502.
    const client = new FakeInvoicesClient().fail(
      "LookupInvoiceV2",
      14,
      "failed to connect to all addresses"
    );
    const error = await providerWith(client)
      .lookupInvoice(PAYMENT_HASH)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LndProviderError);
    expect(isHodlInvoiceError(error)).toBe(false);
    expect((error as LndProviderError).grpcCode).toBe(14);
  });

  it("redacts a preimage echoed back inside a gRPC error", async () => {
    // The failure this exists for: settleInvoice is the one call that handles
    // a raw secret, and LND errors can quote the request that failed.
    // The worst realistic case: LND quotes both the hash it looked up and the
    // secret it was handed. The hash must survive so the log is traceable; the
    // preimage must not, since it alone can release the funds.
    const client = new FakeInvoicesClient().fail(
      "SettleInvoice",
      13,
      `internal error settling ${PAYMENT_HASH} with preimage ${PREIMAGE}`
    );
    const error = await providerWith(client)
      .settleInvoice(PREIMAGE)
      .catch((e: unknown) => e);

    const message = (error as Error).message;
    expect(message).not.toContain(PREIMAGE);
    expect(message).toContain("[redacted]");
    // The payment hash is derived, not secret, so it stays legible for logs.
    expect(message).toContain(PAYMENT_HASH);
  });

  it("keeps LND's own wording out of typed errors", async () => {
    const client = new FakeInvoicesClient().fail(
      "SettleInvoice",
      2,
      `invoice still open ${PREIMAGE}`
    );
    const error = await providerWith(client)
      .settleInvoice(PREIMAGE)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HodlInvoiceError);
    expect((error as Error).message).not.toContain(PREIMAGE);
    // Our prose, not LND's.
    expect((error as Error).message).toContain("only an accepted (held) HTLC");
  });

  it("translates a synchronous client throw", async () => {
    const client = new FakeInvoicesClient().on("CancelInvoice", () => ({
      throws: new Error("The channel has been closed"),
    }));
    await expect(
      providerWith(client).cancelInvoice(PAYMENT_HASH)
    ).rejects.toBeInstanceOf(LndProviderError);
  });

  it("surfaces a connection failure as LndProviderError with no credentials in it", async () => {
    const provider = new LndHodlInvoiceProvider({
      client: () =>
        Promise.reject(new Error(`bad macaroon ${"ab".repeat(32)}`)),
    });
    const error = await provider
      .lookupInvoice(PAYMENT_HASH)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LndProviderError);
    expect((error as Error).message).not.toContain("ab".repeat(32));
    expect((error as Error).message).toContain("[redacted]");
  });
});

describe("connection handling", () => {
  it("builds the client once across many calls", async () => {
    const client = new FakeInvoicesClient()
      .ok("LookupInvoiceV2", invoiceResponse("OPEN"))
      .ok("CancelInvoice", {});
    let built = 0;
    const provider = new LndHodlInvoiceProvider({
      client: () => {
        built += 1;
        return Promise.resolve(client);
      },
    });

    await provider.lookupInvoice(PAYMENT_HASH);
    await provider.lookupInvoice(PAYMENT_HASH);
    await provider.cancelInvoice(PAYMENT_HASH);

    expect(built).toBe(1);
    expect(client.calls).toHaveLength(3);
  });

  it("retries the connection after a failed attempt", async () => {
    // A cached rejection would otherwise poison every later call because the
    // node happened to be down at startup.
    const client = new FakeInvoicesClient().ok(
      "LookupInvoiceV2",
      invoiceResponse("OPEN")
    );
    let attempt = 0;
    const provider = new LndHodlInvoiceProvider({
      client: () => {
        attempt += 1;
        return attempt === 1
          ? Promise.reject(new Error("connect ECONNREFUSED"))
          : Promise.resolve(client);
      },
    });

    await expect(provider.lookupInvoice(PAYMENT_HASH)).rejects.toBeInstanceOf(
      LndProviderError
    );
    await expect(provider.lookupInvoice(PAYMENT_HASH)).resolves.toEqual({
      status: "open",
    });
    expect(attempt).toBe(2);
  });

  it("applies a call deadline", async () => {
    const client = new FakeInvoicesClient().ok("CancelInvoice", {});
    const before = Date.now();
    await new LndHodlInvoiceProvider({
      client,
      callTimeoutMs: 5000,
    }).cancelInvoice(PAYMENT_HASH);
    const deadline = client.calls[0]!.options.deadline;
    expect(deadline).toBeGreaterThanOrEqual(before + 5000);
    expect(deadline).toBeLessThanOrEqual(Date.now() + 5000);
  });

  it("closes the channel", async () => {
    const client = new FakeInvoicesClient().ok("CancelInvoice", {});
    const provider = providerWith(client);
    await provider.cancelInvoice(PAYMENT_HASH);
    await provider.close();
    expect(client.closed).toBe(1);
  });

  it("closes cleanly when no connection was ever made", async () => {
    await expect(
      new LndHodlInvoiceProvider({}).close()
    ).resolves.toBeUndefined();
  });
});

describe("parseLndInteger", () => {
  it("parses the decimal strings LND actually returns", () => {
    // Captured from a live node: add_index "7", value "5000", settle_index "2".
    expect(parseLndInteger("7")).toBe(7);
    expect(parseLndInteger("0")).toBe(0);
    expect(parseLndInteger("5000")).toBe(5000);
    expect(parseLndInteger("-1")).toBe(-1);
  });

  it("orders correctly, unlike raw string comparison", () => {
    expect("10" < "9").toBe(true); // the bug this helper prevents
    expect(parseLndInteger("10")! < parseLndInteger("9")!).toBe(false);
  });

  it("accepts native numbers in case loader options change", () => {
    expect(parseLndInteger(7)).toBe(7);
  });

  it("rejects anything that is not an integer, rather than coercing", () => {
    for (const bad of [
      "",
      " ",
      "7.5",
      "1e3",
      "0x10",
      "abc",
      "7abc",
      null,
      undefined,
      {},
      [],
      1.5,
      NaN,
      Infinity,
      // A protobufjs Long, which `longs: Number` would produce.
      { low: 7, high: 0, unsigned: true },
      // Beyond Number.MAX_SAFE_INTEGER: silently lossy if coerced.
      "9007199254740993",
    ]) {
      expect(parseLndInteger(bad)).toBeUndefined();
    }
  });
});

describe("describeGrpcFailure", () => {
  it("redacts every 64-hex run except the allowed hash", () => {
    const other = "cd".repeat(32);
    const error = makeGrpcError(2, `failed for ${PAYMENT_HASH} and ${other}`);
    const described = describeGrpcFailure(error, PAYMENT_HASH);
    expect(described).toContain(PAYMENT_HASH);
    expect(described).not.toContain(other);
    expect(described).toContain("[redacted]");
  });

  it("redacts everything when no hash is allowed", () => {
    const error = makeGrpcError(2, `failed for ${PAYMENT_HASH}`);
    expect(describeGrpcFailure(error)).not.toContain(PAYMENT_HASH);
  });

  it("is case-insensitive about the allowed hash", () => {
    const error = makeGrpcError(2, `failed for ${PAYMENT_HASH.toUpperCase()}`);
    expect(describeGrpcFailure(error, PAYMENT_HASH)).toContain(
      PAYMENT_HASH.toUpperCase()
    );
  });

  it("never dereferences the error object beyond code and details", () => {
    // A preimage hidden on `cause` must not appear, which is why the message
    // is rebuilt rather than serialised.
    const error = makeGrpcError(2, "boom");
    (error as unknown as { cause: unknown }).cause = { preimage: PREIMAGE };
    expect(describeGrpcFailure(error, PAYMENT_HASH)).not.toContain(PREIMAGE);
  });

  it("handles non-Error values", () => {
    expect(describeGrpcFailure(undefined)).toBe("unknown error");
    expect(describeGrpcFailure({})).toBe("unknown error");
  });
});

/**
 * Fake `ClientReadableStream`. Records listeners so a test can deliver the
 * `data`/`error`/`end` events grpc-js would deliver, in whatever order it
 * wants to prove the handler survives.
 */
class FakeInvoiceStream {
  public cancelled = 0;
  private readonly listeners = new Map<
    string,
    Array<(arg?: unknown) => void>
  >();

  on(event: string, listener: (arg?: unknown) => void): void {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener);
    this.listeners.set(event, existing);
  }

  cancel(): void {
    this.cancelled += 1;
  }

  emit(event: "data" | "error" | "end", arg?: unknown): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      listener(arg);
    }
  }
}

class StreamingFakeClient extends FakeInvoicesClient {
  public readonly subscribeRequests: unknown[] = [];
  public readonly streams: FakeInvoiceStream[] = [];
  public throwOnSubscribe: Error | null = null;

  SubscribeSingleInvoice(request: unknown): LndInvoiceStream {
    this.subscribeRequests.push(request);
    if (this.throwOnSubscribe) throw this.throwOnSubscribe;
    const stream = new FakeInvoiceStream();
    this.streams.push(stream);
    return stream as unknown as LndInvoiceStream;
  }
}

/** Collects what a subscriber saw. */
function recordingHandlers() {
  const statuses: string[] = [];
  const errors: unknown[] = [];
  let closes = 0;
  return {
    statuses,
    errors,
    get closes() {
      return closes;
    },
    handlers: {
      onStatus: (status: string) => {
        statuses.push(status);
      },
      onError: (error: unknown) => {
        errors.push(error);
      },
      onClose: () => {
        closes += 1;
      },
    },
  };
}

describe("subscribeToInvoice", () => {
  it("subscribes on r_hash and reports the stream's first state", async () => {
    const client = new StreamingFakeClient();
    const recorder = recordingHandlers();

    const subscription = await providerWith(client).subscribeToInvoice(
      PAYMENT_HASH,
      recorder.handlers
    );

    // The proto field is r_hash here, unlike CancelInvoiceMsg's payment_hash.
    expect(client.subscribeRequests).toEqual([{ r_hash: hex(PAYMENT_HASH) }]);

    // LND replays the invoice's current state as the first message, which is
    // how a subscriber that was offline learns what it missed.
    client.streams[0]!.emit("data", invoiceResponse("ACCEPTED"));
    expect(recorder.statuses).toEqual(["accepted"]);
    expect(recorder.errors).toEqual([]);

    client.streams[0]!.emit("data", invoiceResponse("SETTLED"));
    expect(recorder.statuses).toEqual(["accepted", "settled"]);

    subscription.close();
  });

  it("maps CANCELED to cancelled, like lookupInvoice does", async () => {
    const client = new StreamingFakeClient();
    const recorder = recordingHandlers();

    await providerWith(client).subscribeToInvoice(
      PAYMENT_HASH,
      recorder.handlers
    );
    client.streams[0]!.emit("data", invoiceResponse("CANCELED"));

    expect(recorder.statuses).toEqual(["cancelled"]);
  });

  it("reports a message for a different invoice as an error, not a status", async () => {
    const client = new StreamingFakeClient();
    const recorder = recordingHandlers();

    await providerWith(client).subscribeToInvoice(
      PAYMENT_HASH,
      recorder.handlers
    );
    client.streams[0]!.emit(
      "data",
      invoiceResponse("SETTLED", { r_hash: hex("f".repeat(64)) })
    );

    expect(recorder.statuses).toEqual([]);
    expect(recorder.errors[0]).toBeInstanceOf(LndProviderError);
  });

  it("reports an unrecognised state as an error rather than guessing", async () => {
    const client = new StreamingFakeClient();
    const recorder = recordingHandlers();

    await providerWith(client).subscribeToInvoice(
      PAYMENT_HASH,
      recorder.handlers
    );
    client.streams[0]!.emit("data", invoiceResponse("WEDGED"));

    expect(recorder.statuses).toEqual([]);
    expect(recorder.errors[0]).toBeInstanceOf(LndProviderError);
  });

  it("routes a throwing subscriber back through onError", async () => {
    const client = new StreamingFakeClient();
    const errors: unknown[] = [];

    await providerWith(client).subscribeToInvoice(PAYMENT_HASH, {
      onStatus: () => {
        throw new Error("subscriber blew up");
      },
      onError: (error) => {
        errors.push(error);
      },
      onClose: () => {},
    });

    // Would otherwise escape into grpc-js's emitter as an uncaught exception.
    expect(() =>
      client.streams[0]!.emit("data", invoiceResponse("ACCEPTED"))
    ).not.toThrow();
    expect((errors[0] as Error).message).toBe("subscriber blew up");
  });

  it("translates and redacts a stream error", async () => {
    const client = new StreamingFakeClient();
    const recorder = recordingHandlers();

    await providerWith(client).subscribeToInvoice(
      PAYMENT_HASH,
      recorder.handlers
    );
    client.streams[0]!.emit(
      "error",
      makeGrpcError(14, `stream broken for ${PREIMAGE}`)
    );

    const error = recorder.errors[0] as LndProviderError;
    expect(error).toBeInstanceOf(LndProviderError);
    expect(error.message).not.toContain(PREIMAGE);
    expect(error.message).toContain("[redacted]");
  });

  it("reports a normal end through onClose", async () => {
    const client = new StreamingFakeClient();
    const recorder = recordingHandlers();

    await providerWith(client).subscribeToInvoice(
      PAYMENT_HASH,
      recorder.handlers
    );
    client.streams[0]!.emit("end");

    expect(recorder.closes).toBe(1);
  });

  it("cancels the stream on close and delivers nothing afterwards", async () => {
    const client = new StreamingFakeClient();
    const recorder = recordingHandlers();

    const subscription = await providerWith(client).subscribeToInvoice(
      PAYMENT_HASH,
      recorder.handlers
    );
    subscription.close();
    subscription.close();

    expect(client.streams[0]!.cancelled).toBe(1);

    // grpc-js raises CANCELLED in response to our own cancel(), and can
    // deliver a queued message after it. Neither may reach the subscriber.
    client.streams[0]!.emit("data", invoiceResponse("SETTLED"));
    client.streams[0]!.emit("error", makeGrpcError(1, "Cancelled on client"));
    client.streams[0]!.emit("end");

    expect(recorder.statuses).toEqual([]);
    expect(recorder.errors).toEqual([]);
    expect(recorder.closes).toBe(0);
  });

  it("rejects when the loaded client has no SubscribeSingleInvoice", async () => {
    // A client built from a proto set that omitted invoices.proto.
    const client = new FakeInvoicesClient();
    const recorder = recordingHandlers();

    await expect(
      providerWith(client).subscribeToInvoice(PAYMENT_HASH, recorder.handlers)
    ).rejects.toBeInstanceOf(LndProviderError);
  });

  it("rejects when the stream cannot be opened at all", async () => {
    const client = new StreamingFakeClient();
    client.throwOnSubscribe = makeGrpcError(14, "no connection established");
    const recorder = recordingHandlers();

    await expect(
      providerWith(client).subscribeToInvoice(PAYMENT_HASH, recorder.handlers)
    ).rejects.toBeInstanceOf(LndProviderError);
    // Nothing was subscribed, so the failure belongs to the caller's await,
    // not to onError.
    expect(recorder.errors).toEqual([]);
  });
});
