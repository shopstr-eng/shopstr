import type { NextApiRequest } from "next";

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
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const fromForwarded = forwardedValue?.split(",")[0]?.trim();
  if (fromForwarded) return fromForwarded;

  const realIp = req.headers["x-real-ip"];
  const realIpValue = Array.isArray(realIp) ? realIp[0] : realIp;
  if (realIpValue) return realIpValue.trim();

  return req.socket?.remoteAddress ?? "unknown";
}

// Exported for tests only.
export function __resetRateLimitBuckets(): void {
  buckets.clear();
}
