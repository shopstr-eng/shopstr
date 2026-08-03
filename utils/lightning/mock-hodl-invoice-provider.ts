import {
  CreateHoldInvoiceParams,
  CreateHoldInvoiceResult,
  HodlInvoiceError,
  HodlInvoiceProvider,
  HodlInvoiceStatus,
  LookupInvoiceResult,
} from "./hodl-invoice-provider";
import { normalizePaymentHash, paymentHashFromPreimage } from "./payment-hash";

const DEFAULT_EXPIRY_SECONDS = 3600;

/**
 * Deliberately not a decodable BOLT-11 string. A real invoice can only come
 * from a node that actually holds the funds, so the mock emits something a
 * wallet will visibly reject rather than a plausible-looking fake.
 */
const MOCK_INVOICE_PREFIX = "lnmock1";

export interface MockInvoiceRecord {
  paymentHash: string;
  amountSats: number;
  invoice: string;
  memo?: string;
  status: HodlInvoiceStatus;
  createdAt: number;
  expiresAt: number;
  /** Populated only once the invoice settles. */
  preimage?: string;
}

/**
 * In-memory {@link HodlInvoiceProvider} for local dev and tests.
 *
 * Tracks invoice state in a Map keyed by payment hash. Nothing is persisted
 * and no funds move — the point is to exercise the state machine
 * (`open → accepted → settled`, `open|accepted → cancelled`) that a real
 * backend will have to honour.
 *
 * Like the interface it implements, this performs no identity checks:
 * anyone holding the preimage can settle, anyone holding the payment hash
 * can cancel. Authorization lives in a layer above.
 */
export class MockHodlInvoiceProvider implements HodlInvoiceProvider {
  private readonly invoices = new Map<string, MockInvoiceRecord>();

  async createHoldInvoice(
    params: CreateHoldInvoiceParams
  ): Promise<CreateHoldInvoiceResult> {
    const { amountSats, memo, expirySeconds } = params;
    const paymentHash = normalizePaymentHash(params.paymentHash);

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
    if (this.invoices.has(paymentHash)) {
      throw new HodlInvoiceError(
        "duplicate_payment_hash",
        `An invoice already exists for payment hash ${paymentHash}`
      );
    }

    const now = Date.now();
    const ttl = expirySeconds ?? DEFAULT_EXPIRY_SECONDS;
    const record: MockInvoiceRecord = {
      paymentHash,
      amountSats,
      invoice: `${MOCK_INVOICE_PREFIX}${amountSats}${paymentHash}`,
      status: "open",
      createdAt: now,
      expiresAt: now + ttl * 1000,
      ...(memo === undefined ? {} : { memo }),
    };
    this.invoices.set(paymentHash, record);

    return { invoice: record.invoice, paymentHash };
  }

  async lookupInvoice(paymentHash: string): Promise<LookupInvoiceResult> {
    const record = this.require(normalizePaymentHash(paymentHash));
    return {
      status: record.status,
      ...(record.preimage === undefined ? {} : { preimage: record.preimage }),
    };
  }

  async settleInvoice(preimage: string): Promise<void> {
    // Deriving the hash from the preimage is what proves the caller holds the
    // secret — there is no separate check, and no way to settle without it.
    const paymentHash = paymentHashFromPreimage(preimage);
    const record = this.require(paymentHash);

    if (record.status === "settled") return; // idempotent
    if (record.status !== "accepted") {
      throw new HodlInvoiceError(
        "invalid_state_transition",
        `Cannot settle an invoice in state "${record.status}"; ` +
          `only an accepted (held) HTLC can be settled`
      );
    }

    record.status = "settled";
    record.preimage = preimage.toLowerCase();
  }

  async cancelInvoice(paymentHash: string): Promise<void> {
    const record = this.require(normalizePaymentHash(paymentHash));

    if (record.status === "cancelled") return; // idempotent
    if (record.status === "settled") {
      throw new HodlInvoiceError(
        "invalid_state_transition",
        "Cannot cancel a settled invoice; the funds have already been released"
      );
    }

    record.status = "cancelled";
  }

  // ---------------------------------------------------------------------
  // Test-only affordances. Not part of HodlInvoiceProvider — a real backend
  // gets these transitions from the network, not from an API call.
  // ---------------------------------------------------------------------

  /**
   * Simulate the buyer paying the invoice, locking the HTLC (`open` →
   * `accepted`). Idempotent once accepted.
   */
  simulatePayment(paymentHash: string): void {
    const record = this.require(normalizePaymentHash(paymentHash));

    if (record.status === "accepted") return; // idempotent
    if (record.status !== "open") {
      throw new HodlInvoiceError(
        "invalid_state_transition",
        `Cannot accept payment for an invoice in state "${record.status}"`
      );
    }

    record.status = "accepted";
  }

  /** Snapshot of the stored record, for assertions. */
  getRecord(paymentHash: string): MockInvoiceRecord | undefined {
    const record = this.invoices.get(normalizePaymentHash(paymentHash));
    return record ? { ...record } : undefined;
  }

  /** Drop all invoices, so tests can share one provider instance. */
  reset(): void {
    this.invoices.clear();
  }

  private require(paymentHash: string): MockInvoiceRecord {
    const record = this.invoices.get(paymentHash);
    if (!record) {
      throw new HodlInvoiceError(
        "invoice_not_found",
        `No invoice found for payment hash ${paymentHash}`
      );
    }
    return record;
  }
}
