import { NextApiRequest, NextApiResponse } from "next";
import {
  getEmailFlow,
  getFlowSteps,
  createFlowStep,
  updateFlowStep,
  reorderFlowSteps,
} from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { flowId } = req.query;
  const id = parseInt(flowId as string, 10);

  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid flow ID" });
  }

  if (req.method === "GET") {
    const { seller_pubkey } = req.query;

    if (!seller_pubkey || typeof seller_pubkey !== "string") {
      return res.status(400).json({ error: "seller_pubkey is required" });
    }

    try {
      const flow = await getEmailFlow(id);
      if (!flow) {
        return res.status(404).json({ error: "Flow not found" });
      }
      if (flow.seller_pubkey !== seller_pubkey) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const steps = await getFlowSteps(id);
      return res.status(200).json({ steps });
    } catch (error) {
      console.error("Error fetching flow steps:", error);
      return res.status(500).json({ error: "Failed to fetch flow steps" });
    }
  }

  if (req.method === "POST") {
    const { seller_pubkey, step_order, subject, body_html, delay_hours } =
      req.body;

    if (!seller_pubkey) {
      return res.status(400).json({ error: "seller_pubkey is required" });
    }

    if (!subject || !body_html) {
      return res
        .status(400)
        .json({ error: "subject and body_html are required" });
    }

    try {
      const flow = await getEmailFlow(id);
      if (!flow) {
        return res.status(404).json({ error: "Flow not found" });
      }
      if (flow.seller_pubkey !== seller_pubkey) {
        return res.status(403).json({ error: "Not authorized" });
      }

      let order = step_order;
      if (order === undefined) {
        const existingSteps = await getFlowSteps(id);
        order =
          existingSteps.length > 0
            ? Math.max(...existingSteps.map((s) => s.step_order)) + 1
            : 1;
      }

      const step = await createFlowStep({
        flow_id: id,
        step_order: order,
        subject,
        body_html,
        delay_hours: delay_hours ?? 0,
      });

      return res.status(201).json({ step });
    } catch (error) {
      console.error("Error creating flow step:", error);
      return res.status(500).json({ error: "Failed to create flow step" });
    }
  }

  if (req.method === "PUT") {
    const { seller_pubkey, steps } = req.body;

    if (!seller_pubkey) {
      return res.status(400).json({ error: "seller_pubkey is required" });
    }

    try {
      const flow = await getEmailFlow(id);
      if (!flow) {
        return res.status(404).json({ error: "Flow not found" });
      }
      if (flow.seller_pubkey !== seller_pubkey) {
        return res.status(403).json({ error: "Not authorized" });
      }

      if (Array.isArray(steps)) {
        const hasReorder = steps.every(
          (s: any) => s.id !== undefined && s.step_order !== undefined
        );
        if (hasReorder) {
          const sortedSteps = [...steps].sort(
            (a: any, b: any) => a.step_order - b.step_order
          );
          await reorderFlowSteps(
            id,
            sortedSteps.map((s: any) => s.id)
          );
        }

        const updatedSteps = [];
        for (const stepData of steps) {
          if (stepData.id) {
            const updated = await updateFlowStep(stepData.id, {
              subject: stepData.subject,
              body_html: stepData.body_html,
              delay_hours: stepData.delay_hours,
              step_order: stepData.step_order,
            });
            if (updated) updatedSteps.push(updated);
          }
        }

        const allSteps = await getFlowSteps(id);
        return res.status(200).json({ steps: allSteps });
      }

      return res.status(400).json({ error: "steps array is required for PUT" });
    } catch (error) {
      console.error("Error updating flow steps:", error);
      return res.status(500).json({ error: "Failed to update flow steps" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
