import type { NextApiRequest, NextApiResponse } from "next";
import {
  fetchAllProductsFromDb,
  fetchProductsByPubkeyFromDb,
} from "@/utils/db/db-service";

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
