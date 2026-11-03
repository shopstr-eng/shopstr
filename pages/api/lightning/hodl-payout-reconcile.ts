import type { NextApiRequest, NextApiResponse } from "next";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";
import { applyRateLimit } from "@/utils/rate-limit";
import { getHodlOrderForActor } from "@/utils/db/hodl-order-store";
import { payoutToSeller } from "@/utils/lightning/hodl-seller-payout";
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  if (
    !applyRateLimit(req, res, "hodl-payout-reconcile", {
      limit: 10,
      windowMs: 60_000,
    })
  )
    return;
  const auth = await verifyNip98Request(req, "POST");
  if (!auth.ok) return res.status(401).json({ error: auth.error });
  const hash = req.body?.paymentHash;
  if (
    typeof hash !== "string" ||
    !/^[a-f0-9]{64}$/.test(hash) ||
    Object.keys(req.body).length !== 1
  )
    return res.status(400).json({ error: "Invalid request" });
  try {
    const order = await getHodlOrderForActor(hash, auth.pubkey);
    if (
      !order ||
      ![order.sellerPubkey, order.arbiterPubkey].includes(auth.pubkey)
    )
      return res.status(404).json({ error: "No such order" });
    if (order.status !== "settled")
      return res.status(409).json({ error: "Escrow has not been released" });
    // Reuse the locked, immutable-invoice payout path. Never clear an uncertain payment.
    const result = await payoutToSeller(hash);
    return res.status(200).json({ status: result.status });
  } catch {
    return res
      .status(503)
      .json({ error: "Payout reconciliation temporarily unavailable" });
  }
}
