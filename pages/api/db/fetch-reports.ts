import type { NextApiRequest, NextApiResponse } from "next";
import { fetchRelevantReportsFromDb } from "@/utils/db/db-service";

function normalizeQueryParam(value: string | string[] | undefined): string[] {
  if (!value) return [];

  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const productIds = normalizeQueryParam(req.query.e);
    const profilePubkeys = normalizeQueryParam(req.query.p);
    const reports = await fetchRelevantReportsFromDb(productIds, profilePubkeys);
    res.status(200).json(reports);
  } catch (error) {
    console.error("Failed to fetch reports from database:", error);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
}
