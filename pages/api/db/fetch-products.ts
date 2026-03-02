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
    const parseCsv = (value: string | string[] | undefined): string[] => {
      if (!value) return [];
      const joined = Array.isArray(value) ? value.join(",") : value;
      return joined
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    };
    const parseNumber = (
      value: string | string[] | undefined
    ): number | undefined => {
      if (!value) return undefined;
      const raw = Array.isArray(value) ? value[0] : value;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const products = await fetchAllProductsFromDb({
      pubkeys: parseCsv(req.query.pubkeys),
      since: parseNumber(req.query.since),
      until: parseNumber(req.query.until),
      limit: parseNumber(req.query.limit),
    });
    res.status(200).json(products);
  } catch (error) {
    console.error("Failed to fetch products from database:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
}
