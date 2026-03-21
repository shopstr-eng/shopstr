import type { NextApiRequest, NextApiResponse } from "next";
import { getDbPool } from "@/utils/db/db-service";
import dns from "dns";
import { promisify } from "util";

const resolveCname = promisify(dns.resolveCname);
const resolve4 = promisify(dns.resolve4);

const pool = getDbPool();

const VALID_TARGETS = ["shopstr.market", "shopstr.store"];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { pubkey } = req.body;
  if (!pubkey) {
    return res.status(400).json({ error: "pubkey is required" });
  }

  try {
    const result = await pool.query(
      "SELECT domain FROM custom_domains WHERE pubkey = $1",
      [pubkey]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No custom domain found" });
    }

    const domain = result.rows[0].domain;
    let verified = false;

    try {
      const cnameRecords = await resolveCname(domain);
      verified = cnameRecords.some((record: string) =>
        VALID_TARGETS.some((target) =>
          record.toLowerCase().endsWith(target.toLowerCase())
        )
      );
    } catch {
      try {
        const shopstrIps = await resolve4("shopstr.market");
        const domainIps = await resolve4(domain);
        verified = domainIps.some((ip: string) => shopstrIps.includes(ip));
      } catch {
        verified = false;
      }
    }

    if (verified) {
      await pool.query(
        "UPDATE custom_domains SET verified = true, updated_at = NOW() WHERE pubkey = $1",
        [pubkey]
      );
    }

    return res.status(200).json({
      domain,
      verified,
      message: verified
        ? "Domain verified successfully!"
        : "DNS records not found yet. Make sure your CNAME record points to shopstr.market and wait for DNS propagation (can take up to 48 hours).",
    });
  } catch (error) {
    console.error("Domain verification error:", error);
    return res.status(500).json({ error: "Verification failed" });
  }
}
