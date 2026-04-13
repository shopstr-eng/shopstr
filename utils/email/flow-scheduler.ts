let schedulerStarted = false;

function getBaseUrl(): string {
  const port = process.env.PORT || 5000;
  return `http://localhost:${port}`;
}

async function callEndpoint(path: string, body: Record<string, any> = {}) {
  const secret = process.env.FLOW_PROCESSOR_SECRET;
  if (!secret) return;

  try {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-flow-processor-secret": secret,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.processed > 0 || data.enrolled > 0) {
      console.log(`[flow-scheduler] ${path}:`, data);
    }
  } catch (error: any) {
    if (
      error?.cause?.code !== "ECONNREFUSED" &&
      error?.code !== "ECONNREFUSED"
    ) {
      console.error(`[flow-scheduler] ${path} error:`, error?.message);
    }
  }
}

async function processEmails() {
  await callEndpoint("/api/email/flows/process", { batch_size: 50 });
}

async function processAbandonedCarts() {
  await callEndpoint("/api/email/flows/cron-abandoned-cart", {
    stale_minutes: 60,
  });
}

async function processWinback() {
  await callEndpoint("/api/email/flows/cron-winback", { inactive_days: 30 });
}

export function startFlowScheduler() {
  if (schedulerStarted) return;
  if (!process.env.FLOW_PROCESSOR_SECRET) {
    console.log(
      "[flow-scheduler] FLOW_PROCESSOR_SECRET not set, scheduler disabled"
    );
    return;
  }

  if (process.env.NODE_ENV === "development") {
    console.log(
      "[flow-scheduler] Skipping scheduler in development mode to reduce memory pressure"
    );
    return;
  }

  schedulerStarted = true;
  console.log("[flow-scheduler] Starting email flow scheduler");

  const PROCESS_INTERVAL = 2 * 60 * 1000;
  const ABANDONED_CART_INTERVAL = 30 * 60 * 1000;
  const WINBACK_INTERVAL = 24 * 60 * 60 * 1000;

  setTimeout(() => processEmails(), 30 * 1000);
  setInterval(() => processEmails(), PROCESS_INTERVAL);

  setTimeout(() => processAbandonedCarts(), 60 * 1000);
  setInterval(() => processAbandonedCarts(), ABANDONED_CART_INTERVAL);

  setTimeout(() => processWinback(), 2 * 60 * 1000);
  setInterval(() => processWinback(), WINBACK_INTERVAL);
}
