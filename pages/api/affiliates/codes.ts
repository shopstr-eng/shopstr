import type { NextApiRequest, NextApiResponse } from "next";
import {
  createAffiliateCode,
  deleteAffiliateCode,
  listAffiliateCodesBySeller,
  updateAffiliateCode,
} from "@/utils/db/affiliates";
import {
  buildAffiliateCodeCreateProof,
  buildAffiliateCodeDeleteProof,
  buildAffiliateCodeUpdateProof,
  buildAffiliateCodesListProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 120, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!applyRateLimit(req, res, "affiliates-codes", RATE_LIMIT)) return;

  try {
    if (req.method === "GET") {
      const { pubkey } = req.query;
      if (!pubkey || typeof pubkey !== "string") {
        return res.status(400).json({ error: "pubkey required" });
      }
      const v = verifySignedHttpRequestProof(
        extractSignedEventFromRequest(req),
        buildAffiliateCodesListProof(pubkey)
      );
      if (!v.ok) return res.status(v.status).json({ error: v.error });
      const rows = await listAffiliateCodesBySeller(pubkey);
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      const {
        pubkey,
        affiliateId,
        code,
        rebateType,
        rebateValue,
        buyerDiscountType,
        buyerDiscountValue,
        currency,
        payoutSchedule,
        expiration,
        maxUses,
      } = req.body ?? {};
      if (
        !pubkey ||
        !affiliateId ||
        !code ||
        !rebateType ||
        rebateValue == null
      ) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const normalized = String(code).trim().toUpperCase();
      const v = verifySignedHttpRequestProof(
        extractSignedEventFromRequest(req),
        buildAffiliateCodeCreateProof({
          pubkey,
          affiliateId: Number(affiliateId),
          code: normalized,
        })
      );
      if (!v.ok) return res.status(v.status).json({ error: v.error });

      const created = await createAffiliateCode({
        affiliateId: Number(affiliateId),
        sellerPubkey: pubkey,
        code: normalized,
        rebateType,
        rebateValue: Number(rebateValue),
        buyerDiscountType: buyerDiscountType ?? "percent",
        buyerDiscountValue: Number(buyerDiscountValue ?? 0),
        currency: currency ?? null,
        payoutSchedule: payoutSchedule ?? "every_sale",
        expiration: expiration ? Number(expiration) : null,
        maxUses: maxUses ? Number(maxUses) : null,
      });
      return res.status(200).json(created);
    }

    if (req.method === "PATCH") {
      const { pubkey, codeId, ...patch } = req.body ?? {};
      if (!pubkey || !codeId) {
        return res.status(400).json({ error: "pubkey and codeId required" });
      }
      const v = verifySignedHttpRequestProof(
        extractSignedEventFromRequest(req),
        buildAffiliateCodeUpdateProof({ pubkey, codeId: Number(codeId) })
      );
      if (!v.ok) return res.status(v.status).json({ error: v.error });
      const updated = await updateAffiliateCode(Number(codeId), pubkey, patch);
      if (!updated) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(updated);
    }

    if (req.method === "DELETE") {
      const { pubkey, codeId } = req.body ?? {};
      if (!pubkey || !codeId) {
        return res.status(400).json({ error: "pubkey and codeId required" });
      }
      const v = verifySignedHttpRequestProof(
        extractSignedEventFromRequest(req),
        buildAffiliateCodeDeleteProof({ pubkey, codeId: Number(codeId) })
      );
      if (!v.ok) return res.status(v.status).json({ error: v.error });
      await deleteAffiliateCode(Number(codeId), pubkey);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("affiliates/codes error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
