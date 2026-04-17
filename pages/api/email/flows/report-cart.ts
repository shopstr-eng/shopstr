import { NextApiRequest, NextApiResponse } from "next";
import { getDbPool } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "email-flows-report-cart", RATE_LIMIT)) return;

  const { seller_pubkey, buyer_email, buyer_pubkey, cart_items } = req.body;

  if (!seller_pubkey || !buyer_email || !cart_items) {
    return res.status(400).json({
      error: "seller_pubkey, buyer_email, and cart_items are required",
    });
  }

  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();

    await client.query(
      `INSERT INTO cart_reports (seller_pubkey, buyer_email, buyer_pubkey, cart_items, reported_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (seller_pubkey, buyer_email)
       DO UPDATE SET cart_items = $4, reported_at = NOW(), enrolled = FALSE`,
      [
        seller_pubkey,
        buyer_email,
        buyer_pubkey || null,
        JSON.stringify(cart_items),
      ]
    );

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Error reporting cart activity:", error);
    return res.status(500).json({ error: "Failed to report cart activity" });
  } finally {
    if (client) client.release();
  }
}
