import { Proof } from "@cashu/cashu-ts";
import { publishProofEvent } from "@/utils/nostr/nostr-helper-functions";
import { creditProofsToLocalWallet } from "./local-wallet-cache";

type Nostr = Parameters<typeof publishProofEvent>[0];
type Signer = Parameters<typeof publishProofEvent>[1];

/**
 * Persist freshly-minted proofs into the buyer's local wallet when the
 * downstream seller-DM hand-off fails. Mirrors the wallet-top-up bookkeeping
 * done by the mint-button claim path: volatile proof cache, history entry, and
 * a kind-7375 wallet event so other devices can sync.
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

  creditProofsToLocalWallet(proofs, amount, 3);

  // Best-effort wallet event publish. Local proof cache is credited first, and
  // publishProofEvent queues encrypted retries on relay failure before
  // rethrowing, so claim completion does not depend on relay reachability.
  void publishProofEvent(
    nostr,
    signer,
    mintUrl,
    proofs,
    "in",
    amount.toString()
  ).catch((err) => {
    console.warn(
      "[wallet-recovery] proof event publish failed; proofs are safe in local cache:",
      err
    );
  });
}

export function publishProofEventBestEffort(
  nostr: Nostr,
  signer: Signer,
  mintUrl: string,
  proofs: Proof[],
  direction: "in" | "out",
  amount: string,
  deletedEventsArray?: string[]
): void {
  void publishProofEvent(
    nostr,
    signer,
    mintUrl,
    proofs,
    direction,
    amount,
    deletedEventsArray
  ).catch((err) => {
    console.warn("[wallet-recovery] proof event publish failed:", err);
  });
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
