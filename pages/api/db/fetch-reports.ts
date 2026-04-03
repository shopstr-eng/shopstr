import type { NextApiRequest, NextApiResponse } from "next";
import { fetchAllReportsFromDb } from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const reports = await fetchAllReportsFromDb();
    res.status(200).json(reports);
  } catch (error) {
    console.error("Failed to fetch reports from database:", error);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
}
