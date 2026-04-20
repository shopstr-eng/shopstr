/**
 * Per-code click + conversion aggregates for a seller. Same Nostr-signed
 * proof scope as the affiliates list since both are read-only, seller-scoped
 * stats.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getAffiliateClickStats } from "@/utils/db/affiliates";
import {
  buildAffiliateClickStatsProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "affiliates-click-stats", RATE_LIMIT)) return;

  const { pubkey, sinceDays } = req.query;
  if (!pubkey || typeof pubkey !== "string") {
    return res.status(400).json({ error: "pubkey required" });
  }
  const days = Math.min(365, Math.max(1, sinceDays ? Number(sinceDays) : 30));

  const v = verifySignedHttpRequestProof(
    extractSignedEventFromRequest(req),
    buildAffiliateClickStatsProof(pubkey)
  );
  if (!v.ok) return res.status(v.status).json({ error: v.error });

  try {
    const stats = await getAffiliateClickStats(pubkey, days);
    return res.status(200).json({ sinceDays: days, stats });
  } catch (err) {
    console.error("affiliates/click-stats error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
