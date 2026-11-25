import {
  __getRateLimitBucketSize,
  __resetRateLimitBuckets,
  checkRateLimit,
  getRequestIp,
  MAX_KEYS_PER_BUCKET,
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

describe("checkRateLimit memory bounds", () => {
  const realNow = Date.now;
  let current: number;

  beforeEach(() => {
    __resetRateLimitBuckets();
    current = 1_000_000;
    Date.now = () => current;
  });

  afterEach(() => {
    Date.now = realNow;
  });

  it("drops expired keys when a new key arrives after the sweep interval", () => {
    const opts = { limit: 5, windowMs: 1_000 };
    for (let i = 0; i < 100; i++) {
      checkRateLimit("bucket", `ip-${i}`, opts);
    }
    expect(__getRateLimitBucketSize("bucket")).toBe(100);

    current += 61_000;
    checkRateLimit("bucket", "fresh-ip", opts);

    expect(__getRateLimitBucketSize("bucket")).toBe(1);
  });

  it("does not sweep on every insert, only once per sweep interval", () => {
    const opts = { limit: 5, windowMs: 1_000 };
    checkRateLimit("bucket", "ip-a", opts);

    current += 5_000; // ip-a is expired but the sweep interval has not elapsed
    checkRateLimit("bucket", "ip-b", opts);

    expect(__getRateLimitBucketSize("bucket")).toBe(2);
  });

  it("keeps unexpired counters intact while sweeping expired keys", () => {
    const longWindow = { limit: 1, windowMs: 10 * 60_000 };
    const shortWindow = { limit: 5, windowMs: 1_000 };
    expect(checkRateLimit("bucket", "limited-ip", longWindow).ok).toBe(true);
    for (let i = 0; i < 50; i++) {
      checkRateLimit("bucket", `ip-${i}`, shortWindow);
    }

    current += 61_000;
    checkRateLimit("bucket", "fresh-ip", shortWindow); // triggers the sweep

    expect(__getRateLimitBucketSize("bucket")).toBe(2);
    expect(checkRateLimit("bucket", "limited-ip", longWindow).ok).toBe(false);
  });

  it("starts a fresh window for a key whose entry was swept", () => {
    const opts = { limit: 1, windowMs: 1_000 };
    expect(checkRateLimit("bucket", "ip-a", opts).ok).toBe(true);
    expect(checkRateLimit("bucket", "ip-a", opts).ok).toBe(false);

    current += 61_000;
    checkRateLimit("bucket", "ip-b", opts); // sweeps ip-a

    expect(checkRateLimit("bucket", "ip-a", opts).ok).toBe(true);
  });

  it("caps the number of keys per bucket when many distinct keys arrive in one window", () => {
    const opts = { limit: 1, windowMs: 60 * 60_000 };
    const total = MAX_KEYS_PER_BUCKET + 250;
    for (let i = 0; i < total; i++) {
      checkRateLimit("bucket", `ip-${i}`, opts);
    }

    expect(__getRateLimitBucketSize("bucket")).toBe(MAX_KEYS_PER_BUCKET);
  });

  it("evicts the oldest keys first when the cap is reached", () => {
    const opts = { limit: 1, windowMs: 60 * 60_000 };
    for (let i = 0; i < MAX_KEYS_PER_BUCKET + 1; i++) {
      checkRateLimit("bucket", `ip-${i}`, opts);
    }

    // The newest key is still tracked (second hit is denied)...
    expect(checkRateLimit("bucket", `ip-${MAX_KEYS_PER_BUCKET}`, opts).ok).toBe(
      false
    );
    // ...while the oldest was evicted and starts over.
    expect(checkRateLimit("bucket", "ip-0", opts).ok).toBe(true);
  });

  it("bounds each bucket independently", () => {
    const opts = { limit: 1, windowMs: 60 * 60_000 };
    for (let i = 0; i < MAX_KEYS_PER_BUCKET + 10; i++) {
      checkRateLimit("bucket-a", `ip-${i}`, opts);
    }
    checkRateLimit("bucket-b", "ip-a", opts);

    expect(__getRateLimitBucketSize("bucket-a")).toBe(MAX_KEYS_PER_BUCKET);
    expect(__getRateLimitBucketSize("bucket-b")).toBe(1);
  });
});

describe("getRequestIp", () => {
  const originalTrustProxyHeaders = process.env.TRUST_PROXY_HEADERS;
  const originalTrustedProxyIps = process.env.TRUSTED_PROXY_IPS;

  beforeEach(() => {
    delete process.env.TRUST_PROXY_HEADERS;
    delete process.env.TRUSTED_PROXY_IPS;
  });

  afterEach(() => {
    if (originalTrustProxyHeaders === undefined) {
      delete process.env.TRUST_PROXY_HEADERS;
    } else {
      process.env.TRUST_PROXY_HEADERS = originalTrustProxyHeaders;
    }

    if (originalTrustedProxyIps === undefined) {
      delete process.env.TRUSTED_PROXY_IPS;
    } else {
      process.env.TRUSTED_PROXY_IPS = originalTrustedProxyIps;
    }
  });

  it("ignores x-forwarded-for unless proxy headers are trusted", () => {
    const req = {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      socket: { remoteAddress: "9.9.9.9" },
    } as any;
    expect(getRequestIp(req)).toBe("9.9.9.9");
  });

  it("uses the rightmost entry in x-forwarded-for when proxy headers are trusted", () => {
    process.env.TRUST_PROXY_HEADERS = "true";
    const req = {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      socket: { remoteAddress: "9.9.9.9" },
    } as any;
    expect(getRequestIp(req)).toBe("5.6.7.8");
  });

  it("uses the rightmost entry across repeated x-forwarded-for headers", () => {
    process.env.TRUST_PROXY_HEADERS = "true";
    const req = {
      headers: { "x-forwarded-for": ["1.2.3.4", "5.6.7.8, 6.7.8.9"] },
      socket: { remoteAddress: "9.9.9.9" },
    } as any;
    expect(getRequestIp(req)).toBe("6.7.8.9");
  });

  it("trusts x-forwarded-for when the direct peer is a trusted proxy", () => {
    process.env.TRUSTED_PROXY_IPS = "9.9.9.9";
    const req = {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      socket: { remoteAddress: "9.9.9.9" },
    } as any;
    expect(getRequestIp(req)).toBe("5.6.7.8");
  });

  it("ignores x-real-ip and falls back to the socket remote address", () => {
    const req = {
      headers: { "x-real-ip": "4.3.2.1" },
      socket: { remoteAddress: "9.9.9.9" },
    } as any;
    expect(getRequestIp(req)).toBe("9.9.9.9");
  });

  it("falls back to the socket remote address", () => {
    const req = {
      headers: {},
      socket: { remoteAddress: "9.9.9.9" },
    } as any;
    expect(getRequestIp(req)).toBe("9.9.9.9");
  });

  it("normalizes IPv6-mapped IPv4 socket addresses", () => {
    const req = {
      headers: {},
      socket: { remoteAddress: "::ffff:9.9.9.9" },
    } as any;
    expect(getRequestIp(req)).toBe("9.9.9.9");
  });

  it("normalizes IPv6-mapped IPv4 forwarded addresses", () => {
    process.env.TRUST_PROXY_HEADERS = "true";
    const req = {
      headers: { "x-forwarded-for": "1.2.3.4, ::ffff:5.6.7.8" },
      socket: { remoteAddress: "9.9.9.9" },
    } as any;
    expect(getRequestIp(req)).toBe("5.6.7.8");
  });

  it("returns 'unknown' when nothing is available", () => {
    const req = { headers: {}, socket: {} } as any;
    expect(getRequestIp(req)).toBe("unknown");
  });
});
