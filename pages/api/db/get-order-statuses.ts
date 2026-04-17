import type { NextApiRequest, NextApiResponse } from "next";
import { getOrderStatuses } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

// Polled by buyer/seller dashboards while orders are open. Generous limit
// so a tab opened on multiple orders does not throttle, but bounded so a
// single client can't keep this hot path saturated.
const RATE_LIMIT = { limit: 600, windowMs: 60 * 1000 };
const MAX_ORDER_IDS_PER_REQUEST = (() => {
  const configured = Number.parseInt(
    process.env.MAX_ORDER_IDS_PER_REQUEST || "",
    10
  );
  return Number.isFinite(configured) && configured > 0 ? configured : 200;
})();
const MAX_ORDER_ID_LENGTH = 128;

function normalizeOrderIds(orderIds: unknown): string[] | null {
  if (typeof orderIds === "string") {
    const trimmed = orderIds.trim();
    return trimmed ? [trimmed] : [];
  }

  if (!Array.isArray(orderIds)) {
    return null;
  }

  const normalized: string[] = [];
  for (const value of orderIds) {
    if (typeof value !== "string") {
      return null;
    }
    // Normalize whitespace to avoid accidental client-side mismatches.
    const trimmed = value.trim();
    if (trimmed) {
      normalized.push(trimmed);
    }
  }

  return normalized;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "get-order-statuses", RATE_LIMIT)) return;

  const orderIds =
    req.method === "POST" ? req.body.orderIds : req.query.orderIds;

  const normalizedOrderIds = normalizeOrderIds(orderIds);
  if (normalizedOrderIds === null) {
    return res.status(400).json({
      error: "Invalid orderIds. Expected a string or array of strings.",
    });
  }

  if (normalizedOrderIds.length === 0) {
    return res.status(200).json({ statuses: {} });
  }

  if (normalizedOrderIds.length > MAX_ORDER_IDS_PER_REQUEST) {
    return res.status(413).json({
      error: `Too many order IDs. Maximum allowed is ${MAX_ORDER_IDS_PER_REQUEST}.`,
    });
  }

  if (normalizedOrderIds.some((id) => id.length > MAX_ORDER_ID_LENGTH)) {
    return res.status(400).json({
      error: `Invalid order ID length. Maximum length is ${MAX_ORDER_ID_LENGTH}.`,
    });
  }

  const orderIdArray = Array.from(new Set(normalizedOrderIds));

  try {
    const statuses = await getOrderStatuses(orderIdArray);
    return res.status(200).json({ statuses });
  } catch (error) {
    console.error("Failed to get order statuses:", error);
    return res.status(500).json({ error: "Failed to get order statuses" });
  }
}
