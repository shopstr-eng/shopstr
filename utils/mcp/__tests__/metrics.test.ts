const BASE_TIME_MS = Date.UTC(2026, 0, 1, 0, 0, 0);
const ONE_MINUTE_MS = 60 * 1000;
const FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const MAX_REQUEST_RECORDS = 10000;

describe("MCP metrics helpers", () => {
  let metricsModule: typeof import("../metrics");
  let compatModule: typeof import("../metric");

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME_MS);

    metricsModule = await import("../metrics");
    compatModule = await import("../metric");
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("tracks current metrics behavior and exposes additive observability fields", () => {
    metricsModule.recordRequest(100, true, "search_products");
    metricsModule.recordRequest(300, false, "search_products");
    metricsModule.recordRequest(500, true, "get_product_details");

    const metrics = metricsModule.getMetrics();

    expect(metrics.status).toBe("healthy");
    expect(metrics.uptime.ms).toBe(0);
    expect(metrics.uptime.human).toBe("0h 0m");
    expect(metrics.uptime.startedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(metrics.uptime.durationSeconds).toBe(0);
    expect(metrics.uptime.durationHuman).toBe("0s");

    expect(metrics.latency).toEqual({
      p50: 300,
      p95: 500,
      p99: 500,
      unit: "ms",
      sampleSize: 3,
      window: "5m",
    });

    expect(metrics.throughput).toEqual({
      total: 3,
      successful: 2,
      failed: 1,
      reliabilityRate: "66.67%",
      requestsPerMinute: 0.6,
      recentRequests: 3,
    });

    expect(metrics.toolUsage).toEqual({
      search_products: 2,
      get_product_details: 1,
    });
  });

  it("keeps cumulative counters while recent-window fields only include the last five minutes", () => {
    metricsModule.recordRequest(100, true, "older_request");

    jest.advanceTimersByTime(FIVE_MINUTES_MS + ONE_MINUTE_MS);

    metricsModule.recordRequest(200, false, "recent_request");
    const metrics = metricsModule.getMetrics();

    expect(metrics.latency.p50).toBe(100);
    expect(metrics.latency.p95).toBe(200);
    expect(metrics.latency.p99).toBe(200);
    expect(metrics.latency.sampleSize).toBe(1);

    expect(metrics.throughput.total).toBe(2);
    expect(metrics.throughput.successful).toBe(1);
    expect(metrics.throughput.failed).toBe(1);
    expect(metrics.throughput.reliabilityRate).toBe("50.00%");
    expect(metrics.throughput.requestsPerMinute).toBe(0.2);
    expect(metrics.throughput.recentRequests).toBe(1);

    expect(metrics.toolUsage).toEqual({
      older_request: 1,
      recent_request: 1,
    });
  });

  it("resets onboarding rate limits after the existing one-hour window", () => {
    for (let i = 0; i < 10; i += 1) {
      expect(metricsModule.checkOnboardRateLimit("127.0.0.1")).toBe(true);
    }

    expect(metricsModule.checkOnboardRateLimit("127.0.0.1")).toBe(false);

    jest.advanceTimersByTime(ONE_HOUR_MS + 1);

    expect(metricsModule.checkOnboardRateLimit("127.0.0.1")).toBe(true);
  });

  it("shares state through the compatibility re-export", () => {
    compatModule.recordRequest(250, true, "compat_request");
    metricsModule.recordRequest(750, false, "live_request");

    const metricsFromCompat = compatModule.getMetrics();
    const metricsFromLive = metricsModule.getMetrics();

    expect(metricsFromCompat).toEqual(metricsFromLive);
    expect(metricsFromLive.throughput.total).toBe(2);
    expect(metricsFromLive.toolUsage).toEqual({
      compat_request: 1,
      live_request: 1,
    });
  });

  it("trims recent request records without changing all-time totals", () => {
    for (let i = 0; i < MAX_REQUEST_RECORDS + 1; i += 1) {
      metricsModule.recordRequest(100, true);
    }

    const metrics = metricsModule.getMetrics();

    expect(metrics.throughput.total).toBe(MAX_REQUEST_RECORDS + 1);
    expect(metrics.throughput.successful).toBe(MAX_REQUEST_RECORDS + 1);
    expect(metrics.throughput.failed).toBe(0);
    expect(metrics.throughput.reliabilityRate).toBe("100.00%");
    expect(metrics.throughput.recentRequests).toBe(MAX_REQUEST_RECORDS);
    expect(metrics.latency.sampleSize).toBe(MAX_REQUEST_RECORDS);
  });
});
