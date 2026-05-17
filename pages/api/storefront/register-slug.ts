import type { NextApiRequest, NextApiResponse } from "next";
import { getDbPool } from "@/utils/db/db-service";
import {
  buildStorefrontSlugCreateProof,
  buildStorefrontSlugDeleteProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";
import { checkRateLimit, getRequestIp } from "@/utils/rate-limit";

const pool = getDbPool();

const RATE_LIMIT = { limit: 20, windowMs: 60 * 1000 };

function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 63);
}

const RESERVED_SLUGS = [
  "www",
  "api",
  "app",
  "admin",
  "mail",
  "ftp",
  "shop",
  "marketplace",
  "settings",
  "orders",
  "cart",
  "listing",
  "auth",
  "onboarding",
  "wallet",
  "communities",
  "help",
  "support",
  "blog",
  "docs",
  "status",
  "my-listings",
  "about",
  "contact",
  "faq",
  "privacy",
  "terms",
  "order-summary",
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST" || req.method === "DELETE") {
    const rate = checkRateLimit("register-slug", getRequestIp(req), RATE_LIMIT);
    if (!rate.ok) {
      res.setHeader(
        "Retry-After",
        Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))
      );
      return res.status(429).json({ error: "Too many requests" });
    }
  }

  if (req.method === "DELETE") {
    const signedEvent = extractSignedEventFromRequest(req);
    const ownerPubkey = signedEvent?.pubkey ?? "";
    const verification = verifySignedHttpRequestProof(
      signedEvent,
      buildStorefrontSlugDeleteProof(ownerPubkey)
    );

    if (!verification.ok) {
      return res
        .status(verification.status)
        .json({ error: verification.error });
    }

    try {
      await pool.query("DELETE FROM shop_slugs WHERE pubkey = $1", [
        ownerPubkey,
      ]);
      await pool.query("DELETE FROM custom_domains WHERE pubkey = $1", [
        ownerPubkey,
      ]);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Delete slug error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { slug } = req.body ?? {};

  if (!slug) {
    return res.status(400).json({ error: "slug is required" });
  }

  const sanitized = sanitizeSlug(slug);

  if (!sanitized || sanitized.length < 2) {
    return res
      .status(400)
      .json({ error: "Slug must be at least 2 characters" });
  }

  const signedEvent = extractSignedEventFromRequest(req);
  const ownerPubkey = signedEvent?.pubkey ?? "";
  const verification = verifySignedHttpRequestProof(
    signedEvent,
    buildStorefrontSlugCreateProof({
      pubkey: ownerPubkey,
      slug: sanitized,
    })
  );

  if (!verification.ok) {
    return res.status(verification.status).json({ error: verification.error });
  }

  if (RESERVED_SLUGS.includes(sanitized)) {
    return res.status(400).json({ error: "This shop name is reserved" });
  }

  try {
    await pool.query(
      `INSERT INTO shop_slugs (pubkey, slug) 
       VALUES ($1, $2) 
       ON CONFLICT (pubkey) DO UPDATE SET slug = $2, updated_at = NOW()`,
      [ownerPubkey, sanitized]
    );

    return res.status(200).json({ slug: sanitized });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "This shop name is already taken" });
    }
    console.error("Register slug error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
