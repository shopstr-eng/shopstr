import type { NextApiRequest, NextApiResponse } from "next";
import {
  createAffiliate,
  deleteAffiliate,
  listAffiliatesBySeller,
  updateAffiliate,
} from "@/utils/db/affiliates";
import {
  buildAffiliateCreateProof,
  buildAffiliateDeleteProof,
  buildAffiliateUpdateProof,
  buildAffiliatesListProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!applyRateLimit(req, res, "affiliates-manage", RATE_LIMIT)) return;

  try {
    if (req.method === "GET") {
      const { pubkey } = req.query;
      if (!pubkey || typeof pubkey !== "string") {
        return res.status(400).json({ error: "pubkey required" });
      }
      const v = verifySignedHttpRequestProof(
        extractSignedEventFromRequest(req),
        buildAffiliatesListProof(pubkey)
      );
      if (!v.ok) return res.status(v.status).json({ error: v.error });
      const rows = await listAffiliatesBySeller(pubkey);
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      const { pubkey, name, email, lightningAddress, stripeAccountId, notes } =
        req.body ?? {};
      if (!pubkey || !name) {
        return res.status(400).json({ error: "pubkey and name required" });
      }
      const v = verifySignedHttpRequestProof(
        extractSignedEventFromRequest(req),
        buildAffiliateCreateProof({ pubkey, name })
      );
      if (!v.ok) return res.status(v.status).json({ error: v.error });
      const created = await createAffiliate({
        sellerPubkey: pubkey,
        name,
        email: email ?? null,
        lightningAddress: lightningAddress ?? null,
        stripeAccountId: stripeAccountId ?? null,
        notes: notes ?? null,
      });
      return res.status(200).json(created);
    }

    if (req.method === "PATCH") {
      const {
        pubkey,
        affiliateId,
        name,
        email,
        lightningAddress,
        stripeAccountId,
        notes,
      } = req.body ?? {};
      if (!pubkey || !affiliateId) {
        return res
          .status(400)
          .json({ error: "pubkey and affiliateId required" });
      }
      const v = verifySignedHttpRequestProof(
        extractSignedEventFromRequest(req),
        buildAffiliateUpdateProof({ pubkey, affiliateId: Number(affiliateId) })
      );
      if (!v.ok) return res.status(v.status).json({ error: v.error });
      const updated = await updateAffiliate(Number(affiliateId), pubkey, {
        name,
        email,
        lightningAddress,
        stripeAccountId,
        notes,
      });
      if (!updated) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(updated);
    }

    if (req.method === "DELETE") {
      const { pubkey, affiliateId } = req.body ?? {};
      if (!pubkey || !affiliateId) {
        return res
          .status(400)
          .json({ error: "pubkey and affiliateId required" });
      }
      const v = verifySignedHttpRequestProof(
        extractSignedEventFromRequest(req),
        buildAffiliateDeleteProof({ pubkey, affiliateId: Number(affiliateId) })
      );
      if (!v.ok) return res.status(v.status).json({ error: v.error });
      await deleteAffiliate(Number(affiliateId), pubkey);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("affiliates/manage error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
