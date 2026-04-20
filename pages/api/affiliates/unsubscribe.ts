/**
 * One-click unsubscribe for affiliate transactional emails. The link is
 * signed with `AFFILIATE_UNSUBSCRIBE_SECRET` so it carries no DB lookup of
 * the invite token (we never want to leak the invite token via an email
 * that the affiliate's mail provider may store indefinitely).
 *
 * GET shows a tiny HTML acknowledgement; POST is wired to support
 * `List-Unsubscribe-Post` + `One-Click` per RFC 8058 so Gmail/Yahoo treat
 * the link as a real unsubscribe.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getAffiliateById } from "@/utils/db/affiliates";
import {
  assertAffiliateUnsubscribeSecretConfigured,
  verifyAffiliateUnsubscribeToken,
} from "@/utils/email/unsubscribe-tokens";
import { applyRateLimit } from "@/utils/rate-limit";

// Fail the route module load in production if the secret is missing — so
// the deploy never silently serves an unsubscribe URL that 500s on every hit.
assertAffiliateUnsubscribeSecretConfigured();

const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

async function disableNotifications(affiliateId: number): Promise<boolean> {
  const aff = await getAffiliateById(affiliateId);
  if (!aff) return false;
  const mod = await import("@/utils/db/affiliates");
  const updated = await mod.setAffiliateEmailNotifications(
    aff.invite_token,
    false
  );
  return !!updated;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "affiliates-unsubscribe", RATE_LIMIT)) return;

  const token =
    (req.query.token as string | undefined) ??
    (req.body && (req.body.token as string | undefined));
  if (!token) {
    return res.status(400).send("Missing token");
  }

  let parsed: { affiliateId: number } | null = null;
  try {
    parsed = verifyAffiliateUnsubscribeToken(token);
  } catch (err) {
    console.error("unsubscribe verify error:", err);
    return res.status(500).send("Server error");
  }
  if (!parsed) return res.status(400).send("Invalid or expired link");

  try {
    const ok = await disableNotifications(parsed.affiliateId);
    if (req.method === "POST") {
      // RFC 8058 one-click flow: just acknowledge with 200.
      return res.status(200).end();
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (!ok) {
      return res
        .status(200)
        .send(
          `<html><body style="font-family:sans-serif;max-width:480px;margin:48px auto;padding:0 16px;"><h2>Already unsubscribed</h2><p>We couldn't find an active record for that link. You won't receive further affiliate notifications from this account.</p></body></html>`
        );
    }
    return res
      .status(200)
      .send(
        `<html><body style="font-family:sans-serif;max-width:480px;margin:48px auto;padding:0 16px;"><h2>You're unsubscribed</h2><p>Affiliate payout notifications have been disabled. You can re-enable them from your affiliate self-service page at any time.</p></body></html>`
      );
  } catch (err) {
    console.error("affiliates/unsubscribe error:", err);
    return res.status(500).send("Server error");
  }
}
