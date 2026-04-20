type CashuWallet = any;
type MeltQuoteBolt11Response = any;
type Proof = any;
import { withMintRetry, MintRetryOptions } from "./mint-retry-service";

function getErrorMessage(error: unknown): string {
  const seen = new Set<unknown>();
  const collectMessages = (value: unknown): string[] => {
    if (value == null || seen.has(value)) return [];
    if (typeof value === "object") {
      seen.add(value);
    }
    if (typeof value === "string") return [value];
    if (typeof value !== "object") return [String(value)];

    const candidate = value as {
      message?: unknown;
      cause?: unknown;
    };
    const ownMessage =
      typeof candidate.message === "string" ? [candidate.message] : [];
    const stringified = String(value);
    const ownString =
      stringified && !ownMessage.includes(stringified) ? [stringified] : [];
    return [...ownMessage, ...ownString, ...collectMessages(candidate.cause)];
  };

  const messages = collectMessages(error).filter(Boolean);
  return messages.join(": ");
}

/**
 * Outcome of a `safeMeltProofs` call. The `status` field is the **truth of
 * the world** as the mint reports it, not just the API call result:
 *
 * - `"paid"`     — the invoice was paid; `proofsToSend` are spent. If the
 *                  caller had local copies they must remove them and persist
 *                  any `changeProofs` returned.
 * - `"unpaid"`   — the mint never accepted the melt; `proofsToSend` are
 *                  unchanged and may be reused or discarded freely.
 * - `"pending"`  — the mint is still attempting the Lightning payment.
 *                  `proofsToSend` must be left untouched until a follow-up
 *                  `checkMeltQuoteBolt11` resolves the quote to PAID/UNPAID.
 * - `"unknown"`  — both the melt call and the post-failure state check
 *                  failed. Treat `proofsToSend` as quarantined and reconcile
 *                  via the recovery driver on the next session.
 */
export type MeltOutcomeStatus = "paid" | "unpaid" | "pending" | "unknown";

export interface MeltOutcome {
  status: MeltOutcomeStatus;
  meltQuote: MeltQuoteBolt11Response;
  /** Present when `status === "paid"`. Empty array otherwise. */
  changeProofs: Proof[];
  /**
   * The full `meltProofsBolt11` response, when the original call succeeded.
   * `undefined` when status was determined via post-failure
   * `checkMeltQuoteBolt11`.
   */
  meltResponse?: Awaited<ReturnType<CashuWallet["meltProofsBolt11"]>>;
  /**
   * Diagnostic message describing the outcome path, especially useful when
   * the original `meltProofsBolt11` failed but the quote turned out PAID.
   */
  errorMessage?: string;
}

const DEFAULT_MELT_OPTS: Required<
  Pick<
    MintRetryOptions,
    "maxAttempts" | "perAttemptTimeoutMs" | "totalTimeoutMs"
  >
> = {
  maxAttempts: 3,
  perAttemptTimeoutMs: 30000,
  totalTimeoutMs: 90000,
};

const DEFAULT_CHECK_OPTS: Required<
  Pick<
    MintRetryOptions,
    "maxAttempts" | "perAttemptTimeoutMs" | "totalTimeoutMs"
  >
> = {
  maxAttempts: 4,
  perAttemptTimeoutMs: 10000,
  totalTimeoutMs: 60000,
};

/**
 * Execute `wallet.meltProofsBolt11` with bounded timeouts and exponential
 * backoff, then — if the call failed for any retryable reason — interrogate
 * the mint for the **true** quote state via `checkMeltQuoteBolt11` so the
 * caller can never accidentally re-spend or discard already-spent proofs.
 *
 * This is the only safe way to invoke `meltProofsBolt11` from a UI flow:
 * the cashu protocol guarantees a quote can only be PAID once, but a naive
 * timeout-then-retry can still leave the local UI desynced from the mint
 * (user thinks they paid nothing while the mint already paid the invoice
 * and consumed the proofs, or vice versa).
 */
export async function safeMeltProofs(
  wallet: CashuWallet,
  meltQuote: MeltQuoteBolt11Response,
  proofsToSend: Proof[],
  options: { meltRetry?: MintRetryOptions; checkRetry?: MintRetryOptions } = {}
): Promise<MeltOutcome> {
  const meltOpts = { ...DEFAULT_MELT_OPTS, ...options.meltRetry };
  const checkOpts = { ...DEFAULT_CHECK_OPTS, ...options.checkRetry };

  let originalError: unknown;
  try {
    const meltResponse = (await withMintRetry(
      () => wallet.meltProofsBolt11(meltQuote, proofsToSend),
      meltOpts
    )) as { change?: Proof[] };
    return {
      status: "paid",
      meltQuote,
      meltResponse,
      changeProofs: meltResponse.change ?? [],
    };
  } catch (error) {
    originalError = error;
  }

  const originalMessage = getErrorMessage(originalError);

  // Distinguish "definitely no payment happened" (terminal client errors like
  // "insufficient funds", "invalid quote") from ambiguous ones. For terminal
  // ones we can confidently report unpaid without bothering the mint.
  const lowered = originalMessage.toLowerCase();
  if (
    lowered.includes("insufficient") ||
    lowered.includes("invalid quote") ||
    lowered.includes("invalid proof") ||
    lowered.includes("expired")
  ) {
    return {
      status: "unpaid",
      meltQuote,
      changeProofs: [],
      errorMessage: originalMessage,
    };
  }

  // Ambiguous: ask the mint for the truth.
  let finalState: MeltQuoteBolt11Response;
  try {
    finalState = await withMintRetry(
      () => wallet.checkMeltQuoteBolt11(meltQuote.quote),
      checkOpts
    );
  } catch (checkError) {
    const checkMsg =
      checkError instanceof Error ? checkError.message : String(checkError);
    return {
      status: "unknown",
      meltQuote,
      changeProofs: [],
      errorMessage: `Melt failed and follow-up state check also failed. Proofs may be spent. Original: ${originalMessage}; Check: ${checkMsg}`,
    };
  }

  if (finalState.state === "PAID") {
    // The mint reports PAID, but the `change` field on a post-failure
    // checkMeltQuoteBolt11 response carries blinded signatures (not
    // unblinded Proofs). Without the original `meltProofsBolt11` call's
    // blinding factors we cannot recover spendable change client-side, so
    // we surface the situation in `errorMessage` and report no change.
    const lostChange =
      (finalState as { change?: unknown[] }).change?.length ?? 0;
    return {
      status: "paid",
      meltQuote: finalState,
      changeProofs: [],
      errorMessage: `Original meltProofsBolt11 failed but quote is PAID; proofs are spent. Original: ${originalMessage}${
        lostChange > 0
          ? `. ${lostChange} change output(s) reported by mint are unrecoverable client-side.`
          : ""
      }`,
    };
  }
  if (finalState.state === "PENDING") {
    return {
      status: "pending",
      meltQuote: finalState,
      changeProofs: [],
      errorMessage: `Melt quote is PENDING — mint still processing. Original: ${originalMessage}`,
    };
  }
  return {
    status: "unpaid",
    meltQuote: finalState,
    changeProofs: [],
    errorMessage: `Melt failed and mint reports UNPAID; proofs are unspent. Original: ${originalMessage}`,
  };
}
