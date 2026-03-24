import { NextApiRequest, NextApiResponse } from "next";
import { getEmailFlow, updateEmailFlow } from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { flowId } = req.query;
  const id = parseInt(flowId as string, 10);

  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid flow ID" });
  }

  const { seller_pubkey } = req.body;

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

    const newStatus = flow.status === "active" ? "paused" : "active";
    const updated = await updateEmailFlow(id, { status: newStatus });

    return res.status(200).json({ flow: updated });
  } catch (error) {
    console.error("Error toggling email flow:", error);
    return res.status(500).json({ error: "Failed to toggle email flow" });
  }
}
