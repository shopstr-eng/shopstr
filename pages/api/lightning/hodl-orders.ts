import type { NextApiRequest, NextApiResponse } from "next";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";
import { applyRateLimit } from "@/utils/rate-limit";
import { listHodlOrders } from "@/utils/db/hodl-order-store";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  if (!applyRateLimit(req, res, "hodl-orders", { limit: 60, windowMs: 60_000 }))
    return;
  const auth = await verifyNip98Request(req, "GET");
  if (!auth.ok) return res.status(401).json({ error: auth.error });
  if (req.query.role !== undefined && req.query.role !== "arbiter")
    return res.status(400).json({ error: "Invalid role" });
  const after = req.query.after ?? "";
  if (
    typeof after !== "string" ||
    (after !== "" && !/^[0-9a-f]{64}$/.test(after))
  )
    return res.status(400).json({ error: "Invalid cursor" });
  try {
    const orders = await listHodlOrders(
      auth.pubkey,
      after,
      req.query.role === "arbiter"
    );
    return res.status(200).json({
      orders,
      next: orders.length === 100 ? orders[99]!.paymentHash : null,
    });
  } catch {
    return res
      .status(503)
      .json({ error: "Escrow orders are temporarily unavailable" });
  }
}
