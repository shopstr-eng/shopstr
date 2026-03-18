const SERVER_START_TIME = Date.now();

interface RequestRecord {
  timestamp: number;
  durationMs: number;
  success: boolean;
  tool?: string;
}

const MAX_RECORDS = 10000;
const records: RequestRecord[] = [];

const onboardAttempts = new Map<
  string,
  { count: number; windowStart: number }
>();

export function recordRequest(
  durationMs: number,
  success: boolean,
  tool?: string
) {
  records.push({ timestamp: Date.now(), durationMs, success, tool });
  if (records.length > MAX_RECORDS) {
    records.splice(0, records.length - MAX_RECORDS);
  }
}

export function getMetrics() {
  const now = Date.now();
  const uptimeMs = now - SERVER_START_TIME;

  const recentWindow = 5 * 60 * 1000;
  const recentRecords = records.filter((r) => now - r.timestamp < recentWindow);

  const totalRequests = records.length;
  const totalErrors = records.filter((r) => !r.success).length;
  const successRate =
    totalRequests > 0
      ? parseFloat(((1 - totalErrors / totalRequests) * 100).toFixed(2))
      : 100;

  const durations = recentRecords
    .map((r) => r.durationMs)
    .sort((a, b) => a - b);

  const p50 = percentile(durations, 50);
  const p95 = percentile(durations, 95);
  const p99 = percentile(durations, 99);

  const requestsPerMinute =
    recentRecords.length > 0
      ? parseFloat((recentRecords.length / (recentWindow / 60000)).toFixed(1))
      : 0;

  return {
    status: "operational" as const,
    uptime: {
      startedAt: new Date(SERVER_START_TIME).toISOString(),
      durationSeconds: Math.floor(uptimeMs / 1000),
      durationHuman: formatDuration(uptimeMs),
    },
    latency: {
      p50,
      p95,
      p99,
      unit: "ms",
      sampleSize: durations.length,
      window: "5m",
    },
    throughput: {
      requestsPerMinute,
      totalRequests,
      recentRequests: recentRecords.length,
    },
    reliability: {
      successRate,
      errorRate: parseFloat((100 - successRate).toFixed(2)),
      totalErrors,
    },
  };
}

function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function checkOnboardRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const maxAttempts = 10;

  const entry = onboardAttempts.get(ip);
  if (!entry || now - entry.windowStart > windowMs) {
    onboardAttempts.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= maxAttempts) return false;
  entry.count++;
  return true;
}
