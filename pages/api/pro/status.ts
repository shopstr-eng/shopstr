import type { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import { getMembershipView } from "@/utils/pro/membership";

// Public, read-only membership status for a seller pubkey. Returns only
// non-sensitive, resolved fields (no Stripe ids), so the client context can
// poll it freely.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "pro-status", { limit: 120, windowMs: 60_000 }))
    return;

  const pubkeyParam = req.query.pubkey;
  const pubkey = Array.isArray(pubkeyParam) ? pubkeyParam[0] : pubkeyParam;
  if (!pubkey || typeof pubkey !== "string") {
    return res.status(400).json({ error: "pubkey is required" });
  }

  try {
    const view = await getMembershipView(pubkey);
    return res.status(200).json(view);
  } catch (error) {
    console.error("pro status failed:", error);
    return res.status(500).json({ error: "Failed to resolve membership" });
  }
}
