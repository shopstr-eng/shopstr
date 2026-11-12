import type { Proof } from "@cashu/cashu-ts";

const STORAGE_KEY = "shopstr.pendingSellerLightningPayouts";

export type PendingSellerLightningPayout = {
  orderId: string;
  mintUrl: string;
  sellerPubkey: string;
  /**
   * Buyer identity that created the record. Optional only because records
   * written before this field existed lack it; resolution must never restore
   * a bound record's proofs while a different account is signed in.
   */
  buyerPubkey?: string;
  lnurl: string;
  sellerAmount: number;
  /**
   * Order context captured at checkout so that when a delayed payout later
   * confirms, the seller can be sent the same payment-confirmation DM the
   * normal checkout path would have sent. Optional only because records
   * written before this field existed lack it; those fall back to a generic
   * confirmation message.
   */
  productTitle?: string;
  productDetails?: string;
  quantity?: number;
  /** NIP-33 address (`30402:<pubkey>:<d>`) of the purchased listing. */
  productAddress?: string;
  address?: string;
  pickup?: string;
  donationAmount?: number;
  donationPercentage?: number;
  status: "pending" | "unknown";
  /**
   * Set once the seller payment-confirmation DM was sent during resolution.
   * The resolver notifies BEFORE clearing the record so a notification
   * failure can be retried; this flag makes the opposite failure (DM sent,
   * record removal failed) safe to retry without re-sending the DM.
   */
  notifiedAt?: number;
  /**
   * Set once the buyer's order-receipt DM was sent during resolution.
   * Tracked separately from notifiedAt: the seller DM is stamped as soon as
   * it succeeds, so a retry after a failed record removal would otherwise
   * skip a buyer receipt that failed on the first attempt. With this flag a
   * retry re-sends only the receipt, and a receipt that already succeeded is
   * never sent twice.
   */
  receiptSentAt?: number;
  meltQuoteId: string;
  recoverableProofs: Proof[];
  quarantinedProofs: Proof[];
  errorMessage: string;
  createdAt: number;
  updatedAt: number;
};

type PendingSellerLightningPayoutInput = Omit<
  PendingSellerLightningPayout,
  "createdAt" | "updatedAt" | "buyerPubkey"
> & {
  /**
   * Required for every new record — the resolver refuses records it cannot
   * bind to the signed-in buyer. Only records written before account
   * binding existed lack it, and those are never resolved through the UI.
   */
  buyerPubkey: string;
};

export function getPendingSellerLightningPayouts(): PendingSellerLightningPayout[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordPendingSellerLightningPayout(
  input: PendingSellerLightningPayoutInput
): PendingSellerLightningPayout {
  if (!input.buyerPubkey) {
    throw new Error(
      "Refusing to record a pending seller payout without a buyer identity."
    );
  }
  const existing = getPendingSellerLightningPayouts();
  const previous = existing.find(
    (record) => record.meltQuoteId === input.meltQuoteId
  );
  const now = Date.now();
  const record: PendingSellerLightningPayout = {
    ...input,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
  const next = [
    ...existing.filter((item) => item.meltQuoteId !== input.meltQuoteId),
    record,
  ];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    throw new UnresolvedSellerLightningPayoutError(
      record,
      `Seller Lightning payout is ${record.status}, but its recovery record could not be saved. Do not retry this order.`
    );
  }
  return record;
}

/**
 * Record that the seller notification for this payout was sent. Throws on
 * storage failure just like the other mutators — callers decide whether the
 * payout can still proceed (a failed mark plus a failed removal means the
 * retry re-sends the DM, which is the accepted at-least-once fallback).
 */
export function markPendingSellerLightningPayoutNotified(
  meltQuoteId: string
): void {
  if (typeof window === "undefined") return;

  const now = Date.now();
  const next = getPendingSellerLightningPayouts().map((record) =>
    record.meltQuoteId === meltQuoteId
      ? { ...record, notifiedAt: now, updatedAt: now }
      : record
  );
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/**
 * Record that the buyer's order-receipt DM for this payout was sent. Throws
 * on storage failure just like the other mutators — callers treat it as
 * best-effort (a failed mark plus a failed removal means the retry re-sends
 * the receipt, the accepted at-least-once fallback).
 */
export function markPendingSellerLightningPayoutReceiptSent(
  meltQuoteId: string
): void {
  if (typeof window === "undefined") return;

  const now = Date.now();
  const next = getPendingSellerLightningPayouts().map((record) =>
    record.meltQuoteId === meltQuoteId
      ? { ...record, receiptSentAt: now, updatedAt: now }
      : record
  );
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function removePendingSellerLightningPayout(meltQuoteId: string): void {
  if (typeof window === "undefined") return;

  const remaining = getPendingSellerLightningPayouts().filter(
    (record) => record.meltQuoteId !== meltQuoteId
  );
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
}

export class UnresolvedSellerLightningPayoutError extends Error {
  readonly payout: PendingSellerLightningPayout;
  readonly recoverableProofs: Proof[];

  constructor(payout: PendingSellerLightningPayout, message?: string) {
    super(
      message ??
        `Seller Lightning payout is ${payout.status}. Do not retry this order until the mint confirms the payout.`
    );
    this.name = "UnresolvedSellerLightningPayoutError";
    this.payout = payout;
    this.recoverableProofs = payout.recoverableProofs;
  }
}

export function isUnresolvedSellerLightningPayoutError(
  error: unknown
): error is UnresolvedSellerLightningPayoutError {
  return error instanceof UnresolvedSellerLightningPayoutError;
}
