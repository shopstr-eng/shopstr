import {
  Wallet as CashuWallet,
  Proof,
  CheckStateEnum,
  AmountLike,
  SendConfig,
  OutputConfig,
} from "@cashu/cashu-ts";
import { withMintRetry, MintRetryOptions } from "./mint-retry-service";

/**
 * Outcome of a `safeSwap` call. The `status` field reflects the **mint's
 * view of the input proofs** after the call resolves, so callers can never
 * accidentally re-spend or silently lose funds when the network drops a
 * `wallet.send` response:
 *
 * - `"swapped"`     — the swap completed; `keep`/`send` are the new outputs
 *                     and the original input proofs are SPENT on the mint.
 * - `"unswapped"`   — the swap never happened; the original input proofs
 *                     are UNSPENT on the mint and may be reused.
 * - `"unknown"`     — the swap call failed and the post-failure state check
 *                     could not give a definitive answer (mint unreachable,
 *                     mixed states, etc.). The caller MUST quarantine the
 *                     input proofs and reconcile out-of-band; in particular
 *                     they must not be passed to a follow-up melt.
 */
export type SwapOutcomeStatus = "swapped" | "unswapped" | "unknown";

export interface SwapOutcome {
  status: SwapOutcomeStatus;
  /** Present when `status === "swapped"`. */
  keep: Proof[];
  /** Present when `status === "swapped"`. */
  send: Proof[];
  /** Diagnostic message describing the outcome path. */
  errorMessage?: string;
}

const DEFAULT_SWAP_OPTS: Required<
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
 * Execute `wallet.send` (a mint-side swap) with bounded retry, then — on
 * ambiguous failure — interrogate the mint via `checkProofsStates` so the
 * caller can determine whether the inputs are still spendable, definitely
 * spent (with the new outputs lost), or in an unknown state.
 *
 * This is the only safe way to invoke `wallet.send` from a flow that goes
 * on to spend the resulting `send` proofs (e.g. immediately feeding them
 * into `safeMeltProofs` or encoding them into a token to share). A naive
 * single-shot `wallet.send` can leave the original proofs spent on the
 * mint while the new outputs never reach the client, silently destroying
 * the user's funds.
 */
export async function safeSwap(
  wallet: CashuWallet,
  amount: AmountLike,
  inputProofs: Proof[],
  options: {
    sendConfig?: SendConfig;
    outputConfig?: OutputConfig;
    swapRetry?: MintRetryOptions;
    checkRetry?: MintRetryOptions;
  } = {}
): Promise<SwapOutcome> {
  const swapOpts = { ...DEFAULT_SWAP_OPTS, ...options.swapRetry };
  const checkOpts = { ...DEFAULT_CHECK_OPTS, ...options.checkRetry };

  let originalError: unknown;
  try {
    const response = await withMintRetry(
      () =>
        wallet.send(
          amount,
          inputProofs,
          options.sendConfig,
          options.outputConfig
        ),
      swapOpts
    );
    return {
      status: "swapped",
      keep: response.keep ?? [],
      send: response.send ?? [],
    };
  } catch (error) {
    originalError = error;
  }

  const originalMessage =
    originalError instanceof Error
      ? originalError.message
      : String(originalError);

  // Terminal errors: the swap definitively did not happen.
  const lowered = originalMessage.toLowerCase();
  if (
    lowered.includes("insufficient") ||
    lowered.includes("invalid proof") ||
    lowered.includes("invalid amount") ||
    lowered.includes("amount too") ||
    lowered.includes("expired")
  ) {
    return {
      status: "unswapped",
      keep: [],
      send: [],
      errorMessage: originalMessage,
    };
  }

  // Ambiguous: ask the mint whether the inputs are still spendable.
  let states: { state: CheckStateEnum }[];
  try {
    states = await withMintRetry(
      () => wallet.checkProofsStates(inputProofs),
      checkOpts
    );
  } catch (checkError) {
    const checkMsg =
      checkError instanceof Error ? checkError.message : String(checkError);
    return {
      status: "unknown",
      keep: [],
      send: [],
      errorMessage: `Swap failed and follow-up state check also failed. Inputs may be spent. Original: ${originalMessage}; Check: ${checkMsg}`,
    };
  }

  const hasSpent = states.some((s) => s.state === "SPENT");
  const hasPending = states.some((s) => s.state === "PENDING");
  const allUnspent = states.every((s) => s.state === "UNSPENT");

  if (allUnspent) {
    return {
      status: "unswapped",
      keep: [],
      send: [],
      errorMessage: `Swap failed; inputs confirmed UNSPENT on mint. Original: ${originalMessage}`,
    };
  }

  // If any input is SPENT (or PENDING), the swap may have partially or
  // fully succeeded but the new outputs were lost on the wire and cannot
  // be reconstructed client-side. Surface this as `unknown` so the caller
  // quarantines the proofs and never feeds phantom outputs into a melt.
  return {
    status: "unknown",
    keep: [],
    send: [],
    errorMessage: `Swap failed but mint reports input proofs as ${
      hasSpent ? "SPENT" : "PENDING"
    }${
      hasPending && hasSpent ? "/PENDING" : ""
    }; new outputs are unrecoverable client-side. Original: ${originalMessage}`,
  };
}
