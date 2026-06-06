import { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import { recordAuthedSeller } from "@/utils/db/db-service";

const RATE_LIMIT = { limit: 10, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "validate-password", RATE_LIMIT)) return;

  const { password, pubkey } = req.body;
  const correctPassword = process.env["LISTING_PASSWORD"];

  if (password === correctPassword) {
    // Record the seller so their products become visible in the marketplace.
    // A failure to record must not block listing access.
    if (typeof pubkey === "string") {
      try {
        await recordAuthedSeller(pubkey);
      } catch (error) {
        console.error("Failed to record authed seller:", error);
      }
    }
    res.status(200).json({ valid: true });
  } else {
    res.status(200).json({ valid: false });
  }
}
