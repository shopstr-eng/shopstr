import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { getStripeConnectAccount } from "@/utils/db/db-service";
import { buildStripeManageLinkProof } from "@/utils/mcp/request-proof";
import {
  extractSignedEventFromRequest,
  verifyAndConsumeSignedRequestProof,
} from "@/utils/mcp/request-proof-server";
import { ensureConnectAccountCapabilities } from "@/utils/stripe/ensure-capabilities";
import { verifyNostrAuth } from "@/utils/stripe/verify-nostr-auth";
import { applyRateLimit } from "@/utils/rate-limit";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-09-30.clover",
});

const RATE_LIMIT = { limit: 30, windowMs: 60000 };

function isAllowedAbsoluteRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "milkmarket:";
  } catch {
    return false;
  }
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "stripe-connect-manage-link", RATE_LIMIT))
    return;

  try {
    const {
      accountId,
      pubkey,
      mode,
      returnPath,
      refreshPath,
      returnUrl,
      refreshUrl,
    } = req.body || {};

    if (!accountId || !pubkey || typeof pubkey !== "string" || !pubkey.trim()) {
      return res
        .status(400)
        .json({ error: "accountId and pubkey are required" });
    }
    if (mode !== "dashboard" && mode !== "update") {
      return res
        .status(400)
        .json({ error: "mode must be 'dashboard' or 'update'" });
    }
    const normalizedPubkey = pubkey.trim();

    const signedEvent = extractSignedEventFromRequest(req);
    const proofResult = await verifyAndConsumeSignedRequestProof(
      signedEvent,
      buildStripeManageLinkProof({
        pubkey: normalizedPubkey,
        accountId,
        mode,
      })
    );

    if (!proofResult.ok) {
      const authResult = verifyNostrAuth(
        signedEvent,
        normalizedPubkey,
        "stripe-connect"
      );
      if (!authResult.valid) {
        return res.status(proofResult.status).json({
          error:
            proofResult.error || authResult.error || "Authentication failed",
        });
      }
    }

    const connectAccount = await getStripeConnectAccount(normalizedPubkey);
    if (!connectAccount || connectAccount.stripe_account_id !== accountId) {
      return res
        .status(403)
        .json({ error: "Account does not belong to this user" });
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      (process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : "http://localhost:3000");

    await ensureConnectAccountCapabilities(stripe, accountId);

    if (mode === "dashboard") {
      // Express dashboard login link — managers payouts, bank accounts,
      // payment methods, business info, etc. Only valid once charges are
      // enabled / onboarding submitted.
      try {
        const loginLink = await stripe.accounts.createLoginLink(accountId);
        return res.status(200).json({ url: loginLink.url, mode });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create login link";
        // Common case: onboarding not yet completed. Fall back to update flow.
        return res.status(409).json({
          error:
            "Stripe Express dashboard is not available yet. Please finish onboarding first.",
          details: message,
          fallback: "update",
        });
      }
    }

    // mode === "update": account_update link to fix/update verification info.
    const resolveUrl = (
      absoluteUrl: unknown,
      relativePath: unknown,
      defaultPath: string
    ): { ok: true; value: string } | { ok: false; error: string } => {
      const abs = typeof absoluteUrl === "string" ? absoluteUrl.trim() : "";
      if (abs) {
        if (!isAllowedAbsoluteRedirect(abs)) {
          return {
            ok: false,
            error: "Redirect URLs must use https:// or milkmarket://",
          };
        }
        return { ok: true, value: abs };
      }
      const rel =
        typeof relativePath === "string" && relativePath.trim()
          ? relativePath.trim()
          : defaultPath;
      return { ok: true, value: joinUrl(baseUrl, rel) };
    };

    const resolvedReturn = resolveUrl(
      returnUrl,
      returnPath,
      "/settings/payments?stripe=updated"
    );
    if (!resolvedReturn.ok)
      return res.status(400).json({ error: resolvedReturn.error });
    const resolvedRefresh = resolveUrl(
      refreshUrl,
      refreshPath,
      "/settings/payments?stripe=refresh"
    );
    if (!resolvedRefresh.ok)
      return res.status(400).json({ error: resolvedRefresh.error });

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: resolvedRefresh.value,
      return_url: resolvedReturn.value,
      type: "account_update",
    });

    return res.status(200).json({ url: accountLink.url, mode });
  } catch (error) {
    console.error("Stripe manage link error:", error);
    return res.status(500).json({
      error: "Failed to create management link",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
