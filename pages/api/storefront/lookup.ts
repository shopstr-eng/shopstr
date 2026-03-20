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

  const { slug } = req.query;

  if (!slug || typeof slug !== "string") {
    return res.status(400).json({ error: "slug parameter required" });
  }

  try {
    const result = await pool.query(
      "SELECT pubkey FROM shop_slugs WHERE slug = $1",
      [slug.toLowerCase().trim()]
    );

    if (result.rows.length > 0) {
      return res.status(200).json({ pubkey: result.rows[0].pubkey });
    }

    return res.status(404).json({ pubkey: null });
  } catch (error) {
    console.error("Slug lookup error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
