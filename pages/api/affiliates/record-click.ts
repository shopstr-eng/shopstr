/**
 * Public click-tracking endpoint for affiliate links. Called by the front-end
 * `<AffiliateRefTracker>` mounted in `_app.tsx` whenever it stores a fresh
 * `?ref=CODE` cookie. Idempotent for the request lifecycle but not across
 * page loads — the front-end gates the call so a single landing only fires
 * once per session via sessionStorage.
 *
 * Intentionally records *no* IP, no user-agent. We only need clicks-vs-
 * conversions for conversion-rate analytics; rich attribution belongs in a
 * separate analytics product.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { recordAffiliateClick } from "@/utils/db/affiliates";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 120, windowMs: 60 * 1000 };

function safeHost(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).host.slice(0, 255) || null;
  } catch {
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "affiliates-record-click", RATE_LIMIT)) return;

  try {
    const { sellerPubkey, code, landingPath } = req.body ?? {};
    if (
      !sellerPubkey ||
      typeof sellerPubkey !== "string" ||
      !/^[0-9a-f]{64}$/i.test(sellerPubkey) ||
      !code ||
      typeof code !== "string" ||
      code.length === 0 ||
      code.length > 64
    ) {
      // 200 to avoid the front-end retrying a bad request indefinitely; we
      // already validated upstream in the tracker. The lack of an `ok: true`
      // signals we silently dropped the row.
      return res.status(200).json({ ok: false });
    }
    const path =
      typeof landingPath === "string" && landingPath.length <= 512
        ? landingPath
        : null;
    const refererHost = safeHost(req.headers.referer);

    await recordAffiliateClick({
      sellerPubkey: sellerPubkey.toLowerCase(),
      code,
      landingPath: path,
      refererHost,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("affiliates/record-click error:", err);
    // Still 200: click-loss is preferable to retries hammering the table.
    return res.status(200).json({ ok: false });
  }
}
