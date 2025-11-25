import type { NextApiRequest, NextApiResponse } from "next";
import { fetchAllCommunitiesFromDb } from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const communities = await fetchAllCommunitiesFromDb();
    res.status(200).json(communities);
  } catch (error) {
    console.error("Failed to fetch communities from database:", error);
    res.status(500).json({ error: "Failed to fetch communities" });
  }
}
