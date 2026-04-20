/**
 * Stripe Connect onboarding for an affiliate, gated by their invite token.
 *
 * Two POST actions:
 *   - action="create-account": creates a Stripe Express account for the
 *     affiliate (using their email if known) and stores the account id on
 *     the affiliate row.
 *   - action="create-link": returns an Account Link URL the affiliate can
 *     follow to finish onboarding. Safe to re-call repeatedly.
 *
 * Auth model: knowledge of the invite token. Once the invite has been
 * claimed by a pubkey, this endpoint refuses to mutate the stripe_account_id
 * unless the body includes the same affiliate_pubkey (matches the policy
 * already enforced by the `claim` endpoint).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import {
  getAffiliateByInviteToken,
  updateAffiliatePayoutMethod,
} from "@/utils/db/affiliates";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 12, windowMs: 60 * 1000 };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-09-30.clover",
});

function isAllowedAbsoluteRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "milkmarket:";
  } catch {
    return false;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "affiliates-stripe-onboarding", RATE_LIMIT))
    return;
  if (!process.env.STRIPE_SECRET_KEY) {
    return res
      .status(500)
      .json({ error: "Stripe is not configured on this server" });
  }

  try {
    const {
      token,
      action,
      affiliatePubkey,
      returnUrl: rawReturnUrl,
      refreshUrl: rawRefreshUrl,
    } = req.body ?? {};
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "token required" });
    }
    if (action !== "create-account" && action !== "create-link") {
      return res.status(400).json({ error: "Invalid action" });
    }

    const existing = await getAffiliateByInviteToken(token);
    if (!existing) return res.status(404).json({ error: "Invite not found" });

    // After-claim guard: must come from the claiming pubkey.
    if (existing.affiliate_pubkey) {
      if (!affiliatePubkey || existing.affiliate_pubkey !== affiliatePubkey) {
        return res
          .status(403)
          .json({ error: "Invite already claimed by another pubkey" });
      }
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      (process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : "http://localhost:3000");
    const safeReturnUrl =
      typeof rawReturnUrl === "string" &&
      rawReturnUrl &&
      isAllowedAbsoluteRedirect(rawReturnUrl)
        ? rawReturnUrl
        : `${baseUrl}/affiliate/${encodeURIComponent(token)}?stripe=return`;
    const safeRefreshUrl =
      typeof rawRefreshUrl === "string" &&
      rawRefreshUrl &&
      isAllowedAbsoluteRedirect(rawRefreshUrl)
        ? rawRefreshUrl
        : `${baseUrl}/affiliate/${encodeURIComponent(token)}?stripe=refresh`;

    let accountId = existing.stripe_account_id;

    if (action === "create-account") {
      if (accountId) {
        // Idempotent: return the existing account id so a double-click
        // doesn't create a second Connect account.
        return res.status(200).json({ accountId, alreadyExists: true });
      }
      const account = await stripe.accounts.create({
        type: "express",
        email: existing.email ?? undefined,
        capabilities: {
          transfers: { requested: true },
        },
        metadata: {
          affiliateId: String(existing.id),
          inviteToken: token,
        },
      });
      accountId = account.id;
      await updateAffiliatePayoutMethod(token, {
        affiliatePubkey: existing.affiliate_pubkey,
        lightningAddress: existing.lightning_address,
        stripeAccountId: accountId,
      });
      return res.status(200).json({ accountId, alreadyExists: false });
    }

    // action === "create-link"
    if (!accountId) {
      return res
        .status(400)
        .json({ error: "No Stripe account; create one first" });
    }
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: safeRefreshUrl,
      return_url: safeReturnUrl,
      type: "account_onboarding",
    });
    return res.status(200).json({ url: link.url, accountId });
  } catch (err) {
    console.error("affiliates/stripe-onboarding error:", err);
    return res.status(500).json({
      error: "Internal error",
      details: err instanceof Error ? err.message : "Unknown",
    });
  }
}
