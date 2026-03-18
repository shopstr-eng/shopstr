const requestDurations: number[] = [];
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
  totalRequests++;
  if (success) {
    successfulRequests++;
  } else {
    failedRequests++;
  }
  requestDurations.push(durationMs);
  if (requestDurations.length > 1000) {
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

export function getMetrics() {
  const uptimeMs = Date.now() - startTime;
  return {
    status: "healthy",
    uptime: {
      ms: uptimeMs,
      human: `${Math.floor(uptimeMs / 3600000)}h ${Math.floor(
        (uptimeMs % 3600000) / 60000
      )}m`,
    },
    latency: {
      p50: percentile(requestDurations, 50),
      p95: percentile(requestDurations, 95),
      p99: percentile(requestDurations, 99),
    },
    throughput: {
      total: totalRequests,
      successful: successfulRequests,
      failed: failedRequests,
      reliabilityRate:
        totalRequests > 0
          ? ((successfulRequests / totalRequests) * 100).toFixed(2) + "%"
          : "N/A",
    },
    toolUsage,
  };
}

export function checkOnboardRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = onboardRateLimits.get(ip);

  if (!entry || now > entry.resetAt) {
    onboardRateLimits.set(ip, { count: 1, resetAt: now + 3600000 });
    return true;
  }

  if (entry.count >= 10) {
    return false;
  }

  entry.count++;
  return true;
}
