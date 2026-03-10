import { NextApiRequest, NextApiResponse } from "next";
import {
  getWinbackCandidates,
  getEmailFlows,
  enrollInFlow,
  scheduleStepExecutions,
  getFlowEnrollments,
} from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = req.headers["x-flow-processor-secret"] || req.body?.secret;
  const expectedSecret = process.env.FLOW_PROCESSOR_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const inactiveDays = Math.max(parseInt(req.body?.inactive_days) || 30, 7);

  try {
    const candidates = await getWinbackCandidates(inactiveDays);

    if (candidates.length === 0) {
      return res.status(200).json({ processed: 0, enrolled: 0, skipped: 0 });
    }

    let enrolled = 0;
    let skipped = 0;
    const errors: string[] = [];

    const sellerFlowCache: Record<string, any> = {};

    for (const candidate of candidates) {
      try {
        if (!sellerFlowCache[candidate.seller_pubkey]) {
          const flows = await getEmailFlows(candidate.seller_pubkey);
          sellerFlowCache[candidate.seller_pubkey] = flows.find(
            (f) => f.flow_type === "winback" && f.status === "active"
          );
        }

        const activeFlow = sellerFlowCache[candidate.seller_pubkey];

        if (!activeFlow) {
          skipped++;
          continue;
        }

        const existingEnrollments = await getFlowEnrollments(activeFlow.id);
        const alreadyEnrolled = existingEnrollments.some(
          (e) =>
            e.recipient_email === candidate.buyer_email && e.status === "active"
        );

        if (alreadyEnrolled) {
          skipped++;
          continue;
        }

        const baseUrl =
          process.env.NEXT_PUBLIC_BASE_URL || "https://shopstr.store";

        const enrollmentData = {
          buyer_name: "",
          shop_name: activeFlow.from_name || "Shop",
          shop_url: `${baseUrl}/${candidate.seller_pubkey}`,
        };

        const enrollment = await enrollInFlow({
          flow_id: activeFlow.id,
          recipient_email: candidate.buyer_email,
          recipient_pubkey: candidate.buyer_pubkey,
          enrollment_data: enrollmentData,
        });

        await scheduleStepExecutions(enrollment.id, activeFlow.id);
        enrolled++;
      } catch (error: any) {
        errors.push(
          `${candidate.buyer_email}: ${error?.message || "Unknown error"}`
        );
        skipped++;
      }
    }

    return res.status(200).json({
      processed: candidates.length,
      enrolled,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error processing winback candidates:", error);
    return res
      .status(500)
      .json({ error: "Failed to process winback candidates" });
  }
}
