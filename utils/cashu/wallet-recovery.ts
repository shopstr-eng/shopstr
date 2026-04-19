import { Proof } from "@cashu/cashu-ts";
import {
  clearPendingIncomingProofs,
  getLocalStorageData,
  publishProofEvent,
  setLocalCashuTokens,
  stagePendingIncomingProofs,
} from "@/utils/nostr/nostr-helper-functions";

type Nostr = Parameters<typeof publishProofEvent>[0];
type Signer = Parameters<typeof publishProofEvent>[1];

/**
 * Persist freshly-minted proofs into the buyer's local wallet when the
 * downstream seller-DM hand-off fails. Mirrors the wallet-top-up bookkeeping
 * done by the mint-button claim path: local wallet tokens, history entry,
 * and a kind-7375 wallet event so other devices can sync.
 *
 * Idempotency: callers must only invoke this once per failed claim. The
 * pending-mint-store should be transitioned to `claimed` immediately after
 * a successful call so boot recovery does not re-attempt the (already issued)
 * mint quote.
 */
export async function recoverProofsToBuyerWallet(
  nostr: Nostr,
  signer: Signer,
  mintUrl: string,
  proofs: Proof[],
  amount: number
): Promise<void> {
  if (typeof window === "undefined") return;
  if (!proofs || proofs.length === 0) return;

  const { tokens, history } = getLocalStorageData();
  const pendingProofId = await stagePendingIncomingProofs(
    signer,
    mintUrl,
    proofs,
    amount.toString()
  );
  const proofArray = [...tokens, ...proofs];
  setLocalCashuTokens(proofArray);
  window.localStorage.setItem(
    "history",
    JSON.stringify([
      {
        type: 3,
        amount,
        date: Math.floor(Date.now() / 1000),
      },
      ...history,
    ])
  );

  // Keep an encrypted pending-proof record until the wallet event is accepted,
  // so a refresh can recover these proofs even if the publish step misses.
  try {
    const publishSucceeded = await publishProofEvent(
      nostr,
      signer,
      mintUrl,
      proofs,
      "in",
      amount.toString()
    );
    if (publishSucceeded) {
      clearPendingIncomingProofs([pendingProofId]);
    }
  } catch (err) {
    console.warn(
      "[wallet-recovery] proof event publish failed; tokens are safe in the active session wallet:",
      err
    );
  }
}

/**
 * Race a promise against a deadline. On timeout the returned promise rejects
 * with a Error tagged `__timeout = true`, which callers can branch on to
 * distinguish a genuine throw from an unbounded hang.
 *
 * The original work is NOT cancelled (JS has no general cancellation) — but
 * the caller's UI is unblocked and any in-flight proofs have already been
 * captured by the caller before the race begins.
 */
export interface TimeoutError extends Error {
  __timeout: true;
}

export function isTimeoutError(err: unknown): err is TimeoutError {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { __timeout?: unknown }).__timeout === true
  );
}

export async function withDeadline<T>(
  work: () => Promise<T>,
  timeoutMs: number,
  label = "operation"
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(
        `${label} timed out after ${timeoutMs}ms`
      ) as TimeoutError;
      err.__timeout = true;
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([work(), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
