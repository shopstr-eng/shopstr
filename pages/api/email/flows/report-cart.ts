import { NextApiRequest, NextApiResponse } from "next";
import { getDbPool } from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
    if (error?.message?.includes("cart_reports")) {
      try {
        if (client) {
          await client.query(`
            CREATE TABLE IF NOT EXISTS cart_reports (
              id SERIAL PRIMARY KEY,
              seller_pubkey TEXT NOT NULL,
              buyer_email TEXT NOT NULL,
              buyer_pubkey TEXT,
              cart_items JSONB NOT NULL,
              reported_at TIMESTAMP NOT NULL DEFAULT NOW(),
              enrolled BOOLEAN DEFAULT FALSE,
              UNIQUE(seller_pubkey, buyer_email)
            )
          `);
          await client.query(
            `CREATE INDEX IF NOT EXISTS idx_cart_reports_reported_at ON cart_reports(reported_at)`
          );
          await client.query(
            `CREATE INDEX IF NOT EXISTS idx_cart_reports_enrolled ON cart_reports(enrolled)`
          );

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
        }
      } catch (retryError) {
        console.error("Error creating cart_reports table:", retryError);
      }
    }
    console.error("Error reporting cart activity:", error);
    return res.status(500).json({ error: "Failed to report cart activity" });
  } finally {
    if (client) client.release();
  }
}
