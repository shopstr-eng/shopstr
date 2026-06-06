import { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import { getAuthedSellerPubkeys } from "@/utils/db/db-service";

const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "authed-sellers", RATE_LIMIT)) return;

  try {
    const pubkeys = await getAuthedSellerPubkeys();
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
    res.status(200).json({ pubkeys });
  } catch (error) {
    console.error("Failed to fetch authed sellers:", error);
    res.status(500).json({ error: "Failed to fetch authed sellers" });
  }
}
