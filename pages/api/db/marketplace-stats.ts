import type { NextApiRequest, NextApiResponse } from "next";
import { fetchMarketplaceStats } from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const stats = await fetchMarketplaceStats();
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");
    res.status(200).json(stats);
  } catch (error) {
    console.error("Failed to fetch marketplace stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
}
