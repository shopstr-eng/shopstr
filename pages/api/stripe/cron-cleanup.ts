import { NextApiRequest, NextApiResponse } from "next";
import { pruneStripeProcessedEvents } from "@/utils/stripe/processed-events";
import { pruneStripePendingPayments } from "@/utils/stripe/pending-payments";
import { applyRateLimit } from "@/utils/rate-limit";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (
    !applyRateLimit(req, res, "stripe-cron-cleanup", {
      limit: 5,
      windowMs: 60_000,
    })
  )
    return;

  const secret = req.headers["x-flow-processor-secret"] || req.body?.secret;
  const expectedSecret = process.env.FLOW_PROCESSOR_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const processedEventsMaxAgeDays = Math.max(
    parseInt(req.body?.processed_events_max_age_days) || 45,
    7
  );
  const pendingPaymentsMaxAgeDays = Math.max(
    parseInt(req.body?.pending_payments_max_age_days) || 30,
    7
  );

  try {
    const [prunedEvents, prunedPendingPayments] = await Promise.all([
      pruneStripeProcessedEvents(processedEventsMaxAgeDays * DAY_MS),
      pruneStripePendingPayments(pendingPaymentsMaxAgeDays * DAY_MS),
    ]);

    return res.status(200).json({
      prunedEvents,
      prunedPendingPayments,
      processedEventsMaxAgeDays,
      pendingPaymentsMaxAgeDays,
    });
  } catch (error) {
    console.error("stripe cron-cleanup failed:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Cleanup failed",
    });
  }
}
