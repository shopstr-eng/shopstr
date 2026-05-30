import type { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import {
  buildProHistoryProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";
import { getProBillingHistory } from "@/utils/pro/membership";

// Read-only Pro billing history for the signed-in seller. Returns settled
// manual (Bitcoin/fiat) invoices and paid Stripe invoices (with receipt/PDF
// links), merged newest-first. Requires a signed request proof so a seller can
// only ever read their own history.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "pro-history", { limit: 60, windowMs: 60_000 }))
    return;

  const pubkeyParam = req.query.pubkey;
  const pubkey = Array.isArray(pubkeyParam) ? pubkeyParam[0] : pubkeyParam;
  if (!pubkey || typeof pubkey !== "string") {
    return res.status(400).json({ error: "pubkey is required" });
  }

  const verification = verifySignedHttpRequestProof(
    extractSignedEventFromRequest(req),
    buildProHistoryProof(pubkey)
  );
  if (!verification.ok) {
    return res.status(verification.status).json({ error: verification.error });
  }

  try {
    const history = await getProBillingHistory(pubkey);
    return res.status(200).json({ history });
  } catch (error) {
    console.error("pro history failed:", error);
    return res.status(500).json({ error: "Failed to load billing history" });
  }
}
