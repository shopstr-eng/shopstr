import type { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";
import {
  createHodlOrder,
  parseRequestBody,
} from "@/utils/lightning/hodl-registration";
import { withHodlCheckout } from "@/utils/db/hodl-checkout-store";
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  if (
    !applyRateLimit(req, res, "register-hodl-order", {
      limit: 30,
      windowMs: 60_000,
    })
  )
    return;
  const auth = await verifyNip98Request(req, "POST");
  if (!auth.ok) return res.status(401).json({ error: auth.error });
  const body = parseRequestBody(req.body);
  if (!body)
    return res.status(400).json({ error: "Invalid hodl escrow order request" });
  try {
    const result = body.checkoutId
      ? await withHodlCheckout(auth.pubkey, body.checkoutId, body, (client) =>
          createHodlOrder(auth.pubkey, body, client)
        )
      : await createHodlOrder(auth.pubkey, body);
    return res.status(result.statusCode).json(result.body);
  } catch {
    return res.status(503).json({
      error: "Checkout temporarily unavailable. Retry with the same checkout.",
    });
  }
}
