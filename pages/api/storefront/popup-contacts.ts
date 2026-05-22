import type { NextApiRequest, NextApiResponse } from "next";
import { getPopupEmailCapturesBySeller } from "@/utils/db/db-service";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";
import { applyRateLimit } from "@/utils/rate-limit";

const PER_IP_LIMIT = { limit: 60, windowMs: 60 * 1000 };
const PER_PUBKEY_LIMIT = { limit: 60, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "popup-contacts:ip", PER_IP_LIMIT)) return;

  const authResult = await verifyNip98Request(req, "GET");
  if (!authResult.ok) {
    return res.status(401).json({ error: authResult.error });
  }

  if (
    !applyRateLimit(
      req,
      res,
      "popup-contacts:pubkey",
      PER_PUBKEY_LIMIT,
      authResult.pubkey
    )
  )
    return;

  try {
    const rows = await getPopupEmailCapturesBySeller(authResult.pubkey);
    return res.status(200).json({
      contacts: rows.map((r) => ({
        email: r.email,
        phone: r.phone,
        discountCode: r.discount_code,
        discountPercentage: Number(r.discount_percentage),
        timesUsed: r.times_used,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    console.error("Failed to load popup contacts:", error);
    return res.status(500).json({ error: "Failed to load contacts" });
  }
}
