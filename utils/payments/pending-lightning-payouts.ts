import type { Proof } from "@cashu/cashu-ts";

const STORAGE_KEY = "shopstr.pendingSellerLightningPayouts";

export type PendingSellerLightningPayout = {
  orderId: string;
  mintUrl: string;
  sellerPubkey: string;
  lnurl: string;
  sellerAmount: number;
  status: "pending" | "unknown";
  meltQuoteId: string;
  recoverableProofs: Proof[];
  quarantinedProofs: Proof[];
  errorMessage: string;
  createdAt: number;
  updatedAt: number;
};

type PendingSellerLightningPayoutInput = Omit<
  PendingSellerLightningPayout,
  "createdAt" | "updatedAt"
>;

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
