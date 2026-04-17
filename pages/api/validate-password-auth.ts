import { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "validate-password-auth", RATE_LIMIT)) return;

  const passwordStorageKey = process.env["PASSWORD_STORAGE_KEY"];

  res.status(200).json({ value: passwordStorageKey });
}
