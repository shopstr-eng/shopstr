/**
 * Provider-agnostic contract for BOLT-11 hold (HODL) invoices.
 *
 * A hold invoice locks the payer's HTLC without settling it: the payment sits
 * in `accepted` until someone reveals the preimage (`settleInvoice`) or the
 * HTLC is released back to the payer (`cancelInvoice`). That "paid but not
 * yet claimed" window is what makes hold invoices usable as escrow.
 *
 * NOTE: no real Lightning backend implements this yet. Which node/service
 * backs it (LND, CLN, LNbits, …) is still an open decision; this interface
 * exists so that choice can be made later and dropped in behind the same
 * four methods with no changes elsewhere. The only implementation today is
 * {@link file://./mock-hodl-invoice-provider.ts}, for local dev and tests.
 */

/**
 * Lifecycle of a hold invoice.
 *
 * - `open`      — created, no HTLC locked yet (payer has not paid).
 * - `accepted`  — payer's HTLC is locked and held; funds are committed but
 *                 not yet claimable by the payee.
 * - `settled`   — preimage revealed, funds released to the payee. Terminal.
 * - `cancelled` — HTLC released, funds returned to the payer. Terminal.
 */
export type HodlInvoiceStatus = "open" | "accepted" | "settled" | "cancelled";

export type HodlInvoiceErrorCode =
  /** No invoice exists for the given payment hash. */
  | "invoice_not_found"
  /** An invoice already exists for the given payment hash. */
  | "duplicate_payment_hash"
  /** The requested transition is not legal from the invoice's current state. */
  | "invalid_state_transition"
  /** Preimage is not 32 bytes of hex. */
  | "invalid_preimage"
  /** Payment hash is not 32 bytes of hex. */
  | "invalid_payment_hash"
  /** Amount is not a positive integer number of satoshis. */
  | "invalid_amount";

/**
 * Error type every {@link HodlInvoiceProvider} implementation throws, so
 * callers can branch on `code` without knowing which backend is installed.
 */
export class HodlInvoiceError extends Error {
  public readonly code: HodlInvoiceErrorCode;
  public readonly cause?: unknown;

  constructor(code: HodlInvoiceErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "HodlInvoiceError";
    this.code = code;
    this.cause = cause;
  }
}

export function isHodlInvoiceError(
  err: unknown,
  code?: HodlInvoiceErrorCode
): err is HodlInvoiceError {
  if (!(err instanceof HodlInvoiceError)) return false;
  return code === undefined || err.code === code;
}

export interface CreateHoldInvoiceParams {
  /** Invoice amount in satoshis. Must be a positive integer. */
  amountSats: number;
  /**
   * Payment hash to lock the invoice to, as 32 bytes of lowercase hex.
   *
   * The caller — not the provider — picks the preimage and derives this via
   * {@link file://./payment-hash.ts}, so the caller retains the only copy of
   * the secret that can settle the invoice.
   */
  paymentHash: string;
  /** Optional BOLT-11 description. */
  memo?: string;
  /** Invoice lifetime in seconds. Implementations supply their own default. */
  expirySeconds?: number;
}

export interface CreateHoldInvoiceResult {
  /** BOLT-11 payment request to hand to the payer. */
  invoice: string;
  /** Echoed back so callers can key off a single object. */
  paymentHash: string;
}

export interface LookupInvoiceResult {
  status: HodlInvoiceStatus;
  /**
   * Preimage, once revealed by settlement. Absent in every non-`settled`
   * state — this is the field that proves a settle actually happened.
   */
  preimage?: string;
}

/**
 * The four operations any hold-invoice backend must provide.
 *
 * Authorization is deliberately NOT part of this contract. `settleInvoice`
 * and `cancelInvoice` take only the secret/hash they act on and perform no
 * identity checks; deciding *who* is allowed to settle or cancel a given
 * order belongs in a separate layer above this one.
 */
export interface HodlInvoiceProvider {
  /**
   * Create an invoice locked to `paymentHash`, in the `open` state. Nothing
   * is held until the payer pays it.
   */
  createHoldInvoice(
    params: CreateHoldInvoiceParams
  ): Promise<CreateHoldInvoiceResult>;

  /** Current state of the invoice. Throws `invoice_not_found` if unknown. */
  lookupInvoice(paymentHash: string): Promise<LookupInvoiceResult>;

  /**
   * Reveal `preimage` to settle the held HTLC, releasing funds to the seller.
   * The provider derives the payment hash from the preimage, so possession of
   * the preimage is the only thing this call requires.
   *
   * Idempotent when the invoice is already `settled`. Throws
   * `invalid_state_transition` from any other non-`accepted` state.
   */
  settleInvoice(preimage: string): Promise<void>;

  /**
   * Cancel the HTLC, returning funds to the buyer. Legal from both `open`
   * (never paid) and `accepted` (paid and held).
   *
   * Idempotent when the invoice is already `cancelled`. A `settled` invoice
   * cannot be cancelled — the funds are already gone.
   */
  cancelInvoice(paymentHash: string): Promise<void>;
}
