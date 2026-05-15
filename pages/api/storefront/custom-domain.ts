import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import dns from "dns";
import { promisify } from "util";
import { getDbPool } from "@/utils/db/db-service";
import { verifyNostrAuth } from "@/utils/stripe/verify-nostr-auth";
import { checkRateLimit, getRequestIp } from "@/utils/rate-limit";
import {
  classifyDomain,
  deleteDomainByPubkey,
  getDomainByPubkey,
  isValidDomain,
  markAdminNotified,
  upsertPendingDomain,
} from "@/utils/db/custom-domains";
import { sendCustomDomainAdminNotification } from "@/utils/email/email-service";

const pool = getDbPool();

const RATE_LIMIT = { limit: 20, windowMs: 60 * 1000 };

const ADMIN_EMAIL = process.env.DOMAINS_ADMIN_EMAIL || "domains@milk.market";
const REPLIT_DEPLOYMENT_HOST =
  process.env.REPLIT_DEPLOYMENT_HOST || "milk-market.replit.app";
const APEX_RESOLVE_HOST = (
  process.env.CUSTOM_DOMAIN_APEX_HOST || "milk.market"
).toLowerCase();

const resolve4 = promisify(dns.resolve4);

let cachedApexIps: { ips: string[]; at: number } | null = null;
const APEX_IP_TTL_MS = 5 * 60 * 1000;

async function getApexIps(): Promise<string[]> {
  // Allow operator-supplied list (highest priority).
  const envList = (process.env.CUSTOM_DOMAIN_APEX_IPS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (envList.length > 0) return envList;

  if (cachedApexIps && Date.now() - cachedApexIps.at < APEX_IP_TTL_MS) {
    return cachedApexIps.ips;
  }
  try {
    const ips = await resolve4(APEX_RESOLVE_HOST);
    cachedApexIps = { ips, at: Date.now() };
    return ips;
  } catch {
    return [];
  }
}

async function buildInstructions(domain: string, token: string) {
  const type = classifyDomain(domain);
  const apexIps = await getApexIps();
  const apexValue =
    apexIps.length > 0
      ? apexIps.join(", ")
      : `Resolve A record of ${APEX_RESOLVE_HOST} and use those IPs (or contact ${ADMIN_EMAIL}).`;
  return {
    domainType: type,
    txt: {
      type: "TXT",
      host: `_milkmarket.${domain}`,
      value: token,
      note: "Add this TXT record to prove you own the domain. Required.",
    },
    subdomain: {
      type: "CNAME",
      host: domain,
      value: REPLIT_DEPLOYMENT_HOST,
      note: "Use this if you're connecting a subdomain (e.g. shop.yourdomain.com).",
    },
    apex: {
      type: "A",
      host: domain,
      value: apexValue,
      note: `Use this if you're connecting your root domain (e.g. yourdomain.com). Add an A record for each IP shown. Some DNS providers also support ALIAS/ANAME records pointing to ${APEX_RESOLVE_HOST}.`,
    },
    recommended: type === "apex" ? "apex" : "subdomain",
  };
}

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

    const cleanDomain = String(domain).toLowerCase().trim();
    if (!isValidDomain(cleanDomain)) {
      return res.status(400).json({ error: "Invalid domain format" });
    }

    const authResult = verifyNostrAuth(
      signedEvent,
      pubkey,
      "custom-domain-write" as any,
      {
        method: "POST",
        path: "/api/storefront/custom-domain",
        fields: { domain: cleanDomain },
      } as any
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
    const shopSlug = slugResult.rows[0].slug as string;

    const verificationToken = crypto.randomBytes(16).toString("hex");
    const domainType = classifyDomain(cleanDomain);

    try {
      const row = await upsertPendingDomain({
        pubkey,
        domain: cleanDomain,
        shopSlug,
        domainType,
        verificationToken,
      });

      // Best-effort admin notification (don't block on email).
      sendCustomDomainAdminNotification(ADMIN_EMAIL, {
        domain: cleanDomain,
        domainType,
        shopSlug,
        sellerPubkey: pubkey,
        verificationToken,
      })
        .then((ok) => {
          if (ok) markAdminNotified(pubkey).catch(() => {});
        })
        .catch((err) => {
          console.error("Failed to send admin domain notification:", err);
        });

      return res.status(200).json({
        domain: cleanDomain,
        verified: false,
        domainType,
        verificationToken,
        tlsStatus: row.tls_status,
        instructions: await buildInstructions(cleanDomain, verificationToken),
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
      const row = await getDomainByPubkey(pubkey);
      if (!row) return res.status(200).json(null);
      return res.status(200).json({
        domain: row.domain,
        verified: row.verified,
        domainType: row.domain_type,
        verificationToken: row.verification_token,
        tlsStatus: row.tls_status,
        attachedAt: row.attached_at,
        createdAt: row.created_at,
        instructions: row.verification_token
          ? await buildInstructions(row.domain, row.verification_token)
          : null,
      });
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
      "custom-domain-write" as any,
      { method: "DELETE", path: "/api/storefront/custom-domain" } as any
    );
    if (!authResult.valid) {
      return res
        .status(401)
        .json({ error: authResult.error || "Authentication failed" });
    }

    try {
      await deleteDomainByPubkey(pubkey);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Custom domain delete error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
