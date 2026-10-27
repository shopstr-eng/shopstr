import { Mint as CashuMint, Wallet as CashuWallet, Proof } from "@cashu/cashu-ts";
import { recoverProofsToBuyerWallet } from "@/utils/cashu/wallet-recovery";
import { sumProofAmounts } from "@/utils/cashu/proof-amount";
import { storage, STORAGE_KEYS } from "@/utils/storage";
import {
  PendingSellerLightningPayout,
  markPendingSellerLightningPayoutNotified,
  markPendingSellerLightningPayoutReceiptSent,
  removePendingSellerLightningPayout,
} from "./pending-lightning-payouts";

type Nostr = Parameters<typeof recoverProofsToBuyerWallet>[0];
type Signer = Parameters<typeof recoverProofsToBuyerWallet>[1];

export type PendingPayoutResolution =
  | {
      status: "completed";
      /**
       * Set when the seller was notified but the buyer's order-receipt DM
       * failed. The receipt is best-effort: the payout is done and the
       * record is cleared either way, so this only surfaces the failure.
       */
      receiptError?: string;
    }
  | { status: "recovered"; recoveredAmount: number }
  | { status: "still-pending"; reason: string }
  | { status: "needs-attention"; reason: string }
  | { status: "notify-failed"; reason: string }
  | { status: "not-owner" }
  | { status: "unknown"; reason: string };

export interface ResolvePendingPayoutOptions {
  timeoutMs?: number;
  /**
   * Invoked in the PAID branch after the buyer's remaining proofs are safe
   * but BEFORE the record is cleared, so a failed seller notification keeps
   * the record and can be retried. Once it succeeds the record is stamped
   * with notifiedAt, so a retry after a failed record removal skips this
   * callback instead of sending the seller a duplicate DM.
   */
  notifySeller?: (
    record: PendingSellerLightningPayout
  ) => Promise<void>;
  /**
   * Invoked in the PAID branch after the seller notification succeeds, to
   * send the buyer the order-receipt DM the normal checkout path sends.
   * Unlike notifySeller, a failure here never keeps the pending record —
   * the seller DM is the critical one, so a receipt failure is reported on
   * the "completed" result instead of blocking resolution. Once it succeeds
   * the record is stamped with receiptSentAt, so a retry after a failed
   * record removal re-sends only a receipt that previously failed and never
   * sends one twice.
   */
  notifyBuyer?: (
    record: PendingSellerLightningPayout
  ) => Promise<void>;
}

const DEFAULT_MINT_TIMEOUT_MS = 15_000;

/** Bound every mint call so a stalled mint cannot wedge the recovery UI. */
function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out`)),
      timeoutMs
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/** Proofs whose secrets are not currently in the buyer's local token store. */
function missingFromWallet(proofs: Proof[]): Proof[] {
  const tokens = storage.getJson<Proof[]>(STORAGE_KEYS.TOKENS, []);
  const presentSecrets = new Set(tokens.map((token) => token.secret));
  return proofs.filter((proof) => !presentSecrets.has(proof.secret));
}

/**
 * Merge proofs into the buyer's wallet, verifying the write landed and that
 * no proof was double-inserted. Returns the proofs actually inserted, or null
 * when the read-back cannot confirm exactly one copy of each — callers must
 * keep the pending record so a retry can converge. The secret filter runs
 * immediately before mutation (not when the mint check started, which may be
 * seconds earlier) so proofs added to the store mid-check — e.g. by the
 * checkout catch handler or another tab — are never re-appended.
 */
async function restoreProofs(
  nostr: Nostr,
  signer: Signer,
  mintUrl: string,
  proofs: Proof[]
): Promise<Proof[] | null> {
  const toInsert = missingFromWallet(proofs);
  if (toInsert.length > 0) {
    await recoverProofsToBuyerWallet(
      nostr,
      signer,
      mintUrl,
      toInsert,
      sumProofAmounts(toInsert)
    );
  }

  const targetSecrets = new Set(proofs.map((proof) => proof.secret));
  const countTargets = (tokens: Proof[]) => {
    const counts = new Map<string, number>();
    for (const token of tokens) {
      if (targetSecrets.has(token.secret)) {
        counts.set(token.secret, (counts.get(token.secret) ?? 0) + 1);
      }
    }
    return counts;
  };

  let tokens = storage.getJson<Proof[]>(STORAGE_KEYS.TOKENS, []);
  let counts = countTargets(tokens);

  // Heal duplicates a concurrent writer may have added alongside ours.
  if ([...counts.values()].some((count) => count > 1)) {
    const seen = new Set<string>();
    storage.setJson(
      STORAGE_KEYS.TOKENS,
      tokens.filter((token) => {
        if (!targetSecrets.has(token.secret)) return true;
        if (seen.has(token.secret)) return false;
        seen.add(token.secret);
        return true;
      })
    );
    tokens = storage.getJson<Proof[]>(STORAGE_KEYS.TOKENS, []);
    counts = countTargets(tokens);
  }

  const verified = [...targetSecrets].every(
    (secret) => counts.get(secret) === 1
  );
  return verified ? toInsert : null;
}

/** Best-effort record removal; callers report failure but never re-restore. */
function tryRemoveRecord(meltQuoteId: string): boolean {
  try {
    removePendingSellerLightningPayout(meltQuoteId);
    return true;
  } catch {
    return false;
  }
}

type StateCheck =
  | { kind: "ok"; states: string[] }
  | { kind: "malformed" }
  | { kind: "error"; message: string };

async function checkStates(
  wallet: CashuWallet,
  proofs: Proof[],
  timeoutMs: number
): Promise<StateCheck> {
  try {
    const raw = await withDeadline(
      wallet.checkProofsStates(proofs),
      timeoutMs,
      "Proof-state check"
    );
    if (!Array.isArray(raw) || raw.length !== proofs.length) {
      return { kind: "malformed" };
    }
    return { kind: "ok", states: raw.map((entry) => String(entry?.state)) };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Reconcile a recorded pending/unknown seller Lightning payout against the
 * mint. Mirrors the retry semantics documented in melt-retry-service.ts:
 * PAID means the melt happened (proofs spent, seller paid), PENDING means
 * leave everything untouched, UNPAID means the quarantined proofs are safe
 * to restore once the mint confirms them UNSPENT.
 *
 * Safety rules:
 * - Records bound to a buyer pubkey are only resolved while that account is
 *   signed in (records predate binding are treated as legacy by the UI).
 * - Proofs already present in the local token store are never re-added, so
 *   retries after a partial failure cannot double-count funds. The invoice
 *   cards normally restored `recoverableProofs` at failure time, but that
 *   write is best-effort, so missing ones are restored here too.
 * - The pending record is only removed after the restored proofs are
 *   confirmed present in the wallet via read-back.
 */
export async function resolvePendingSellerLightningPayout(
  record: PendingSellerLightningPayout,
  nostr: Nostr,
  signer: Signer,
  currentBuyerPubkey?: string,
  options: ResolvePendingPayoutOptions = {}
): Promise<PendingPayoutResolution> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_MINT_TIMEOUT_MS;
  // Unbound (legacy) records are never resolved: with no buyer identity to
  // check against, any signed-in account could claim the bearer proofs.
  if (!record.buyerPubkey || record.buyerPubkey !== currentBuyerPubkey) {
    return { status: "not-owner" };
  }

  const wallet = new CashuWallet(new CashuMint(record.mintUrl));

  let quoteState: string;
  try {
    const quote = await withDeadline(
      (async () => {
        await wallet.loadMint();
        return wallet.checkMeltQuoteBolt11(record.meltQuoteId);
      })(),
      timeoutMs,
      "Payout quote check"
    );
    quoteState = String(quote.state);
  } catch (error) {
    return {
      status: "unknown",
      reason: `Could not reach the mint to check the payout: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  if (quoteState === "PAID") {
    // The seller was paid. Make sure the buyer's recoverable proofs survived
    // before clearing the record — the checkout-time restore is best-effort.
    const missing = missingFromWallet(record.recoverableProofs);
    if (missing.length > 0) {
      const check = await checkStates(wallet, missing, timeoutMs);
      if (check.kind === "error") {
        return {
          status: "unknown",
          reason: `The mint was paid, but verifying your remaining proofs failed: ${check.message}`,
        };
      }
      if (check.kind === "malformed") {
        return {
          status: "needs-attention",
          reason:
            "The mint returned a malformed proof-state response. Do not retry this order; reconcile with the mint.",
        };
      }
      if (check.states.some((state) => state === "PENDING")) {
        return {
          status: "still-pending",
          reason: "The mint still has some of your proofs locked as pending.",
        };
      }
      if (
        check.states.some((state) => state !== "UNSPENT" && state !== "SPENT")
      ) {
        return {
          status: "needs-attention",
          reason:
            "The mint returned an unrecognized proof state. Do not retry this order; reconcile with the mint.",
        };
      }
      const restorable = missing.filter(
        (_, index) => check.states[index] === "UNSPENT"
      );
      if (restorable.length > 0) {
        const restored = await restoreProofs(
          nostr,
          signer,
          record.mintUrl,
          restorable
        );
        if (!restored) {
          return {
            status: "unknown",
            reason:
              "The payout is complete, but the wallet write for your remaining proofs could not be confirmed. The record was kept; check again.",
          };
        }
      }
    }
    // A record already stamped notifiedAt had its seller DM sent on a
    // previous attempt whose record removal then failed — retrying must not
    // re-send it. The buyer receipt is gated separately on receiptSentAt so
    // that same retry still delivers a receipt whose first send failed.
    const needsNotification = record.notifiedAt === undefined;
    const needsReceipt = record.receiptSentAt === undefined;
    if (needsNotification && options.notifySeller) {
      try {
        await options.notifySeller(record);
      } catch (error) {
        return {
          status: "notify-failed",
          reason: `The mint paid the seller, but the confirmation message could not be sent: ${
            error instanceof Error ? error.message : String(error)
          }. The record was kept; check again to retry the notification.`,
        };
      }
      // Stamp the record so a failed removal below retries without
      // re-sending the DM. Best-effort: if the mark cannot be persisted the
      // removal will likely fail too, and the retry falls back to a
      // duplicate DM — still better than a seller never told.
      try {
        markPendingSellerLightningPayoutNotified(record.meltQuoteId);
      } catch {
        // Removal below is attempted regardless.
      }
    }
    let receiptError: string | undefined;
    if (needsReceipt && options.notifyBuyer) {
      try {
        await options.notifyBuyer(record);
        // Stamp the record so a failed removal below retries without
        // re-sending the receipt. Best-effort: if the mark cannot be
        // persisted the removal will likely fail too, and the retry falls
        // back to a duplicate receipt — still better than a buyer whose
        // chat history never gets one.
        try {
          markPendingSellerLightningPayoutReceiptSent(record.meltQuoteId);
        } catch {
          // Removal below is attempted regardless.
        }
      } catch (error) {
        // Best-effort: the seller was paid and notified, so the payout is
        // complete regardless. Surface the failure but still clear the
        // record — keeping it would re-send the seller DM on every retry.
        // receiptSentAt stays unset, so if the removal below fails the
        // retry re-attempts the receipt without touching the seller DM.
        receiptError =
          error instanceof Error ? error.message : String(error);
      }
    }
    if (!tryRemoveRecord(record.meltQuoteId)) {
      return {
        status: "unknown",
        reason:
          "The payout is complete, but the record could not be cleared. It will disappear on the next check.",
      };
    }
    return receiptError
      ? { status: "completed", receiptError }
      : { status: "completed" };
  }

  if (quoteState === "PENDING") {
    return {
      status: "still-pending",
      reason: "The mint is still processing this payout.",
    };
  }

  if (quoteState !== "UNPAID") {
    return {
      status: "needs-attention",
      reason: `The mint reported an unrecognized quote state ("${quoteState}"). Do not retry this order; reconcile with the mint.`,
    };
  }

  // UNPAID: the melt did not settle. Restore whichever quarantined proofs the
  // mint still reports UNSPENT, plus any recoverable proofs the checkout-time
  // restore failed to persist.
  const missingQuarantined = missingFromWallet(record.quarantinedProofs);
  const missingRecoverable = missingFromWallet(record.recoverableProofs);
  const toCheck = [...missingQuarantined, ...missingRecoverable];

  if (toCheck.length === 0) {
    if (!tryRemoveRecord(record.meltQuoteId)) {
      return {
        status: "unknown",
        reason:
          "Nothing left to recover, but the record could not be cleared. It will disappear on the next check.",
      };
    }
    return { status: "recovered", recoveredAmount: 0 };
  }

  const check = await checkStates(wallet, toCheck, timeoutMs);
  if (check.kind === "error") {
    return {
      status: "unknown",
      reason: `The payout is unpaid, but the proof-state check failed: ${check.message}`,
    };
  }
  if (check.kind === "malformed") {
    return {
      status: "needs-attention",
      reason:
        "The mint returned a malformed proof-state response. Do not retry this order; reconcile with the mint.",
    };
  }

  const quarantinedStates = check.states.slice(0, missingQuarantined.length);
  const recoverableStates = check.states.slice(missingQuarantined.length);

  if (check.states.some((state) => state === "PENDING")) {
    return {
      status: "still-pending",
      reason: "The mint still has the payout proofs locked as pending.",
    };
  }
  if (quarantinedStates.some((state) => state === "SPENT")) {
    return {
      status: "needs-attention",
      reason:
        "The mint reports the payout as unpaid, but quarantined proof(s) are spent. Do not retry this order; reconcile with the mint.",
    };
  }
  if (
    check.states.some((state) => state !== "UNSPENT" && state !== "SPENT")
  ) {
    return {
      status: "needs-attention",
      reason:
        "The mint returned an unrecognized proof state. Do not retry this order; reconcile with the mint.",
    };
  }

  // Recoverable proofs that are SPENT were legitimately spent by the buyer
  // after the checkout-time restore; only UNSPENT ones come back.
  const restorable = [
    ...missingQuarantined.filter(
      (_, index) => quarantinedStates[index] === "UNSPENT"
    ),
    ...missingRecoverable.filter(
      (_, index) => recoverableStates[index] === "UNSPENT"
    ),
  ];

  let inserted: Proof[] = [];
  if (restorable.length > 0) {
    const result = await restoreProofs(
      nostr,
      signer,
      record.mintUrl,
      restorable
    );
    if (!result) {
      return {
        status: "unknown",
        reason:
          "The wallet write for the recovered proofs could not be confirmed. The record was kept; check again.",
        };
    }
    inserted = result;
  }
  if (!tryRemoveRecord(record.meltQuoteId)) {
    return {
      status: "unknown",
      reason:
        "Your proofs were recovered, but the record could not be cleared. It will disappear on the next check.",
    };
  }
  return { status: "recovered", recoveredAmount: sumProofAmounts(inserted) };
}
