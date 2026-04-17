import { Wallet as CashuWallet, Proof } from "@cashu/cashu-ts";
import { withMintRetry } from "./mint-retry-service";

const STORAGE_KEY = "milkmarket.pendingMintQuotes";

export type PendingMintQuoteStatus =
  | "awaiting_payment"
  | "paid_unclaimed"
  | "claimed"
  | "failed_terminal";

export interface PendingMintQuote {
  quoteId: string;
  mintUrl: string;
  amount: number;
  invoice: string;
  createdAt: number;
  lastAttemptAt?: number;
  attempts: number;
  status: PendingMintQuoteStatus;
  lastErrorMessage?: string;
}

/**
 * Mints typically retain quote state for ~24 h. After this much wall-clock
 * time we stop trying to recover and mark the quote terminally lost.
 */
export const PAID_UNCLAIMED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function readAll(): PendingMintQuote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(quotes: PendingMintQuote[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(quotes));
}

export interface RecordPendingMintQuoteInput {
  quoteId: string;
  mintUrl: string;
  amount: number;
  invoice: string;
  status?: PendingMintQuoteStatus;
}

export function recordPendingMintQuote(
  input: RecordPendingMintQuoteInput
): PendingMintQuote {
  const quotes = readAll();
  const existingIdx = quotes.findIndex((q) => q.quoteId === input.quoteId);
  const now = Date.now();
  const next: PendingMintQuote = {
    quoteId: input.quoteId,
    mintUrl: input.mintUrl,
    amount: input.amount,
    invoice: input.invoice,
    createdAt: existingIdx >= 0 ? quotes[existingIdx]!.createdAt : now,
    attempts: existingIdx >= 0 ? quotes[existingIdx]!.attempts : 0,
    status: input.status ?? "awaiting_payment",
  };
  if (existingIdx >= 0) {
    quotes[existingIdx] = { ...quotes[existingIdx]!, ...next };
  } else {
    quotes.push(next);
  }
  writeAll(quotes);
  return next;
}

export function updatePendingMintQuote(
  quoteId: string,
  patch: Partial<PendingMintQuote>
): PendingMintQuote | undefined {
  const quotes = readAll();
  const idx = quotes.findIndex((q) => q.quoteId === quoteId);
  if (idx < 0) return undefined;
  const merged = { ...quotes[idx]!, ...patch };
  quotes[idx] = merged;
  writeAll(quotes);
  return merged;
}

export function markMintQuotePaid(quoteId: string): void {
  updatePendingMintQuote(quoteId, { status: "paid_unclaimed" });
}

export function removePendingMintQuote(quoteId: string): void {
  const quotes = readAll().filter((q) => q.quoteId !== quoteId);
  writeAll(quotes);
}

export function markMintQuoteClaimed(quoteId: string): void {
  removePendingMintQuote(quoteId);
}

export function getPendingMintQuotes(filter?: {
  status?: PendingMintQuoteStatus;
  mintUrl?: string;
}): PendingMintQuote[] {
  let quotes = readAll();
  if (filter?.status) quotes = quotes.filter((q) => q.status === filter.status);
  if (filter?.mintUrl)
    quotes = quotes.filter((q) => q.mintUrl === filter.mintUrl);
  return quotes;
}

export interface RecoveryDeps {
  /**
   * Build a `loadMint`-ready CashuWallet bound to the given mint URL.
   * Caller is responsible for the v3+ `await wallet.loadMint()` call.
   */
  buildWallet: (mintUrl: string) => Promise<CashuWallet>;
  /**
   * Persist newly-recovered proofs (typically: append to local tokens,
   * publish a kind-7375 wallet event). Throwing aborts the recovery so the
   * pending record is preserved for the next attempt.
   */
  onProofsClaimed: (quote: PendingMintQuote, proofs: Proof[]) => Promise<void>;
  /** Optional structured logger; defaults to console. */
  logger?: Pick<Console, "warn" | "error" | "info">;
}

export interface RecoveryResult {
  total: number;
  recovered: number;
  failed: number;
  stillPending: number;
  abandoned: number;
}

/**
 * Walk every pending mint quote in localStorage and attempt to advance it to
 * a terminal state (claimed, abandoned, or still-pending-but-unpaid).
 *
 * Safe to invoke on every app boot; uses the mint as the source of truth.
 */
export async function recoverPendingMintQuotes(
  deps: RecoveryDeps
): Promise<RecoveryResult> {
  const log = deps.logger ?? console;
  const result: RecoveryResult = {
    total: 0,
    recovered: 0,
    failed: 0,
    stillPending: 0,
    abandoned: 0,
  };
  const all = getPendingMintQuotes();
  result.total = all.length;
  if (all.length === 0) return result;

  for (const quote of all) {
    if (quote.status === "claimed" || quote.status === "failed_terminal") {
      continue;
    }
    if (Date.now() - quote.createdAt > PAID_UNCLAIMED_MAX_AGE_MS) {
      updatePendingMintQuote(quote.quoteId, {
        status: "failed_terminal",
        lastErrorMessage: "Pending quote exceeded maximum recovery age",
      });
      result.abandoned++;
      continue;
    }

    try {
      const wallet = await deps.buildWallet(quote.mintUrl);
      const state = await withMintRetry(
        () => wallet.checkMintQuoteBolt11(quote.quoteId),
        { maxAttempts: 3, perAttemptTimeoutMs: 10000, totalTimeoutMs: 45000 }
      );

      if (state.state === "UNPAID") {
        result.stillPending++;
        continue;
      }

      if (state.state === "ISSUED" && quote.status !== "paid_unclaimed") {
        // Mint already issued these proofs and we never marked them locally,
        // but we also have no record of needing to claim. Most likely a
        // duplicate record from another device — drop it.
        removePendingMintQuote(quote.quoteId);
        continue;
      }

      try {
        const proofs = await withMintRetry(
          () => wallet.mintProofsBolt11(quote.amount, quote.quoteId),
          { maxAttempts: 4, perAttemptTimeoutMs: 15000, totalTimeoutMs: 90000 }
        );
        if (proofs && proofs.length > 0) {
          await deps.onProofsClaimed(quote, proofs);
          markMintQuoteClaimed(quote.quoteId);
          result.recovered++;
        } else {
          updatePendingMintQuote(quote.quoteId, {
            attempts: quote.attempts + 1,
            lastAttemptAt: Date.now(),
            lastErrorMessage: "Mint returned empty proofs",
          });
          result.failed++;
        }
      } catch (mintError) {
        const message =
          mintError instanceof Error ? mintError.message : String(mintError);
        if (
          message.toLowerCase().includes("issued") ||
          message.toLowerCase().includes("already")
        ) {
          updatePendingMintQuote(quote.quoteId, {
            status: "failed_terminal",
            lastErrorMessage:
              "Mint reports quote already issued; proofs not recoverable client-side",
          });
          result.abandoned++;
          log.warn(
            `[mint-recovery] quote ${quote.quoteId} terminally lost: ${message}`
          );
        } else {
          updatePendingMintQuote(quote.quoteId, {
            attempts: quote.attempts + 1,
            lastAttemptAt: Date.now(),
            lastErrorMessage: message,
          });
          result.failed++;
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      updatePendingMintQuote(quote.quoteId, {
        attempts: quote.attempts + 1,
        lastAttemptAt: Date.now(),
        lastErrorMessage: message,
      });
      result.failed++;
      log.warn(
        `[mint-recovery] quote ${quote.quoteId} attempt failed: ${message}`
      );
    }
  }

  return result;
}
