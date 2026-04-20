import { newPromiseWithTimeout } from "@/utils/timeout";
import * as Cashu from "@cashu/cashu-ts";

function isInstanceOf(
  value: unknown,
  ctor: unknown
): value is Error & Record<string, unknown> {
  return typeof ctor === "function" && value instanceof ctor;
}

export class MintOperationError extends Error {
  public readonly attempts: number;
  public readonly cause?: unknown;
  constructor(message: string, cause?: unknown, attempts = 0) {
    super(message);
    this.name = "MintOperationError";
    this.cause = cause;
    this.attempts = attempts;
  }
}

export interface MintRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  perAttemptTimeoutMs?: number;
  totalTimeoutMs?: number;
  jitter?: boolean;
  onAttempt?: (attempt: number, error?: unknown) => void;
  signal?: AbortSignal;
}

const DEFAULTS: Required<Omit<MintRetryOptions, "onAttempt" | "signal">> = {
  maxAttempts: 6,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  perAttemptTimeoutMs: 15000,
  totalTimeoutMs: 120000,
  jitter: true,
};

export function isRetryableError(error: unknown): boolean {
  if (isInstanceOf(error, Cashu.RateLimitError)) return true;
  if (isInstanceOf(error, Cashu.HttpResponseError)) {
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      return status >= 500 && status < 600;
    }
    return true;
  }
  if (error instanceof Error) {
    if (error.message === "Timeout") return true;
    const msg = error.message.toLowerCase();
    if (
      msg.includes("network") ||
      msg.includes("fetch failed") ||
      msg.includes("failed to fetch") ||
      msg.includes("aborted") ||
      msg.includes("socket hang up") ||
      msg.includes("econnreset") ||
      msg.includes("etimedout")
    ) {
      return true;
    }
    const code = (error as { code?: string }).code;
    if (
      code === "ETIMEDOUT" ||
      code === "ECONNRESET" ||
      code === "ECONNREFUSED"
    ) {
      return true;
    }
  }
  return false;
}

export function computeRetryDelay(
  attempt: number,
  error: unknown,
  opts: { baseDelayMs: number; maxDelayMs: number; jitter: boolean }
): number {
  if (
    isInstanceOf(error, Cashu.RateLimitError) &&
    typeof error.retryAfterMs === "number"
  ) {
    return Math.min(Math.max(error.retryAfterMs, 0), opts.maxDelayMs);
  }
  const exponential = Math.min(
    opts.baseDelayMs * Math.pow(2, Math.max(0, attempt - 1)),
    opts.maxDelayMs
  );
  if (!opts.jitter) return exponential;
  return Math.floor(Math.random() * exponential);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }
    const id = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(id);
        reject(new Error("Aborted"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

export async function withTimeout<T>(
  fn: () => Promise<T>,
  ms: number
): Promise<T> {
  return newPromiseWithTimeout<T>(
    async (resolve, reject) => {
      try {
        const result = await fn();
        resolve(result);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    },
    { timeout: ms }
  );
}

/**
 * Run a Cashu mint operation with bounded per-attempt timeouts, exponential
 * backoff with full jitter, and Retry-After-aware rate-limit handling.
 *
 * Designed for read/idempotent mint operations (`checkMintQuoteBolt11`,
 * `getKeysets`, etc.). For non-idempotent operations like `mintProofsBolt11`
 * and `meltProofsBolt11`, retry is still safe because the mint is the source
 * of truth: a duplicate `mintProofsBolt11` against an already-issued quote
 * returns an "issued" error which the caller treats as terminal.
 */
export async function withMintRetry<T>(
  fn: () => Promise<T>,
  options: MintRetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULTS, ...options };
  const start = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    if (options.signal?.aborted) {
      throw new MintOperationError("Aborted", lastError, attempt - 1);
    }
    if (Date.now() - start > opts.totalTimeoutMs) {
      throw new MintOperationError(
        `Mint operation exceeded total timeout of ${opts.totalTimeoutMs}ms`,
        lastError,
        attempt - 1
      );
    }

    try {
      options.onAttempt?.(attempt);
      return await withTimeout(fn, opts.perAttemptTimeoutMs);
    } catch (error) {
      lastError = error;
      options.onAttempt?.(attempt, error);

      if (!isRetryableError(error) || attempt === opts.maxAttempts) {
        throw new MintOperationError(
          `Mint operation failed after ${attempt} attempt(s): ${
            error instanceof Error ? error.message : String(error)
          }`,
          error,
          attempt
        );
      }

      const delay = computeRetryDelay(attempt, error, opts);
      const remaining = opts.totalTimeoutMs - (Date.now() - start);
      if (delay >= remaining) {
        throw new MintOperationError(
          "Mint operation would exceed total timeout while waiting to retry",
          error,
          attempt
        );
      }
      await sleep(delay, options.signal);
    }
  }

  throw new MintOperationError(
    "withMintRetry exhausted attempts without resolving",
    lastError,
    opts.maxAttempts
  );
}
