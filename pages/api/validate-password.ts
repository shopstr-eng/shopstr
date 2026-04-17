import { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 10, windowMs: 60 * 1000 };

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "validate-password", RATE_LIMIT)) return;

  const { password } = req.body;
  const correctPassword = process.env["LISTING_PASSWORD"];

  if (password === correctPassword) {
    res.status(200).json({ valid: true });
  } else {
    res.status(200).json({ valid: false });
  }
}
