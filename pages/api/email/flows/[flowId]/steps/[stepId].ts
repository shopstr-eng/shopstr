import { NextApiRequest, NextApiResponse } from "next";
import {
  getEmailFlow,
  updateFlowStep,
  deleteFlowStep,
} from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { flowId, stepId } = req.query;
  const flowIdNum = parseInt(flowId as string, 10);
  const stepIdNum = parseInt(stepId as string, 10);

  if (isNaN(flowIdNum) || isNaN(stepIdNum)) {
    return res.status(400).json({ error: "Invalid flow ID or step ID" });
  }

  if (req.method === "PUT") {
    const { seller_pubkey, subject, body_html, delay_hours, step_order } =
      req.body;

    if (!seller_pubkey) {
      return res.status(400).json({ error: "seller_pubkey is required" });
    }

    try {
      const flow = await getEmailFlow(flowIdNum);
      if (!flow) {
        return res.status(404).json({ error: "Flow not found" });
      }
      if (flow.seller_pubkey !== seller_pubkey) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const updated = await updateFlowStep(stepIdNum, {
        subject,
        body_html,
        delay_hours,
        step_order,
      });

      if (!updated) {
        return res.status(404).json({ error: "Step not found" });
      }

      return res.status(200).json({ step: updated });
    } catch (error) {
      console.error("Error updating flow step:", error);
      return res.status(500).json({ error: "Failed to update flow step" });
    }
  }

  if (req.method === "DELETE") {
    const { seller_pubkey } = req.query;

    if (!seller_pubkey || typeof seller_pubkey !== "string") {
      return res.status(400).json({ error: "seller_pubkey is required" });
    }

    try {
      const flow = await getEmailFlow(flowIdNum);
      if (!flow) {
        return res.status(404).json({ error: "Flow not found" });
      }
      if (flow.seller_pubkey !== seller_pubkey) {
        return res.status(403).json({ error: "Not authorized" });
      }

      await deleteFlowStep(stepIdNum);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error deleting flow step:", error);
      return res.status(500).json({ error: "Failed to delete flow step" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
