import type { NextApiRequest, NextApiResponse } from "next";
import {
  getAffiliateByInviteToken,
  updateAffiliatePayoutMethod,
} from "@/utils/db/affiliates";
import { applyRateLimit } from "@/utils/rate-limit";
import {
  buildAffiliateClaimUpdateProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";

const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

function maskEmail(e: string | null): string | null {
  if (!e) return e;
  const [local, domain] = e.split("@");
  if (!domain) return "***";
  const head = (local ?? "").slice(0, 2);
  return `${head}***@${domain}`;
}

function maskLightningAddress(la: string | null): string | null {
  if (!la) return la;
  const [local, domain] = la.split("@");
  if (!domain) return "***";
  const head = (local ?? "").slice(0, 2);
  return `${head}***@${domain}`;
}

function maskStripeAccount(acct: string | null): string | null {
  if (!acct) return acct;
  if (acct.length <= 8) return "acct_***";
  return `${acct.slice(0, 5)}***${acct.slice(-4)}`;
}

/**
 * Affiliate self-service: load the affiliate record by invite token (GET) or
 * update payout destination + claim with their own pubkey (POST).
 *
 * Authorization model: knowledge of the invite token is the credential. Once
 * claimed (affiliate_pubkey set), updates require the same pubkey to be
 * supplied in the body — the invite token effectively becomes a personal
 * settings URL the affiliate keeps private.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!applyRateLimit(req, res, "affiliates-claim", RATE_LIMIT)) return;

  try {
    if (req.method === "GET") {
      const { token } = req.query;
      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "token required" });
      }
      const a = await getAffiliateByInviteToken(token);
      if (!a) return res.status(404).json({ error: "Invite not found" });
      // Once the invite has been claimed the GET response is reachable by
      // anyone holding the link, so we mask payout destinations to a
      // recognizable preview. The affiliate already knows their own values
      // and can re-enter them to update; a casual link finder cannot harvest
      // the lightning address or Stripe account.
      const masked = !!a.affiliate_pubkey;
      return res.status(200).json({
        id: a.id,
        seller_pubkey: a.seller_pubkey,
        name: a.name,
        email: masked ? maskEmail(a.email) : a.email,
        affiliate_pubkey: a.affiliate_pubkey,
        invite_claimed_at: a.invite_claimed_at,
        lightning_address: masked
          ? maskLightningAddress(a.lightning_address)
          : a.lightning_address,
        stripe_account_id: masked
          ? maskStripeAccount(a.stripe_account_id)
          : a.stripe_account_id,
        has_lightning_address: !!a.lightning_address,
        has_stripe_account: !!a.stripe_account_id,
        masked,
      });
    }

    if (req.method === "POST") {
      const { token, affiliatePubkey, lightningAddress, stripeAccountId } =
        req.body ?? {};
      if (!token) return res.status(400).json({ error: "token required" });
      const existing = await getAffiliateByInviteToken(String(token));
      if (!existing) return res.status(404).json({ error: "Invite not found" });

      // Once an invite is claimed, the invite token alone is no longer
      // sufficient — every subsequent update must be signed by the claiming
      // pubkey to prevent a leaked link from being used to redirect
      // payouts.
      if (existing.affiliate_pubkey) {
        if (!affiliatePubkey) {
          return res.status(400).json({ error: "affiliatePubkey required" });
        }
        if (existing.affiliate_pubkey !== affiliatePubkey) {
          return res
            .status(403)
            .json({ error: "Invite already claimed by another pubkey" });
        }
        const v = verifySignedHttpRequestProof(
          extractSignedEventFromRequest(req),
          buildAffiliateClaimUpdateProof({
            pubkey: affiliatePubkey,
            inviteToken: String(token),
          })
        );
        if (!v.ok) return res.status(v.status).json({ error: v.error });
      }

      const updated = await updateAffiliatePayoutMethod(String(token), {
        affiliatePubkey: affiliatePubkey ?? existing.affiliate_pubkey ?? null,
        lightningAddress: lightningAddress ?? null,
        stripeAccountId: stripeAccountId ?? null,
      });
      return res.status(200).json(updated);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("affiliates/claim error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
