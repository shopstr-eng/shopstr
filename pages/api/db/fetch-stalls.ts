import type { NextApiRequest, NextApiResponse } from "next";
import { fetchAllStallsFromDb } from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const stalls = await fetchAllStallsFromDb();
    res.status(200).json(stalls);
  } catch (error) {
    console.error("Failed to fetch stalls from database:", error);
    res.status(500).json({ error: "Failed to fetch stalls" });
  }
}
