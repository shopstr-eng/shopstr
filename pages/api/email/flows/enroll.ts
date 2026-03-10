import { NextApiRequest, NextApiResponse } from "next";
import {
  getEmailFlows,
  enrollInFlow,
  scheduleStepExecutions,
  getFlowEnrollments,
} from "@/utils/db/db-service";
import { FlowType } from "@/utils/email/flow-email-templates";

const VALID_FLOW_TYPES: FlowType[] = [
  "welcome_series",
  "abandoned_cart",
  "post_purchase",
  "winback",
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    flow_type,
    seller_pubkey,
    recipient_email,
    recipient_pubkey,
    enrollment_data,
  } = req.body;

  if (!flow_type || !seller_pubkey || !recipient_email) {
    return res.status(400).json({
      error: "flow_type, seller_pubkey, and recipient_email are required",
    });
  }

  if (!VALID_FLOW_TYPES.includes(flow_type)) {
    return res.status(400).json({
      error: `Invalid flow_type. Must be one of: ${VALID_FLOW_TYPES.join(
        ", "
      )}`,
    });
  }

  try {
    const flows = await getEmailFlows(seller_pubkey);
    const activeFlow = flows.find(
      (f) => f.flow_type === flow_type && f.status === "active"
    );

    if (!activeFlow) {
      return res.status(404).json({
        error: `No active ${flow_type} flow found for this seller`,
      });
    }

    const existingEnrollments = await getFlowEnrollments(activeFlow.id);
    const alreadyEnrolled = existingEnrollments.some(
      (e) => e.recipient_email === recipient_email && e.status === "active"
    );

    if (alreadyEnrolled) {
      return res.status(409).json({
        error: "Recipient is already enrolled in this flow",
      });
    }

    const mergedData = {
      ...(enrollment_data || {}),
      shop_name: enrollment_data?.shop_name || activeFlow.from_name || "Shop",
    };

    const enrollment = await enrollInFlow({
      flow_id: activeFlow.id,
      recipient_email,
      recipient_pubkey: recipient_pubkey || null,
      enrollment_data: mergedData,
    });

    const executions = await scheduleStepExecutions(
      enrollment.id,
      activeFlow.id
    );

    return res.status(200).json({
      success: true,
      enrollment,
      scheduled_executions: executions.length,
    });
  } catch (error) {
    console.error("Error enrolling in email flow:", error);
    return res.status(500).json({ error: "Failed to enroll in flow" });
  }
}
