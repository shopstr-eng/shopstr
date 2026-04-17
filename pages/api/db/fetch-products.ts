import type { NextApiRequest, NextApiResponse } from "next";
import {
  fetchAllProductsFromDb,
  fetchProductsByPubkeyFromDb,
} from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

export const config = {
  api: {
    responseLimit: false,
  },
};

// Generous per-IP cap. Marketplace listings are loaded by every visitor and
// during reconnect storms; the limit is high enough to never bite a real
// browser while still preventing a single scraper from monopolising the
// shared Postgres pool.
const RATE_LIMIT = { limit: 600, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "fetch-products", RATE_LIMIT)) return;

  try {
    const { pubkey } = req.query;
    const limit = Math.min(
      parseInt((req.query.limit as string) || "500", 10) || 500,
      1000
    );
    const offset = Math.max(
      parseInt((req.query.offset as string) || "0", 10) || 0,
      0
    );
    let products;
    if (pubkey && typeof pubkey === "string") {
      products = await fetchProductsByPubkeyFromDb(pubkey, limit, offset);
    } else {
      products = await fetchAllProductsFromDb(limit, offset);
    }
    res.status(200).json(products);
  } catch (error) {
    console.error("Failed to fetch products from database:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
}
