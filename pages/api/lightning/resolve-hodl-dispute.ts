import type { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import { parseRequestBody } from "@/utils/lightning/hodl-api";
import { executeHodlResolution } from "@/utils/lightning/resolve-hodl-dispute";
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  if (
    !applyRateLimit(req, res, "resolve-hodl-dispute", {
      limit: 30,
      windowMs: 60_000,
    })
  )
    return;
  const body = parseRequestBody(req.body);
  if (!body)
    return res
      .status(400)
      .json({ error: "Invalid hodl escrow resolve request" });
  const result = await executeHodlResolution(body.paymentHash);
  return res.status(result.statusCode).json(result.body);
}
