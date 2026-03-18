import type { NextApiRequest, NextApiResponse } from "next";
import { fetchAllProfilesFromDb } from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const profiles = await fetchAllProfilesFromDb();
    res.status(200).json(profiles);
  } catch (error) {
    console.error("Failed to fetch profiles from database:", error);
    res.status(500).json({ error: "Failed to fetch profiles" });
  }
}
