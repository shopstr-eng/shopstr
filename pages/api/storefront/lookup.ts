import type { NextApiRequest, NextApiResponse } from "next";
import { getDbPool } from "@/utils/db/db-service";

const pool = getDbPool();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { slug, pubkey } = req.query;

  try {
    // Lookup by pubkey — used by the settings form to pre-load existing config
    if (pubkey && typeof pubkey === "string") {
      const result = await pool.query(
        `SELECT ss.slug, pe.content AS profile_content
         FROM profile_events pe
         LEFT JOIN shop_slugs ss ON ss.pubkey = pe.pubkey
         WHERE pe.pubkey = $1 AND pe.kind = 30019
         ORDER BY pe.created_at DESC
         LIMIT 1`,
        [pubkey]
      );

      if (result.rows.length > 0) {
        const { slug: foundSlug, profile_content } = result.rows[0];
        let shopConfig = null;
        if (profile_content) {
          try {
            shopConfig = JSON.parse(profile_content);
          } catch {}
        }
        return res.status(200).json({ pubkey, slug: foundSlug, shopConfig });
      }

      return res.status(200).json({ pubkey, slug: null, shopConfig: null });
    }

    // Lookup by slug — used by the storefront page
    if (!slug || typeof slug !== "string") {
      return res
        .status(400)
        .json({ error: "slug or pubkey parameter required" });
    }

    const result = await pool.query(
      `SELECT ss.pubkey, pe.content AS profile_content
       FROM shop_slugs ss
       LEFT JOIN profile_events pe
         ON pe.pubkey = ss.pubkey AND pe.kind = 30019
       WHERE ss.slug = $1
       ORDER BY pe.created_at DESC NULLS LAST
       LIMIT 1`,
      [slug.toLowerCase().trim()]
    );

    if (result.rows.length > 0) {
      const { pubkey: foundPubkey, profile_content } = result.rows[0];
      let shopConfig = null;
      if (profile_content) {
        try {
          shopConfig = JSON.parse(profile_content);
        } catch {}
      }
      return res.status(200).json({ pubkey: foundPubkey, shopConfig });
    }

    return res.status(404).json({ pubkey: null, shopConfig: null });
  } catch (error) {
    console.error("Slug lookup error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
