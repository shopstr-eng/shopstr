import type { NextApiRequest, NextApiResponse } from "next";
import { getDbPool } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

const pool = getDbPool();

// Hit on every storefront page render (slug + custom-domain resolution).
// Generous to cover normal browsing; tight enough to bound a crawler.
const RATE_LIMIT = { limit: 600, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "storefront-lookup", RATE_LIMIT)) return;

  const { slug, domain } = req.query;

  try {
    if (domain && typeof domain === "string") {
      const result = await pool.query(
        "SELECT pubkey, shop_slug FROM custom_domains WHERE domain = $1 AND verified = true",
        [domain.toLowerCase()]
      );
      if (result.rows.length > 0) {
        return res.status(200).json({
          pubkey: result.rows[0].pubkey,
          shopSlug: result.rows[0].shop_slug,
        });
      }
      return res.status(404).json({ error: "Domain not found" });
    }

    if (slug && typeof slug === "string") {
      const result = await pool.query(
        "SELECT pubkey FROM shop_slugs WHERE slug = $1",
        [slug.toLowerCase()]
      );
      if (result.rows.length > 0) {
        return res.status(200).json({ pubkey: result.rows[0].pubkey });
      }
      return res.status(404).json({ error: "Stall not found" });
    }

    return res.status(400).json({ error: "slug or domain parameter required" });
  } catch (error) {
    console.error("Storefront lookup error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
