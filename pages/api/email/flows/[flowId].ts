import { NextApiRequest, NextApiResponse } from "next";
import {
  getEmailFlow,
  updateEmailFlow,
  deleteEmailFlow,
} from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!applyRateLimit(req, res, "email-flows-flow-id", RATE_LIMIT)) return;

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
      return res.status(200).json({ flow });
    } catch (error) {
      console.error("Error fetching email flow:", error);
      return res.status(500).json({ error: "Failed to fetch email flow" });
    }
  }

  if (req.method === "PUT") {
    const { seller_pubkey, name, status, from_name, reply_to } = req.body;

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

      const updated = await updateEmailFlow(id, {
        name,
        status,
        from_name,
        reply_to,
      });
      return res.status(200).json({ flow: updated });
    } catch (error) {
      console.error("Error updating email flow:", error);
      return res.status(500).json({ error: "Failed to update email flow" });
    }
  }

  if (req.method === "DELETE") {
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

      await deleteEmailFlow(id);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error deleting email flow:", error);
      return res.status(500).json({ error: "Failed to delete email flow" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
