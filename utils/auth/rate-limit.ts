import type { NextApiRequest, NextApiResponse } from "next";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

function getStore(name: string): Map<string, RateLimitEntry> {
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  return stores.get(name)!;
}

export interface RateLimitConfig {
  name: string;
  windowMs: number;
  maxRequests: number;
  keyFn?: (req: NextApiRequest) => string;
}

export function rateLimit(config: RateLimitConfig) {
  const { name, windowMs, maxRequests, keyFn } = config;

  return async function check(
    req: NextApiRequest,
    res: NextApiResponse
  ): Promise<boolean> {
    const store = getStore(name);
    const now = Date.now();

    for (const [key, entry] of store) {
      if (entry.resetAt < now) store.delete(key);
    }

    const identifier = keyFn
      ? keyFn(req)
      : (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.socket.remoteAddress ||
        "unknown";

    const entry = store.get(identifier);

    if (!entry || entry.resetAt < now) {
      store.set(identifier, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter.toString());
      res.status(429).json({
        error: "Too many requests. Please try again later.",
        retryAfterSeconds: retryAfter,
      });
      return false;
    }

    entry.count++;
    return true;
  };
}

export const recoveryRequestLimiter = rateLimit({
  name: "recovery-request",
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
});

export const recoveryVerifyLimiter = rateLimit({
  name: "recovery-verify",
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
});

export const recoveryResetLimiter = rateLimit({
  name: "recovery-reset",
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
});

export const recoverySetupVerifyLimiter = rateLimit({
  name: "recovery-setup-verify",
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
});
