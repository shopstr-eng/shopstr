import type { NextApiRequest, NextApiResponse } from "next";
import { fetchRelevantReportsFromDb } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 600, windowMs: 60 * 1000 };
const MAX_TARGETS_PER_PARAM = 100;
const REPORT_FETCH_LIMIT = 500;
const HEX_32_BYTES = /^[0-9a-f]{64}$/i;

function normalizeQueryParam(
  name: "e" | "p",
  value: string | string[] | undefined
): string[] {
  if (!value) return [];

  const values = Array.isArray(value) ? value : [value];
  const normalizedValues = values
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (normalizedValues.length > MAX_TARGETS_PER_PARAM) {
    throw new Error(`Too many ${name} parameters`);
  }

  const uniqueValues = Array.from(
    new Set(normalizedValues.map((entry) => entry.toLowerCase()))
  );

  if (uniqueValues.some((entry) => !HEX_32_BYTES.test(entry))) {
    throw new Error(`Invalid ${name} parameter`);
  }

  return uniqueValues;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "fetch-reports", RATE_LIMIT)) return;

  try {
    const productIds = normalizeQueryParam("e", req.query.e);
    const profilePubkeys = normalizeQueryParam("p", req.query.p);
    const reports = await fetchRelevantReportsFromDb(
      productIds,
      profilePubkeys,
      REPORT_FETCH_LIMIT
    );
    res.status(200).json(reports);
  } catch (error) {
    if (error instanceof Error && error.message.includes("parameter")) {
      return res.status(400).json({ error: error.message });
    }

    console.error("Failed to fetch reports from database:", error);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
}
