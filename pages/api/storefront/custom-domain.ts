import type { NextApiRequest, NextApiResponse } from "next";
import { getDbPool } from "@/utils/db/db-service";
import { verifyNostrAuth } from "@/utils/stripe/verify-nostr-auth";
import { checkRateLimit, getRequestIp } from "@/utils/rate-limit";

const pool = getDbPool();

const RATE_LIMIT = { limit: 20, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST" || req.method === "DELETE") {
    const rate = checkRateLimit("custom-domain", getRequestIp(req), RATE_LIMIT);
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

  if (req.method === "POST") {
    const { pubkey, domain, signedEvent } = req.body ?? {};

    if (!pubkey || !domain) {
      return res.status(400).json({ error: "pubkey and domain are required" });
    }

    if (!signedEvent) {
      return res.status(400).json({ error: "signedEvent is required" });
    }

    const cleanDomain = domain.toLowerCase().trim();

    const authResult = verifyNostrAuth(
      signedEvent,
      pubkey,
      "custom-domain-write",
      {
        method: "POST",
        path: "/api/storefront/custom-domain",
        fields: { domain: cleanDomain },
      }
    );
    if (!authResult.valid) {
      return res
        .status(401)
        .json({ error: authResult.error || "Authentication failed" });
    }

    const slugResult = await pool.query(
      "SELECT slug FROM shop_slugs WHERE pubkey = $1",
      [pubkey]
    );
    if (slugResult.rows.length === 0) {
      return res
        .status(400)
        .json({ error: "You must set up a shop slug first" });
    }

    try {
      await pool.query(
        `INSERT INTO custom_domains (pubkey, domain, shop_slug, verified) 
         VALUES ($1, $2, $3, false) 
         ON CONFLICT (pubkey) DO UPDATE SET domain = $2, shop_slug = $3, verified = false, updated_at = NOW()`,
        [pubkey, cleanDomain, slugResult.rows[0].slug]
      );

      return res.status(200).json({
        domain: cleanDomain,
        verified: false,
        instructions: {
          type: "CNAME",
          host: cleanDomain,
          value: "milk-market.replit.app",
          note: "Add a CNAME record pointing your domain to milk-market.replit.app. Verification may take up to 48 hours after DNS propagation.",
        },
      });
    } catch (error: any) {
      if (error?.code === "23505") {
        return res
          .status(409)
          .json({ error: "This domain is already registered" });
      }
      console.error("Custom domain error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  if (req.method === "GET") {
    const { pubkey } = req.query;
    if (!pubkey || typeof pubkey !== "string") {
      return res.status(400).json({ error: "pubkey parameter required" });
    }

    try {
      const result = await pool.query(
        "SELECT domain, verified, created_at FROM custom_domains WHERE pubkey = $1",
        [pubkey]
      );
      if (result.rows.length > 0) {
        return res.status(200).json(result.rows[0]);
      }
      return res.status(200).json(null);
    } catch (error) {
      console.error("Custom domain lookup error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  if (req.method === "DELETE") {
    const { pubkey, signedEvent } = req.body ?? {};
    if (!pubkey) {
      return res.status(400).json({ error: "pubkey is required" });
    }

    if (!signedEvent) {
      return res.status(400).json({ error: "signedEvent is required" });
    }

    const authResult = verifyNostrAuth(
      signedEvent,
      pubkey,
      "custom-domain-write",
      { method: "DELETE", path: "/api/storefront/custom-domain" }
    );
    if (!authResult.valid) {
      return res
        .status(401)
        .json({ error: authResult.error || "Authentication failed" });
    }

    try {
      await pool.query("DELETE FROM custom_domains WHERE pubkey = $1", [
        pubkey,
      ]);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Custom domain delete error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
