import type { NextApiRequest, NextApiResponse } from "next";
import { getDbPool } from "@/utils/db/db-service";
import { verifyNostrAuth } from "@/utils/stripe/verify-nostr-auth";
import { checkRateLimit, getRequestIp } from "@/utils/rate-limit";

const pool = getDbPool();

const RATE_LIMIT = { limit: 20, windowMs: 60 * 1000 };

function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 63)
    .replace(/^-|-$/g, "");
}

const RESERVED_SLUGS = [
  "www",
  "api",
  "app",
  "admin",
  "mail",
  "ftp",
  "stall",
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
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST" || req.method === "DELETE") {
    const rate = checkRateLimit("register-slug", getRequestIp(req), RATE_LIMIT);
    res.setHeader("X-RateLimit-Limit", String(rate.limit));
    res.setHeader("X-RateLimit-Remaining", String(rate.remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(rate.resetAt / 1000)));
    if (!rate.ok) {
      res.setHeader(
        "Retry-After",
        String(Math.max(0, Math.ceil((rate.resetAt - Date.now()) / 1000)))
      );
      return res.status(429).json({ error: "Too many requests" });
    }
  }

  if (req.method === "DELETE") {
    const { pubkey, signedEvent } = req.body;
    if (typeof pubkey !== "string" || !signedEvent) {
      return res
        .status(400)
        .json({ error: "pubkey and signedEvent are required" });
    }

    const authResult = verifyNostrAuth(
      signedEvent,
      pubkey,
      "storefront-slug-write",
      { method: "DELETE", path: "/api/storefront/register-slug" }
    );
    if (!authResult.valid) {
      return res
        .status(401)
        .json({ error: authResult.error || "Authentication failed" });
    }
    try {
      await pool.query("DELETE FROM shop_slugs WHERE pubkey = $1", [pubkey]);
      await pool.query("DELETE FROM custom_domains WHERE pubkey = $1", [
        pubkey,
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

  const { pubkey, slug, signedEvent } = req.body;

  if (typeof pubkey !== "string" || typeof slug !== "string" || !signedEvent) {
    return res
      .status(400)
      .json({ error: "pubkey, slug, and signedEvent are required" });
  }

  const authResult = verifyNostrAuth(
    signedEvent,
    pubkey,
    "storefront-slug-write",
    {
      method: "POST",
      path: "/api/storefront/register-slug",
      fields: { slug },
    }
  );
  if (!authResult.valid) {
    return res
      .status(401)
      .json({ error: authResult.error || "Authentication failed" });
  }

  const sanitized = sanitizeSlug(slug);

  if (!sanitized || sanitized.length < 2) {
    return res
      .status(400)
      .json({ error: "Slug must be at least 2 characters" });
  }

  if (RESERVED_SLUGS.includes(sanitized)) {
    return res.status(400).json({ error: "This stall name is reserved" });
  }

  try {
    await pool.query(
      `INSERT INTO shop_slugs (pubkey, slug) 
       VALUES ($1, $2) 
       ON CONFLICT (pubkey) DO UPDATE SET slug = $2, updated_at = NOW()`,
      [pubkey, sanitized]
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
