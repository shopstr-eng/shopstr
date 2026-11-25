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

type RateLimitEntry = { count: number; resetAt: number };

type RateLimitBucket = {
  entries: Map<string, RateLimitEntry>;
  lastSweepAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

// Keys are client IPs (and pubkeys after authentication), so without a bound
// the maps would grow with every distinct caller for the life of the process.
// Expired entries are swept at most once per SWEEP_INTERVAL_MS per bucket when
// a new key arrives; MAX_KEYS_PER_BUCKET is a backstop for a flood of distinct
// keys inside a single window.
const SWEEP_INTERVAL_MS = 60 * 1000;
export const MAX_KEYS_PER_BUCKET = 5_000;

function normalizeIp(ip: string | undefined): string | undefined {
  const trimmed = ip?.trim();
  if (!trimmed) return undefined;

  return trimmed.startsWith("::ffff:")
    ? trimmed.slice("::ffff:".length)
    : trimmed;
}

function isTruthyEnv(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.toLowerCase() ?? "");
}

function getTrustedProxyIps(): Set<string> {
  return new Set(
    (process.env.TRUSTED_PROXY_IPS ?? "")
      .split(",")
      .map((ip) => normalizeIp(ip))
      .filter((ip): ip is string => !!ip)
  );
}

function shouldTrustForwardedFor(remoteAddress: string | undefined): boolean {
  if (isTruthyEnv(process.env.TRUST_PROXY_HEADERS)) return true;

  const normalizedRemoteAddress = normalizeIp(remoteAddress);
  if (!normalizedRemoteAddress) return false;

  return getTrustedProxyIps().has(normalizedRemoteAddress);
}

function getForwardedForIp(
  forwarded: string | string[] | undefined
): string | undefined {
  const forwardedValues = Array.isArray(forwarded)
    ? forwarded
    : forwarded
      ? [forwarded]
      : [];

  for (let i = forwardedValues.length - 1; i >= 0; i--) {
    const forwardedValue = forwardedValues[i];
    if (!forwardedValue) continue;

    const forwardedParts = forwardedValue
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const rightmostForwarded = forwardedParts[forwardedParts.length - 1];
    const normalizedForwarded = normalizeIp(rightmostForwarded);
    if (normalizedForwarded) return normalizedForwarded;
  }

  return undefined;
}

function getBucket(name: string, now: number): RateLimitBucket {
  let bucket = buckets.get(name);
  if (!bucket) {
    bucket = { entries: new Map(), lastSweepAt: now };
    buckets.set(name, bucket);
  }
  return bucket;
}

function sweepExpiredEntries(bucket: RateLimitBucket, now: number): void {
  for (const [key, entry] of bucket.entries) {
    if (now > entry.resetAt) bucket.entries.delete(key);
  }
  bucket.lastSweepAt = now;
}

// Called before a new key is inserted. The full scan for expired entries runs
// at most once per SWEEP_INTERVAL_MS. If the bucket is still at its cap, the
// oldest entries (Map iteration order is insertion order) are dropped one at a
// time, so a flood of distinct keys costs O(1) per request, not a rescan.
function makeRoomForNewKey(bucket: RateLimitBucket, now: number): void {
  if (now - bucket.lastSweepAt >= SWEEP_INTERVAL_MS) {
    sweepExpiredEntries(bucket, now);
  }
  while (bucket.entries.size >= MAX_KEYS_PER_BUCKET) {
    const oldestKey = bucket.entries.keys().next().value;
    if (oldestKey === undefined) break;
    bucket.entries.delete(oldestKey);
  }
}

export function checkRateLimit(
  bucketName: string,
  key: string,
  options: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  const bucket = getBucket(bucketName, now);
  const entry = bucket.entries.get(key);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + options.windowMs;
    if (entry) {
      // Re-insert so insertion order keeps tracking recency.
      bucket.entries.delete(key);
    } else {
      makeRoomForNewKey(bucket, now);
    }
    bucket.entries.set(key, { count: 1, resetAt });
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
  const remoteAddress = normalizeIp(req.socket?.remoteAddress);

  if (shouldTrustForwardedFor(remoteAddress)) {
    const forwardedIp = getForwardedForIp(req.headers["x-forwarded-for"]);
    if (forwardedIp) return forwardedIp;
  }

  return remoteAddress ?? "unknown";
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

// Exported for tests only.
export function __getRateLimitBucketSize(bucketName: string): number {
  return buckets.get(bucketName)?.entries.size ?? 0;
}
