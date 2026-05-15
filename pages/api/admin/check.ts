import type { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import { isAdminPubkey } from "@/utils/admin/auth";

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!applyRateLimit(req, res, "admin-check", RATE_LIMIT)) return;
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const pubkey =
    typeof req.query.pubkey === "string" ? req.query.pubkey.trim() : "";
  if (!pubkey) {
    return res.status(400).json({ error: "pubkey required" });
  }
  return res.status(200).json({ isAdmin: isAdminPubkey(pubkey) });
}
