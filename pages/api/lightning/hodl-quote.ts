import type { NextApiRequest, NextApiResponse } from "next";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";
import { applyRateLimit } from "@/utils/rate-limit";
import {
  parseRequestBody,
  quoteHodlOrder,
} from "@/utils/lightning/hodl-registration";
import { PricingValidationError } from "@/utils/payments/listing-pricing";
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  if (!applyRateLimit(req, res, "hodl-quote", { limit: 100, windowMs: 60_000 }))
    return;
  const auth = await verifyNip98Request(req, "POST");
  if (!auth.ok) return res.status(401).json({ error: auth.error });
  const body = parseRequestBody({ ...req.body, amountSats: 1 });
  if (!body)
    return res.status(400).json({ error: "Invalid checkout selections" });
  try {
    const quote = await quoteHodlOrder(body);
    return res.status(200).json({ amountSats: quote.amountSats });
  } catch (error) {
    return res
      .status(error instanceof PricingValidationError ? 400 : 503)
      .json({
        error:
          error instanceof PricingValidationError
            ? error.message
            : "Escrow quote temporarily unavailable",
      });
  }
}
