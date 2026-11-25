import type { NextApiRequest, NextApiResponse } from "next";
import { getOrderParticipantsForOrders } from "@/utils/db/db-service";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";
import { applyRateLimit } from "@/utils/rate-limit";
import { parseOrderIdList } from "@/utils/orders/order-id-list";
import { getOrderRole } from "@/utils/orders/order-status-rules";

// Loaded by the Orders dashboard alongside order statuses.
const PER_IP_LIMIT = { limit: 600, windowMs: 60 * 1000 };
const PER_PUBKEY_LIMIT = { limit: 300, windowMs: 60 * 1000 };

// Returns the trusted buyer/seller of each requested order the caller is a
// party to. Only authoritative records are used: orders resolvable only from
// legacy message tags are omitted, so clients treat them as unresolved rather
// than trusting sender-written tags. Orders the caller is not part of are
// omitted too, so nothing is revealed about other people's orders.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "get-order-participants:ip", PER_IP_LIMIT))
    return;

  const auth = await verifyNip98Request(req, "POST", req.body);
  if (!auth.ok) {
    return res.status(401).json({ error: auth.error });
  }

  if (
    !applyRateLimit(
      req,
      res,
      "get-order-participants:pubkey",
      PER_PUBKEY_LIMIT,
      auth.pubkey
    )
  )
    return;

  const parsed = parseOrderIdList(req.body?.orderIds);
  if (!parsed.ok) {
    return res.status(parsed.status).json({ error: parsed.error });
  }

  try {
    const resolved = await getOrderParticipantsForOrders(parsed.orderIds, {
      includeLegacy: false,
    });

    const participants: Record<
      string,
      { buyerPubkey: string; sellerPubkey: string; source: string }
    > = {};
    for (const [orderId, orderParticipants] of resolved) {
      if (getOrderRole(auth.pubkey, orderParticipants)) {
        participants[orderId] = orderParticipants;
      }
    }

    return res.status(200).json({ participants });
  } catch (error) {
    console.error("Failed to get order participants:", error);
    return res.status(500).json({ error: "Failed to get order participants" });
  }
}
