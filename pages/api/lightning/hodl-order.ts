import { syncHodlOrderStatus } from "@/utils/lightning/hodl-status-sync";
import type { NextApiRequest, NextApiResponse } from "next";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";
import { applyRateLimit } from "@/utils/rate-limit";
import {
  getHodlOrderForActor,
  updateHodlFulfillment,
} from "@/utils/db/hodl-order-store";
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET" && req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  if (!applyRateLimit(req, res, "hodl-order", { limit: 120, windowMs: 60_000 }))
    return;
  const auth = await verifyNip98Request(
    req,
    req.method,
    req.method === "POST" ? req.body : undefined
  );
  if (!auth.ok) return res.status(401).json({ error: auth.error });
  const hash =
    req.method === "GET" ? req.query.paymentHash : req.body?.paymentHash;
  if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))
    return res.status(400).json({ error: "Invalid payment hash" });
  try {
    if (!(await getHodlOrderForActor(hash, auth.pubkey)))
      return res.status(404).json({ error: "No such order" });
    await syncHodlOrderStatus(hash);
    if (req.method === "POST") {
      if (
        Object.keys(req.body).some(
          (key) => !["paymentHash", "fulfillment"].includes(key)
        )
      )
        return res.status(400).json({ error: "Invalid request" });
      try {
        await updateHodlFulfillment(hash, auth.pubkey, req.body.fulfillment);
      } catch {
        return res.status(409).json({
          error:
            "Order update is not permitted. Refresh the order before trying again.",
        });
      }
    }
    return res
      .status(200)
      .json({ order: await getHodlOrderForActor(hash, auth.pubkey) });
  } catch {
    return res
      .status(503)
      .json({ error: "Escrow order temporarily unavailable" });
  }
}
