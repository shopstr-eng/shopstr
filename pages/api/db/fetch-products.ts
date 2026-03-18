import type { NextApiRequest, NextApiResponse } from "next";
import { fetchAllProductsFromDb } from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const products = await fetchAllProductsFromDb();
    res.status(200).json(products);
  } catch (error) {
    console.error("Failed to fetch products from database:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
}
