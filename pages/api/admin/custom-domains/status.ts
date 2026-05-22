import type { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import { setTlsStatus, type TlsStatus } from "@/utils/db/custom-domains";
import { requireAdmin } from "@/utils/admin/auth";

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };

const VALID_STATUSES: TlsStatus[] = [
  "pending_dns",
  "dns_verified",
  "attached",
  "active",
  "failed",
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!applyRateLimit(req, res, "admin-domain-status", RATE_LIMIT)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { domain, tlsStatus } = req.body ?? {};
  if (!domain || !tlsStatus) {
    return res.status(400).json({ error: "domain and tlsStatus are required" });
  }
  if (!VALID_STATUSES.includes(tlsStatus as TlsStatus)) {
    return res.status(400).json({ error: "Invalid tlsStatus" });
  }

  const admin = requireAdmin(req, res, "admin-domain-status", {
    method: "POST",
    path: "/api/admin/custom-domains/status",
    fields: { domain: String(domain).toLowerCase(), tlsStatus },
  });
  if (!admin) return; // requireAdmin already wrote the response

  try {
    await setTlsStatus(String(domain), tlsStatus as TlsStatus);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Admin domain status update error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
