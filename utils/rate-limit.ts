import type { NextApiRequest, NextApiResponse } from "next";

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

const buckets = new Map<
  string,
  Map<string, { count: number; resetAt: number }>
>();

function getBucket(
  name: string
): Map<string, { count: number; resetAt: number }> {
  let bucket = buckets.get(name);
  if (!bucket) {
    bucket = new Map();
    buckets.set(name, bucket);
  }
  return bucket;
}

export function checkRateLimit(
  bucketName: string,
  key: string,
  options: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  const bucket = getBucket(bucketName);
  const entry = bucket.get(key);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + options.windowMs;
    bucket.set(key, { count: 1, resetAt });
    return {
      ok: true,
      limit: options.limit,
      remaining: options.limit - 1,
      resetAt,
    };
  }

  if (entry.count >= options.limit) {
    return {
      ok: false,
      limit: options.limit,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  entry.count++;
  return {
    ok: true,
    limit: options.limit,
    remaining: options.limit - entry.count,
    resetAt: entry.resetAt,
  };
}

export function getRequestIp(req: NextApiRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  const forwardedValues = Array.isArray(forwarded) ? forwarded : [forwarded];
  for (let i = forwardedValues.length - 1; i >= 0; i--) {
    const forwardedValue = forwardedValues[i];
    const forwardedParts = forwardedValue
      ?.split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const rightmostForwarded = forwardedParts?.[forwardedParts.length - 1];
    if (rightmostForwarded) return rightmostForwarded;
  }

  return req.socket?.remoteAddress ?? "unknown";
}

/**
 * Convenience wrapper for the common "check rate limit, set Retry-After,
 * respond 429" pattern used in API route handlers. Returns `true` when the
 * caller should continue handling the request, or `false` when a 429 has
 * already been written and the handler should `return` immediately.
 *
 * NOTE: The underlying bucket store is an in-memory `Map` scoped to a single
 * Node process. Under horizontal scaling the effective limit is roughly
 * `N × limit` where N is the instance count. This is intentionally a coarse
 * safety net to keep one bad client from monopolising the DB pool — not a
 * cryptographically strict ceiling. See `replit.md` for deployment notes.
 */
export function applyRateLimit(
  req: NextApiRequest,
  res: NextApiResponse,
  bucketName: string,
  options: RateLimitOptions,
  key?: string
): boolean {
  const rate = checkRateLimit(bucketName, key ?? getRequestIp(req), options);
  if (!rate.ok) {
    res.setHeader(
      "Retry-After",
      Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))
    );
    res.status(429).json({ error: "Too many requests" });
    return false;
  }
  return true;
}

// Exported for tests only.
export function __resetRateLimitBuckets(): void {
  buckets.clear();
}
