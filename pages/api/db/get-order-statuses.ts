import type { NextApiRequest, NextApiResponse } from "next";
import { getOrderStatuses } from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const orderIds =
    req.method === "POST" ? req.body.orderIds : req.query.orderIds;

  if (!orderIds || (Array.isArray(orderIds) && orderIds.length === 0)) {
    return res.status(200).json({ statuses: {} });
  }

  const orderIdArray = Array.isArray(orderIds) ? orderIds : [orderIds];

  try {
    const statuses = await getOrderStatuses(orderIdArray);
    return res.status(200).json({ statuses });
  } catch (error) {
    console.error("Failed to get order statuses:", error);
    return res.status(500).json({ error: "Failed to get order statuses" });
  }
}
