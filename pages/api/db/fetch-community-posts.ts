import type { NextApiRequest, NextApiResponse } from "next";
import {
  fetchCommunityPostsFromDb,
  fetchCommunityApprovalsFromDb,
} from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 120, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "db-fetch-community-posts", RATE_LIMIT)) return;

  try {
    const { communityAddress, includeApprovals } = req.body;

    if (!communityAddress || typeof communityAddress !== "string") {
      return res.status(200).json({ posts: [], approvals: [] });
    }

    const posts = await fetchCommunityPostsFromDb(communityAddress);

    if (includeApprovals) {
      const approvals = await fetchCommunityApprovalsFromDb(communityAddress);
      return res.status(200).json({ posts, approvals });
    }

    res.status(200).json({ posts, approvals: [] });
  } catch (error) {
    console.error("Failed to fetch community data from database:", error);
    res.status(500).json({ error: "Failed to fetch community data" });
  }
}
