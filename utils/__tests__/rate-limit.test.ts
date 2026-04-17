import {
  __resetRateLimitBuckets,
  checkRateLimit,
  getRequestIp,
} from "@/utils/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    __resetRateLimitBuckets();
  });

  it("allows requests below the limit and denies once exceeded", () => {
    const opts = { limit: 3, windowMs: 60_000 };
    expect(checkRateLimit("bucket", "ip-a", opts).ok).toBe(true);
    expect(checkRateLimit("bucket", "ip-a", opts).ok).toBe(true);
    expect(checkRateLimit("bucket", "ip-a", opts).ok).toBe(true);
    const denied = checkRateLimit("bucket", "ip-a", opts);
    expect(denied.ok).toBe(false);
    expect(denied.remaining).toBe(0);
  });

  it("tracks separate keys independently", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect(checkRateLimit("bucket", "ip-a", opts).ok).toBe(true);
    expect(checkRateLimit("bucket", "ip-b", opts).ok).toBe(true);
    expect(checkRateLimit("bucket", "ip-a", opts).ok).toBe(false);
    expect(checkRateLimit("bucket", "ip-b", opts).ok).toBe(false);
  });

  it("tracks separate buckets independently", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect(checkRateLimit("bucket-x", "ip-a", opts).ok).toBe(true);
    expect(checkRateLimit("bucket-y", "ip-a", opts).ok).toBe(true);
    expect(checkRateLimit("bucket-x", "ip-a", opts).ok).toBe(false);
  });

  it("resets after the window elapses", () => {
    const realNow = Date.now;
    let current = 1_000_000;
    Date.now = () => current;
    try {
      const opts = { limit: 1, windowMs: 1_000 };
      expect(checkRateLimit("bucket", "ip-a", opts).ok).toBe(true);
      expect(checkRateLimit("bucket", "ip-a", opts).ok).toBe(false);
      current += 1_500;
      expect(checkRateLimit("bucket", "ip-a", opts).ok).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });
});

describe("getRequestIp", () => {
  it("prefers the first entry in x-forwarded-for", () => {
    const req = {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      socket: { remoteAddress: "9.9.9.9" },
    } as any;
    expect(getRequestIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = {
      headers: { "x-real-ip": "4.3.2.1" },
      socket: { remoteAddress: "9.9.9.9" },
    } as any;
    expect(getRequestIp(req)).toBe("4.3.2.1");
  });

  it("falls back to the socket remote address", () => {
    const req = {
      headers: {},
      socket: { remoteAddress: "9.9.9.9" },
    } as any;
    expect(getRequestIp(req)).toBe("9.9.9.9");
  });

  it("returns 'unknown' when nothing is available", () => {
    const req = { headers: {}, socket: {} } as any;
    expect(getRequestIp(req)).toBe("unknown");
  });
});
