import type { NextApiRequest, NextApiResponse } from "next";
import { fetchCommentsByReviewIds } from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { reviewEventIds } = req.body;

    if (
      !reviewEventIds ||
      !Array.isArray(reviewEventIds) ||
      reviewEventIds.length === 0
    ) {
      return res.status(200).json([]);
    }

    const comments = await fetchCommentsByReviewIds(reviewEventIds);
    res.status(200).json(comments);
  } catch (error) {
    console.error("Failed to fetch comments from database:", error);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
}
