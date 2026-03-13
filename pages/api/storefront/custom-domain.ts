import type { NextApiRequest, NextApiResponse } from "next";
import { getDbPool } from "@/utils/db/db-service";

const pool = getDbPool();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST") {
    const { pubkey, domain } = req.body;

    if (!pubkey || !domain) {
      return res.status(400).json({ error: "pubkey and domain are required" });
    }

    const cleanDomain = domain.toLowerCase().trim();

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
          value: "milk.market",
          note: "Add a CNAME record pointing your domain to milk.market. Verification may take up to 24 hours after DNS propagation.",
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
    const { pubkey } = req.body;
    if (!pubkey) {
      return res.status(400).json({ error: "pubkey is required" });
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
