import type { NextApiRequest, NextApiResponse } from "next";
import { fetchAllProductsFromDb, getEventCount } from "@/utils/db/db-service";
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

function parseStringArrayParam(
  value: string | string[] | undefined
): string[] | undefined {
  if (!value) return undefined;

  const rawValues = Array.isArray(value) ? value : value.split(",");
  const parsed = rawValues.map((entry) => entry.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : undefined;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "fetch-products", RATE_LIMIT)) return;

  try {
    const {
      limit,
      offset,
      until,
      since,
      pubkey,
      search,
      categories,
      location,
      excludePubkeys,
    } = req.query;

    const limitNum = Math.min(
      parseInt((limit as string) || "500", 10) || 500,
      1000
    );
    const offsetNum = Math.max(parseInt((offset as string) || "0", 10) || 0, 0);

    const categoriesArray = parseStringArrayParam(
      categories as string | string[] | undefined
    );
    const pubkeys = parseStringArrayParam(
      pubkey as string | string[] | undefined
    );
    const excludedPubkeys = parseStringArrayParam(
      excludePubkeys as string | string[] | undefined
    );
    const pubkeyFilter = pubkeys && pubkeys.length === 1 ? pubkeys[0] : pubkeys;

    const filters = {
      limit: limitNum,
      offset: offsetNum,
      until: until ? parseInt(until as string, 10) : undefined,
      since: since ? parseInt(since as string, 10) : undefined,
      pubkey: pubkeyFilter,
      search: search as string,
      categories: categoriesArray,
      location: location as string,
      excludePubkeys: excludedPubkeys,
    };

    const countFilters = {
      pubkey: pubkeyFilter,
      search: search as string,
      categories: categoriesArray,
      location: location as string,
      excludePubkeys: excludedPubkeys,
    };

    const [products, total] = await Promise.all([
      fetchAllProductsFromDb(filters),
      getEventCount(countFilters),
    ]);

    res.status(200).json({
      events: products,
      total,
    });
  } catch (error) {
    console.error("Failed to fetch products from database:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
}
