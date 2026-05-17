import type { NextApiRequest, NextApiResponse } from "next";
import { getDbPool } from "@/utils/db/db-service";
import {
  buildCustomDomainCreateProof,
  buildCustomDomainDeleteProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";
import { checkRateLimit, getRequestIp } from "@/utils/rate-limit";

const pool = getDbPool();

const RATE_LIMIT = { limit: 20, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST" || req.method === "DELETE") {
    const rate = checkRateLimit("custom-domain", getRequestIp(req), RATE_LIMIT);
    if (!rate.ok) {
      res.setHeader(
        "Retry-After",
        Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))
      );
      return res.status(429).json({ error: "Too many requests" });
    }
  }

  if (req.method === "POST") {
    const { domain } = req.body ?? {};

    if (!domain) {
      return res.status(400).json({ error: "domain is required" });
    }

    const cleanDomain = domain.toLowerCase().trim();
    const signedEvent = extractSignedEventFromRequest(req);
    const ownerPubkey = signedEvent?.pubkey ?? "";
    const verification = verifySignedHttpRequestProof(
      signedEvent,
      buildCustomDomainCreateProof({
        pubkey: ownerPubkey,
        domain: cleanDomain,
      })
    );

    if (!verification.ok) {
      return res
        .status(verification.status)
        .json({ error: verification.error });
    }

    const slugResult = await pool.query(
      "SELECT slug FROM shop_slugs WHERE pubkey = $1",
      [ownerPubkey]
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
        [ownerPubkey, cleanDomain, slugResult.rows[0].slug]
      );

      return res.status(200).json({
        domain: cleanDomain,
        verified: false,
        instructions: {
          type: "CNAME",
          host: cleanDomain,
          value: "shopstr.market",
          note: "Add a CNAME record pointing your domain to shopstr.market. Verification may take up to 24 hours after DNS propagation.",
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
    const signedEvent = extractSignedEventFromRequest(req);
    const ownerPubkey = signedEvent?.pubkey ?? "";
    const verification = verifySignedHttpRequestProof(
      signedEvent,
      buildCustomDomainDeleteProof(ownerPubkey)
    );

    if (!verification.ok) {
      return res
        .status(verification.status)
        .json({ error: verification.error });
    }

    try {
      await pool.query("DELETE FROM custom_domains WHERE pubkey = $1", [
        ownerPubkey,
      ]);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Custom domain delete error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
