import type { NextApiRequest, NextApiResponse } from "next";
import { fetchAllWalletEventsFromDb } from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { pubkey } = req.query;
    if (typeof pubkey !== "string") {
      return res.status(400).json({ error: "Invalid pubkey parameter" });
    }

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
    const kinds = parseCsv(req.query.kinds)
      .map((kind) => Number(kind))
      .filter((kind) => Number.isFinite(kind));

    const walletEvents = await fetchAllWalletEventsFromDb(pubkey, {
      kinds,
      since: parseNumber(req.query.since),
      limit: parseNumber(req.query.limit),
    });
    res.status(200).json(walletEvents);
  } catch (error) {
    console.error("Failed to fetch wallet events from database:", error);
    res.status(500).json({ error: "Failed to fetch wallet events" });
  }
}
