/**
 * @jest-environment node
 */
import { HttpResponseError, RateLimitError } from "@cashu/cashu-ts";
import {
  computeRetryDelay,
  isRetryableError,
  MintOperationError,
  withMintRetry,
  withTimeout,
} from "../mint-retry-service";

describe("isRetryableError", () => {
  it("treats RateLimitError as retryable", () => {
    expect(isRetryableError(new RateLimitError("slow down", 1000))).toBe(true);
  });

  it("treats 5xx HttpResponseError as retryable", () => {
    const err = new HttpResponseError("boom", 503);
    expect(isRetryableError(err)).toBe(true);
  });

  it("does not retry 4xx HttpResponseError", () => {
    const err = new HttpResponseError("nope", 400);
    expect(isRetryableError(err)).toBe(false);
  });

  it("retries our own timeout sentinel", () => {
    expect(isRetryableError(new Error("Timeout"))).toBe(true);
  });

  it("retries common network error messages", () => {
    expect(isRetryableError(new Error("fetch failed"))).toBe(true);
    expect(isRetryableError(new Error("network error"))).toBe(true);
    expect(isRetryableError(new Error("socket hang up"))).toBe(true);
  });

  it("does not retry validation-style errors", () => {
    expect(isRetryableError(new Error("invalid amount"))).toBe(false);
  });
});

describe("computeRetryDelay", () => {
  const opts = { baseDelayMs: 1000, maxDelayMs: 30000, jitter: false };

  it("uses exponential backoff", () => {
    expect(computeRetryDelay(1, new Error("Timeout"), opts)).toBe(1000);
    expect(computeRetryDelay(2, new Error("Timeout"), opts)).toBe(2000);
    expect(computeRetryDelay(3, new Error("Timeout"), opts)).toBe(4000);
    expect(computeRetryDelay(4, new Error("Timeout"), opts)).toBe(8000);
  });

  it("clamps to maxDelayMs", () => {
    expect(computeRetryDelay(20, new Error("Timeout"), opts)).toBe(30000);
  });

  it("honors RateLimitError.retryAfterMs", () => {
    const err = new RateLimitError("slow", 5500);
    expect(computeRetryDelay(1, err, opts)).toBe(5500);
  });

  it("clamps RateLimitError.retryAfterMs to maxDelayMs", () => {
    const err = new RateLimitError("slow", 999_999);
    expect(computeRetryDelay(1, err, opts)).toBe(30000);
  });
});

describe("withTimeout", () => {
  it("resolves when fn completes in time", async () => {
    await expect(withTimeout(async () => 42, 100)).resolves.toBe(42);
  });

  it("rejects with Timeout when fn takes too long", async () => {
    await expect(
      withTimeout(() => new Promise((r) => setTimeout(() => r(1), 100)), 20)
    ).rejects.toThrow("Timeout");
  });
});

describe("withMintRetry", () => {
  it("returns successful result without retry", async () => {
    const fn = jest.fn().mockResolvedValue("ok");
    const result = await withMintRetry(fn, {
      maxAttempts: 3,
      perAttemptTimeoutMs: 100,
      baseDelayMs: 1,
      jitter: false,
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable error and eventually succeeds", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockRejectedValueOnce(new HttpResponseError("oops", 503))
      .mockResolvedValue("ok");
    const result = await withMintRetry(fn, {
      maxAttempts: 5,
      perAttemptTimeoutMs: 100,
      baseDelayMs: 1,
      jitter: false,
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry terminal errors", async () => {
    const fn = jest
      .fn()
      .mockRejectedValue(new HttpResponseError("bad request", 400));
    await expect(
      withMintRetry(fn, {
        maxAttempts: 5,
        perAttemptTimeoutMs: 100,
        baseDelayMs: 1,
        jitter: false,
      })
    ).rejects.toThrow(MintOperationError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("Timeout"));
    await expect(
      withMintRetry(fn, {
        maxAttempts: 3,
        perAttemptTimeoutMs: 50,
        baseDelayMs: 1,
        jitter: false,
      })
    ).rejects.toThrow(MintOperationError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("invokes onAttempt callback", async () => {
    const onAttempt = jest.fn();
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockResolvedValue("ok");
    await withMintRetry(fn, {
      maxAttempts: 3,
      perAttemptTimeoutMs: 100,
      baseDelayMs: 1,
      jitter: false,
      onAttempt,
    });
    // Called twice per attempt (start + end), 2 attempts
    expect(onAttempt).toHaveBeenCalled();
    expect(onAttempt).toHaveBeenCalledWith(1);
    expect(onAttempt).toHaveBeenCalledWith(2);
  });

  it("respects abort signal", async () => {
    const controller = new AbortController();
    const fn = jest.fn().mockRejectedValue(new Error("Timeout"));
    const promise = withMintRetry(fn, {
      maxAttempts: 10,
      perAttemptTimeoutMs: 100,
      baseDelayMs: 100,
      jitter: false,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 50);
    await expect(promise).rejects.toThrow();
  });
});
