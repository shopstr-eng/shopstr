import type { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import { listDomains } from "@/utils/db/custom-domains";
import { isAdminPubkey } from "@/utils/admin/auth";
import { verifyNostrAuth } from "@/utils/stripe/verify-nostr-auth";

const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

const ALLOWED_STATUSES = [
  "pending_dns",
  "dns_verified",
  "attached",
  "active",
  "failed",
  "needs_attach",
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!applyRateLimit(req, res, "admin-custom-domains", RATE_LIMIT)) return;

  const filter = typeof req.query.status === "string" ? req.query.status : "";

  // Authorization: either
  //   (a) server-to-server bearer secret, OR
  //   (b) signed Nostr event from an admin pubkey, sent either as POST body
  //       or as `?signedEvent=<json>` query param for the GET admin page.
  const headerSecret = req.headers["x-admin-secret"];
  const envSecret = process.env.ADMIN_API_SECRET;

  if (envSecret && headerSecret === envSecret) {
    // ok — server-to-server
  } else {
    let signedEvent: any = null;
    if (req.method === "POST") {
      signedEvent = req.body?.signedEvent ?? null;
    } else if (typeof req.query.signedEvent === "string") {
      try {
        signedEvent = JSON.parse(req.query.signedEvent);
      } catch {
        signedEvent = null;
      }
    }

    if (!signedEvent) {
      return res.status(401).json({ error: "Admin authentication required" });
    }

    const result = verifyNostrAuth(
      signedEvent,
      undefined,
      "admin-domain-list" as any,
      {
        method: req.method as any,
        path: "/api/admin/custom-domains",
      } as any
    );
    if (!result.valid) {
      return res
        .status(401)
        .json({ error: result.error || "Invalid admin auth" });
    }
    if (!isAdminPubkey(result.pubkey)) {
      return res.status(403).json({ error: "Not an admin" });
    }
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rows = await listDomains(
    ALLOWED_STATUSES.includes(filter) ? { status: filter as any } : undefined
  );

  return res.status(200).json({
    domains: rows.map((r) => ({
      domain: r.domain,
      pubkey: r.pubkey,
      shopSlug: r.shop_slug,
      verified: r.verified,
      domainType: r.domain_type,
      tlsStatus: r.tls_status,
      verificationToken: r.verification_token,
      attachedAt: r.attached_at,
      adminNotifiedAt: r.admin_notified_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
}
