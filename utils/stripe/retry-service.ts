import Stripe from "stripe";
import crypto from "crypto";
import { newPromiseWithTimeout } from "@/utils/timeout";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = canonicalize(obj[k]);
        return acc;
      }, {});
  }
  return value;
}

/**
 * Deterministic idempotency key derived from a prefix + payload.
 *
 * Two requests with the same logical content produce the same key, so a
 * client-side retry of the same purchase will dedupe at Stripe (returning
 * the original resource within Stripe's 24h idempotency window) instead of
 * creating a duplicate PaymentIntent / Subscription / Invoice.
 */
export function stableIdempotencyKey(prefix: string, payload: unknown): string {
  const canonical = JSON.stringify(canonicalize(payload));
  const hash = crypto
    .createHash("sha256")
    .update(canonical)
    .digest("hex")
    .slice(0, 32);
  return `${prefix}-${hash}`;
}

export class StripeOperationError extends Error {
  public readonly attempts: number;
  public readonly cause?: unknown;
  constructor(message: string, cause?: unknown, attempts = 0) {
    super(message);
    this.name = "StripeOperationError";
    this.cause = cause;
    this.attempts = attempts;
  }
}

export interface StripeRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  perAttemptTimeoutMs?: number;
  totalTimeoutMs?: number;
  jitter?: boolean;
  onAttempt?: (attempt: number, error?: unknown) => void;
  signal?: AbortSignal;
}

const DEFAULTS: Required<Omit<StripeRetryOptions, "onAttempt" | "signal">> = {
  maxAttempts: 5,
  baseDelayMs: 500,
  maxDelayMs: 15000,
  perAttemptTimeoutMs: 20000,
  totalTimeoutMs: 60000,
  jitter: true,
};

export function isRetryableStripeError(error: unknown): boolean {
  if (error instanceof Stripe.errors.StripeConnectionError) return true;
  if (error instanceof Stripe.errors.StripeAPIError) return true;
  if (error instanceof Stripe.errors.StripeRateLimitError) return true;
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

function getRetryAfterMs(error: unknown): number | null {
  if (error instanceof Stripe.errors.StripeRateLimitError) {
    const headers = (error as { headers?: Record<string, string> }).headers;
    const ra = headers?.["retry-after"] ?? headers?.["Retry-After"];
    if (ra) {
      const seconds = parseInt(ra, 10);
      if (!Number.isNaN(seconds)) return seconds * 1000;
    }
  }
  return null;
}

export function computeStripeRetryDelay(
  attempt: number,
  error: unknown,
  opts: { baseDelayMs: number; maxDelayMs: number; jitter: boolean }
): number {
  const ra = getRetryAfterMs(error);
  if (ra !== null) return Math.min(Math.max(ra, 0), opts.maxDelayMs);
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

async function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
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
 * Run a Stripe operation with bounded per-attempt timeouts, exponential
 * backoff with full jitter, and Retry-After-aware rate-limit handling.
 *
 * Use the returned `idempotencyKey` (or pass your own) on Stripe write
 * operations so that retries are safe — Stripe will return the original
 * resource rather than creating a duplicate.
 */
export async function withStripeRetry<T>(
  fn: () => Promise<T>,
  options: StripeRetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULTS, ...options };
  const start = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    if (options.signal?.aborted) {
      throw new StripeOperationError("Aborted", lastError, attempt - 1);
    }
    if (Date.now() - start > opts.totalTimeoutMs) {
      throw new StripeOperationError(
        `Stripe operation exceeded total timeout of ${opts.totalTimeoutMs}ms`,
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

      if (!isRetryableStripeError(error) || attempt === opts.maxAttempts) {
        throw new StripeOperationError(
          `Stripe operation failed after ${attempt} attempt(s): ${
            error instanceof Error ? error.message : String(error)
          }`,
          error,
          attempt
        );
      }

      const delay = computeStripeRetryDelay(attempt, error, opts);
      const remaining = opts.totalTimeoutMs - (Date.now() - start);
      if (delay >= remaining) {
        throw new StripeOperationError(
          "Stripe operation would exceed total timeout while waiting to retry",
          error,
          attempt
        );
      }
      await sleep(delay, options.signal);
    }
  }

  throw new StripeOperationError(
    "withStripeRetry exhausted attempts without resolving",
    lastError,
    opts.maxAttempts
  );
}
