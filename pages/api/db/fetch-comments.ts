import type { NextApiRequest, NextApiResponse } from "next";
import { fetchCachedEvents } from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const comments = await fetchCachedEvents(1111);
    res.status(200).json(comments);
  } catch (error) {
    console.error("Failed to fetch comments from database:", error);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
}
