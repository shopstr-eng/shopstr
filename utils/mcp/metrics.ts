interface RequestRecord {
  timestamp: number;
  durationMs: number;
  success: boolean;
  tool?: string;
}

const MAX_REQUEST_DURATION_SAMPLES = 1000;
const MAX_REQUEST_RECORDS = 10000;
const RECENT_WINDOW_MS = 5 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

const requestDurations: number[] = [];
const requestRecords: RequestRecord[] = [];
let totalRequests = 0;
let successfulRequests = 0;
let failedRequests = 0;
const toolUsage: Record<string, number> = {};
const startTime = Date.now();

const onboardRateLimits = new Map<string, { count: number; resetAt: number }>();

export function recordRequest(
  durationMs: number,
  success: boolean,
  toolName?: string
) {
  requestRecords.push({
    timestamp: Date.now(),
    durationMs,
    success,
    tool: toolName,
  });
  if (requestRecords.length > MAX_REQUEST_RECORDS) {
    requestRecords.shift();
  }

  totalRequests++;
  if (success) {
    successfulRequests++;
  } else {
    failedRequests++;
  }
  requestDurations.push(durationMs);
  if (requestDurations.length > MAX_REQUEST_DURATION_SAMPLES) {
    requestDurations.shift();
  }
  if (toolName) {
    toolUsage[toolName] = (toolUsage[toolName] || 0) + 1;
  }
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
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

export function getMetrics() {
  const now = Date.now();
  const uptimeMs = now - startTime;
  const recentRecords = requestRecords.filter(
    (record) => now - record.timestamp < RECENT_WINDOW_MS
  );
  return {
    status: "operational" as const,
    uptime: {
      ms: uptimeMs,
      human: `${Math.floor(uptimeMs / 3600000)}h ${Math.floor(
        (uptimeMs % 3600000) / 60000
      )}m`,
      startedAt: new Date(startTime).toISOString(),
      durationSeconds: Math.floor(uptimeMs / 1000),
      durationHuman: formatDuration(uptimeMs),
    },
    latency: {
      p50: percentile(requestDurations, 50),
      p95: percentile(requestDurations, 95),
      p99: percentile(requestDurations, 99),
      unit: "ms",
      sampleSize: recentRecords.length,
      window: "5m",
    },
    throughput: {
      total: totalRequests,
      successful: successfulRequests,
      failed: failedRequests,
      reliabilityRate:
        totalRequests > 0
          ? ((successfulRequests / totalRequests) * 100).toFixed(2) + "%"
          : "N/A",
      requestsPerMinute:
        recentRecords.length > 0
          ? parseFloat(
              (recentRecords.length / (RECENT_WINDOW_MS / 60000)).toFixed(1)
            )
          : 0,
      recentRequests: recentRecords.length,
    },
  };
}

export function checkOnboardRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = onboardRateLimits.get(ip);

  if (!entry || now > entry.resetAt) {
    onboardRateLimits.set(ip, { count: 1, resetAt: now + ONE_HOUR_MS });
    return true;
  }

  if (entry.count >= 10) {
    return false;
  }

  entry.count++;
  return true;
}
