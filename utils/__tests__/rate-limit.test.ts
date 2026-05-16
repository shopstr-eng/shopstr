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
