import type { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import {
  backfillProTrialsOnce,
  backfillManualCoverageOnce,
} from "@/utils/pro/membership";
import { runProLifecycle } from "@/utils/pro/lifecycle";
import { expirePastDueManualInvoices } from "@/utils/db/pro-membership";

// Internal cron for the Pro lifecycle. Gated by FLOW_PROCESSOR_SECRET, invoked
// by the internal scheduler (see utils/email/flow-scheduler.ts). Runs the
// one-time trial backfill, expires overdue manual invoices, and sends the
// transition reminders/notices.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (
    !applyRateLimit(req, res, "pro-cron-lifecycle", {
      limit: 10,
      windowMs: 60_000,
    })
  )
    return;

  const secret = req.headers["x-flow-processor-secret"] || req.body?.secret;
  const expectedSecret = process.env.FLOW_PROCESSOR_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const backfill = await backfillProTrialsOnce();
    const coverageBackfill = await backfillManualCoverageOnce();
    const expiredInvoices = await expirePastDueManualInvoices();
    const lifecycle = await runProLifecycle();

    return res.status(200).json({
      ok: true,
      backfill,
      coverageBackfill,
      expiredInvoices,
      lifecycle,
    });
  } catch (error) {
    console.error("pro cron-lifecycle failed:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Lifecycle run failed",
    });
  }
}
