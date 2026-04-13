import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { getStripeConnectAccount } from "@/utils/db/db-service";
import { buildStripeCreateAccountLinkProof } from "@/utils/mcp/request-proof";
import {
  extractSignedEventFromRequest,
  verifyAndConsumeSignedRequestProof,
} from "@/utils/mcp/request-proof-server";
import { verifyNostrAuth } from "@/utils/stripe/verify-nostr-auth";

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

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function resolveRedirectUrl(params: {
  absoluteUrl?: unknown;
  relativePath?: unknown;
  baseUrl: string;
  defaultPath: string;
}): { ok: true; value: string } | { ok: false; error: string } {
  const absoluteUrl =
    typeof params.absoluteUrl === "string" ? params.absoluteUrl.trim() : "";
  if (absoluteUrl) {
    if (!isAllowedAbsoluteRedirect(absoluteUrl)) {
      return {
        ok: false,
        error: "Redirect URLs must use https:// or milkmarket://",
      };
    }

    return {
      ok: true,
      value: absoluteUrl,
    };
  }

  const relativePath =
    typeof params.relativePath === "string" && params.relativePath.trim()
      ? params.relativePath.trim()
      : params.defaultPath;

  return {
    ok: true,
    value: joinUrl(params.baseUrl, relativePath),
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      accountId,
      returnPath,
      refreshPath,
      returnUrl,
      refreshUrl,
      pubkey,
    } = req.body || {};

    if (!accountId || !pubkey || typeof pubkey !== "string" || !pubkey.trim()) {
      return res
        .status(400)
        .json({ error: "accountId and pubkey are required" });
    }
    const normalizedPubkey = pubkey.trim();

    const signedEvent = extractSignedEventFromRequest(req);
    const proofResult = await verifyAndConsumeSignedRequestProof(
      signedEvent,
      buildStripeCreateAccountLinkProof({
        pubkey: normalizedPubkey,
        accountId,
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

    const resolvedReturnUrl = resolveRedirectUrl({
      absoluteUrl: returnUrl,
      relativePath: returnPath,
      baseUrl,
      defaultPath: "/onboarding/stripe-connect?success=true",
    });
    if (!resolvedReturnUrl.ok) {
      return res.status(400).json({ error: resolvedReturnUrl.error });
    }

    const resolvedRefreshUrl = resolveRedirectUrl({
      absoluteUrl: refreshUrl,
      relativePath: refreshPath,
      baseUrl,
      defaultPath: "/onboarding/stripe-connect?refresh=true",
    });
    if (!resolvedRefreshUrl.ok) {
      return res.status(400).json({ error: resolvedRefreshUrl.error });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: resolvedRefreshUrl.value,
      return_url: resolvedReturnUrl.value,
      type: "account_onboarding",
    });

    return res.status(200).json({
      url: accountLink.url,
    });
  } catch (error) {
    console.error("Stripe account link creation error:", error);
    return res.status(500).json({
      error: "Failed to create account link",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
