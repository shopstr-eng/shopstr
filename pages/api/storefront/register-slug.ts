import type { NextApiRequest, NextApiResponse } from "next";
import { getDbPool } from "@/utils/db/db-service";

const pool = getDbPool();

function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 63);
}

const RESERVED_SLUGS = [
  "www",
  "api",
  "app",
  "admin",
  "mail",
  "ftp",
  "shop",
  "marketplace",
  "settings",
  "orders",
  "cart",
  "listing",
  "auth",
  "onboarding",
  "wallet",
  "communities",
  "help",
  "support",
  "blog",
  "docs",
  "status",
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "DELETE") {
    const { pubkey } = req.body;
    if (!pubkey) {
      return res.status(400).json({ error: "pubkey is required" });
    }
    try {
      await pool.query("DELETE FROM shop_slugs WHERE pubkey = $1", [pubkey]);
      await pool.query("DELETE FROM custom_domains WHERE pubkey = $1", [
        pubkey,
      ]);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Delete slug error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { pubkey, slug } = req.body;

  if (!pubkey || !slug) {
    return res.status(400).json({ error: "pubkey and slug are required" });
  }

  const sanitized = sanitizeSlug(slug);

  if (!sanitized || sanitized.length < 2) {
    return res
      .status(400)
      .json({ error: "Slug must be at least 2 characters" });
  }

  if (RESERVED_SLUGS.includes(sanitized)) {
    return res.status(400).json({ error: "This shop name is reserved" });
  }

  try {
    await pool.query(
      `INSERT INTO shop_slugs (pubkey, slug) 
       VALUES ($1, $2) 
       ON CONFLICT (pubkey) DO UPDATE SET slug = $2, updated_at = NOW()`,
      [pubkey, sanitized]
    );

    return res.status(200).json({ slug: sanitized });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "This shop name is already taken" });
    }
    console.error("Register slug error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
