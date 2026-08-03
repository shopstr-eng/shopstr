import {
  HodlInvoiceError,
  isHodlInvoiceError,
} from "@/utils/lightning/hodl-invoice-provider";
import { MockHodlInvoiceProvider } from "@/utils/lightning/mock-hodl-invoice-provider";
import { paymentHashFromPreimage } from "@/utils/lightning/payment-hash";

const PREIMAGE = "11".repeat(32);
const PAYMENT_HASH = paymentHashFromPreimage(PREIMAGE);

const OTHER_PREIMAGE = "22".repeat(32);
const OTHER_PAYMENT_HASH = paymentHashFromPreimage(OTHER_PREIMAGE);

let provider: MockHodlInvoiceProvider;

beforeEach(() => {
  provider = new MockHodlInvoiceProvider();
});

async function createOpenInvoice(paymentHash = PAYMENT_HASH) {
  return provider.createHoldInvoice({ amountSats: 1000, paymentHash });
}

/** Asserts the thrown value is a HodlInvoiceError carrying `code`. */
async function expectCode(op: Promise<unknown>, code: string) {
  await expect(op).rejects.toBeInstanceOf(HodlInvoiceError);
  await op.catch((err) => {
    expect((err as HodlInvoiceError).code).toBe(code);
  });
}

describe("createHoldInvoice", () => {
  it("creates an invoice in the open state", async () => {
    const result = await createOpenInvoice();
    expect(result.paymentHash).toBe(PAYMENT_HASH);
    expect(result.invoice).toContain(PAYMENT_HASH);
    expect((await provider.lookupInvoice(PAYMENT_HASH)).status).toBe("open");
  });

  it("stores memo and expiry metadata", async () => {
    await provider.createHoldInvoice({
      amountSats: 21,
      paymentHash: PAYMENT_HASH,
      memo: "order #1",
      expirySeconds: 60,
    });
    const record = provider.getRecord(PAYMENT_HASH)!;
    expect(record.memo).toBe("order #1");
    expect(record.amountSats).toBe(21);
    expect(record.expiresAt - record.createdAt).toBe(60_000);
  });

  it("applies a default expiry when none is given", async () => {
    await createOpenInvoice();
    const record = provider.getRecord(PAYMENT_HASH)!;
    expect(record.expiresAt).toBeGreaterThan(record.createdAt);
  });

  it("does not expose a preimage before settlement", async () => {
    await createOpenInvoice();
    expect(
      (await provider.lookupInvoice(PAYMENT_HASH)).preimage
    ).toBeUndefined();
  });

  it("rejects a duplicate payment hash", async () => {
    await createOpenInvoice();
    await expectCode(createOpenInvoice(), "duplicate_payment_hash");
  });

  it.each([
    ["zero", 0],
    ["negative", -5],
    ["fractional", 10.5],
    ["NaN", Number.NaN],
  ])("rejects a %s amount", async (_label, amountSats) => {
    await expectCode(
      provider.createHoldInvoice({ amountSats, paymentHash: PAYMENT_HASH }),
      "invalid_amount"
    );
  });

  it("rejects a non-positive expiry", async () => {
    await expectCode(
      provider.createHoldInvoice({
        amountSats: 100,
        paymentHash: PAYMENT_HASH,
        expirySeconds: 0,
      }),
      "invalid_amount"
    );
  });

  it("rejects a malformed payment hash", async () => {
    await expectCode(
      provider.createHoldInvoice({ amountSats: 100, paymentHash: "beef" }),
      "invalid_payment_hash"
    );
  });

  it("treats payment hashes case-insensitively", async () => {
    await createOpenInvoice();
    expect(
      (await provider.lookupInvoice(PAYMENT_HASH.toUpperCase())).status
    ).toBe("open");
  });
});

describe("lookupInvoice", () => {
  it("throws invoice_not_found for an unknown hash", async () => {
    await expectCode(
      provider.lookupInvoice(OTHER_PAYMENT_HASH),
      "invoice_not_found"
    );
  });
});

describe("valid state transitions", () => {
  it("walks open -> accepted -> settled", async () => {
    await createOpenInvoice();
    expect((await provider.lookupInvoice(PAYMENT_HASH)).status).toBe("open");

    provider.simulatePayment(PAYMENT_HASH);
    expect((await provider.lookupInvoice(PAYMENT_HASH)).status).toBe(
      "accepted"
    );

    await provider.settleInvoice(PREIMAGE);
    const settled = await provider.lookupInvoice(PAYMENT_HASH);
    expect(settled.status).toBe("settled");
    expect(settled.preimage).toBe(PREIMAGE);
  });

  it("cancels from open (never paid)", async () => {
    await createOpenInvoice();
    await provider.cancelInvoice(PAYMENT_HASH);
    expect((await provider.lookupInvoice(PAYMENT_HASH)).status).toBe(
      "cancelled"
    );
  });

  it("cancels from accepted (paid and held)", async () => {
    await createOpenInvoice();
    provider.simulatePayment(PAYMENT_HASH);
    await provider.cancelInvoice(PAYMENT_HASH);
    expect((await provider.lookupInvoice(PAYMENT_HASH)).status).toBe(
      "cancelled"
    );
  });

  it("keeps invoices isolated from one another", async () => {
    await createOpenInvoice();
    await createOpenInvoice(OTHER_PAYMENT_HASH);

    provider.simulatePayment(PAYMENT_HASH);
    await provider.settleInvoice(PREIMAGE);

    expect((await provider.lookupInvoice(PAYMENT_HASH)).status).toBe("settled");
    expect((await provider.lookupInvoice(OTHER_PAYMENT_HASH)).status).toBe(
      "open"
    );
  });
});

describe("idempotency on terminal states", () => {
  it("settling an already-settled invoice is a no-op", async () => {
    await createOpenInvoice();
    provider.simulatePayment(PAYMENT_HASH);
    await provider.settleInvoice(PREIMAGE);

    await expect(provider.settleInvoice(PREIMAGE)).resolves.toBeUndefined();
    expect((await provider.lookupInvoice(PAYMENT_HASH)).status).toBe("settled");
  });

  it("cancelling an already-cancelled invoice is a no-op", async () => {
    await createOpenInvoice();
    await provider.cancelInvoice(PAYMENT_HASH);

    await expect(provider.cancelInvoice(PAYMENT_HASH)).resolves.toBeUndefined();
    expect((await provider.lookupInvoice(PAYMENT_HASH)).status).toBe(
      "cancelled"
    );
  });

  it("accepting an already-accepted invoice is a no-op", async () => {
    await createOpenInvoice();
    provider.simulatePayment(PAYMENT_HASH);
    expect(() => provider.simulatePayment(PAYMENT_HASH)).not.toThrow();
    expect((await provider.lookupInvoice(PAYMENT_HASH)).status).toBe(
      "accepted"
    );
  });
});

describe("invalid state transitions", () => {
  it("cannot settle an open invoice (no HTLC is held yet)", async () => {
    await createOpenInvoice();
    await expectCode(
      provider.settleInvoice(PREIMAGE),
      "invalid_state_transition"
    );
    expect((await provider.lookupInvoice(PAYMENT_HASH)).status).toBe("open");
  });

  it("cannot settle a cancelled invoice", async () => {
    await createOpenInvoice();
    provider.simulatePayment(PAYMENT_HASH);
    await provider.cancelInvoice(PAYMENT_HASH);

    await expectCode(
      provider.settleInvoice(PREIMAGE),
      "invalid_state_transition"
    );
    expect((await provider.lookupInvoice(PAYMENT_HASH)).status).toBe(
      "cancelled"
    );
  });

  it("cannot cancel a settled invoice", async () => {
    await createOpenInvoice();
    provider.simulatePayment(PAYMENT_HASH);
    await provider.settleInvoice(PREIMAGE);

    await expectCode(
      provider.cancelInvoice(PAYMENT_HASH),
      "invalid_state_transition"
    );
    expect((await provider.lookupInvoice(PAYMENT_HASH)).status).toBe("settled");
  });

  it("cannot accept a cancelled invoice", async () => {
    await createOpenInvoice();
    await provider.cancelInvoice(PAYMENT_HASH);
    expect(() => provider.simulatePayment(PAYMENT_HASH)).toThrow(
      HodlInvoiceError
    );
  });

  it("cannot accept a settled invoice", async () => {
    await createOpenInvoice();
    provider.simulatePayment(PAYMENT_HASH);
    await provider.settleInvoice(PREIMAGE);
    expect(() => provider.simulatePayment(PAYMENT_HASH)).toThrow(
      HodlInvoiceError
    );
  });
});

describe("settleInvoice preimage handling", () => {
  it("a preimage for a different invoice does not settle this one", async () => {
    await createOpenInvoice();
    provider.simulatePayment(PAYMENT_HASH);

    await expectCode(
      provider.settleInvoice(OTHER_PREIMAGE),
      "invoice_not_found"
    );
    expect((await provider.lookupInvoice(PAYMENT_HASH)).status).toBe(
      "accepted"
    );
  });

  it("rejects a malformed preimage before touching state", async () => {
    await createOpenInvoice();
    provider.simulatePayment(PAYMENT_HASH);

    await expectCode(provider.settleInvoice("not-hex"), "invalid_preimage");
    expect((await provider.lookupInvoice(PAYMENT_HASH)).status).toBe(
      "accepted"
    );
  });

  it("accepts an uppercase preimage and stores it lowercased", async () => {
    await createOpenInvoice();
    provider.simulatePayment(PAYMENT_HASH);
    await provider.settleInvoice(PREIMAGE.toUpperCase());
    expect((await provider.lookupInvoice(PAYMENT_HASH)).preimage).toBe(
      PREIMAGE
    );
  });

  it("throws invoice_not_found when no invoice matches the preimage", async () => {
    await expectCode(provider.settleInvoice(PREIMAGE), "invoice_not_found");
  });
});

describe("provider hygiene", () => {
  it("cancelInvoice on an unknown hash throws invoice_not_found", async () => {
    await expectCode(provider.cancelInvoice(PAYMENT_HASH), "invoice_not_found");
  });

  it("reset clears all tracked invoices", async () => {
    await createOpenInvoice();
    provider.reset();
    expect(provider.getRecord(PAYMENT_HASH)).toBeUndefined();
    await expectCode(provider.lookupInvoice(PAYMENT_HASH), "invoice_not_found");
  });

  it("getRecord returns a copy, so callers cannot mutate provider state", async () => {
    await createOpenInvoice();
    const record = provider.getRecord(PAYMENT_HASH)!;
    record.status = "settled";
    expect((await provider.lookupInvoice(PAYMENT_HASH)).status).toBe("open");
  });

  it("isHodlInvoiceError narrows by code", async () => {
    await createOpenInvoice();
    try {
      await createOpenInvoice();
      throw new Error("expected a duplicate_payment_hash error");
    } catch (err) {
      expect(isHodlInvoiceError(err, "duplicate_payment_hash")).toBe(true);
      expect(isHodlInvoiceError(err, "invoice_not_found")).toBe(false);
      expect(isHodlInvoiceError(new Error("plain"))).toBe(false);
    }
  });
});
