import type { NextApiRequest, NextApiResponse } from "next";
import {
  getOrderParticipantsForOrders,
  getOrderStatuses,
} from "@/utils/db/db-service";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";
import { applyRateLimit } from "@/utils/rate-limit";
import { parseOrderIdList } from "@/utils/orders/order-id-list";
import { getOrderRole } from "@/utils/orders/order-status-rules";

// Polled by buyer/seller dashboards while orders are open. Generous limit
// so a tab opened on multiple orders does not throttle, but bounded so a
// single client can't keep this hot path saturated.
const RATE_LIMIT = { limit: 600, windowMs: 60 * 1000 };
const PER_PUBKEY_LIMIT = { limit: 300, windowMs: 60 * 1000 };

// Statuses are returned only for orders the authenticated caller is a party
// to. Participants resolve the same way status writes are authorized
// (including the legacy fallback for orders placed before order_participants).
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "get-order-statuses", RATE_LIMIT)) return;

  const auth = await verifyNip98Request(req, req.method);
  if (!auth.ok) {
    return res.status(401).json({ error: auth.error });
  }

  if (
    !applyRateLimit(
      req,
      res,
      "get-order-statuses:pubkey",
      PER_PUBKEY_LIMIT,
      auth.pubkey
    )
  )
    return;

  const orderIds =
    req.method === "POST" ? req.body?.orderIds : req.query.orderIds;

  const parsed = parseOrderIdList(orderIds);
  if (!parsed.ok) {
    return res.status(parsed.status).json({ error: parsed.error });
  }

  if (parsed.orderIds.length === 0) {
    return res.status(200).json({ statuses: {} });
  }

  try {
    const participants = await getOrderParticipantsForOrders(parsed.orderIds, {
      includeLegacy: true,
    });
    const visibleOrderIds = parsed.orderIds.filter((orderId) => {
      const orderParticipants = participants.get(orderId);
      return (
        orderParticipants !== undefined &&
        getOrderRole(auth.pubkey, orderParticipants) !== null
      );
    });

    const statuses = await getOrderStatuses(visibleOrderIds);
    return res.status(200).json({ statuses });
  } catch (error) {
    console.error("Failed to get order statuses:", error);
    return res.status(500).json({ error: "Failed to get order statuses" });
  }
}
