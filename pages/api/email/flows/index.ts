import { NextApiRequest, NextApiResponse } from "next";
import {
  createEmailFlow,
  getEmailFlows,
  createFlowStep,
} from "@/utils/db/db-service";
import {
  getDefaultFlowSteps,
  FlowType,
} from "@/utils/email/flow-email-templates";

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
  if (req.method === "GET") {
    const { seller_pubkey } = req.query;

    if (!seller_pubkey || typeof seller_pubkey !== "string") {
      return res.status(400).json({ error: "seller_pubkey is required" });
    }

    try {
      const flows = await getEmailFlows(seller_pubkey);
      return res.status(200).json({ flows });
    } catch (error) {
      console.error("Error fetching email flows:", error);
      return res.status(500).json({ error: "Failed to fetch email flows" });
    }
  }

  if (req.method === "POST") {
    const { seller_pubkey, name, flow_type, use_defaults } = req.body;

    if (!seller_pubkey || !name || !flow_type) {
      return res
        .status(400)
        .json({ error: "seller_pubkey, name, and flow_type are required" });
    }

    if (!VALID_FLOW_TYPES.includes(flow_type)) {
      return res.status(400).json({
        error: `Invalid flow_type. Must be one of: ${VALID_FLOW_TYPES.join(
          ", "
        )}`,
      });
    }

    try {
      const flow = await createEmailFlow({
        seller_pubkey,
        name,
        flow_type,
      });

      if (use_defaults !== false) {
        const defaultSteps = getDefaultFlowSteps(flow_type as FlowType);
        for (const step of defaultSteps) {
          await createFlowStep({
            flow_id: flow.id,
            step_order: step.step_order,
            subject: step.subject,
            body_html: step.body_html,
            delay_hours: step.delay_hours,
          });
        }
      }

      return res.status(201).json({ flow });
    } catch (error) {
      console.error("Error creating email flow:", error);
      return res.status(500).json({ error: "Failed to create email flow" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
