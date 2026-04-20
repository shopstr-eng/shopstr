import type { NextApiRequest, NextApiResponse } from "next";
import {
  createAffiliate,
  deleteAffiliate,
  listAffiliatesBySeller,
  regenerateInviteToken,
  setAffiliatePayoutsEnabled,
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
      const { pubkey, affiliateId, force } = req.body ?? {};
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
      try {
        await deleteAffiliate(Number(affiliateId), pubkey, {
          force: Boolean(force),
        });
      } catch (e) {
        // Surface the human-readable "unsettled balance" guard as a 409 so
        // the UI can prompt the seller for confirmation + force.
        const msg = e instanceof Error ? e.message : "Delete failed";
        if (msg.includes("unsettled balance")) {
          return res.status(409).json({ error: msg });
        }
        throw e;
      }
      return res.status(200).json({ success: true });
    }

    // PUT: side-channel mutations that don't fit a CRUD verb cleanly. Reuses
    // the affiliate-update proof since both rotate-token and toggle-payouts
    // require the same authority (seller controls this affiliate).
    if (req.method === "PUT") {
      const { pubkey, affiliateId, action, enabled } = req.body ?? {};
      if (!pubkey || !affiliateId || !action) {
        return res
          .status(400)
          .json({ error: "pubkey, affiliateId and action required" });
      }
      const v = verifySignedHttpRequestProof(
        extractSignedEventFromRequest(req),
        buildAffiliateUpdateProof({ pubkey, affiliateId: Number(affiliateId) })
      );
      if (!v.ok) return res.status(v.status).json({ error: v.error });

      if (action === "regenerate-invite-token") {
        const token = await regenerateInviteToken(Number(affiliateId), pubkey);
        if (!token) return res.status(404).json({ error: "Not found" });
        return res.status(200).json({ invite_token: token });
      }
      if (action === "set-payouts-enabled") {
        const updated = await setAffiliatePayoutsEnabled(
          Number(affiliateId),
          pubkey,
          Boolean(enabled)
        );
        if (!updated) return res.status(404).json({ error: "Not found" });
        return res.status(200).json(updated);
      }
      return res.status(400).json({ error: "Unknown action" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("affiliates/manage error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
