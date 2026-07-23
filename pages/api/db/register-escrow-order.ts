import type { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";
import { registerP2pkEscrowOrder } from "@/utils/db/db-service";

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };
const HEX_32_BYTE = /^[0-9a-f]{64}$/;
const ORDER_ID = /^[\x21-\x7e]{1,128}$/;

type EscrowOrderRegistrationBody = {
  orderId: string;
  sellerNostrPubkey: string;
  sellerCashuPubkey: string;
  buyerCashuPubkey: string;
  arbiterCashuPubkey: string;
  amountSats: number;
  locktime: number;
  tokenHash: string;
};

function isRegistrationBody(
  body: unknown
): body is EscrowOrderRegistrationBody {
  if (typeof body !== "object" || body === null) return false;
  const value = body as Partial<EscrowOrderRegistrationBody>;
  return (
    typeof value.orderId === "string" &&
    ORDER_ID.test(value.orderId) &&
    typeof value.sellerNostrPubkey === "string" &&
    HEX_32_BYTE.test(value.sellerNostrPubkey) &&
    typeof value.sellerCashuPubkey === "string" &&
    HEX_32_BYTE.test(value.sellerCashuPubkey) &&
    typeof value.buyerCashuPubkey === "string" &&
    HEX_32_BYTE.test(value.buyerCashuPubkey) &&
    typeof value.arbiterCashuPubkey === "string" &&
    HEX_32_BYTE.test(value.arbiterCashuPubkey) &&
    typeof value.amountSats === "number" &&
    Number.isSafeInteger(value.amountSats) &&
    value.amountSats > 0 &&
    typeof value.locktime === "number" &&
    Number.isSafeInteger(value.locktime) &&
    value.locktime > 0 &&
    typeof value.tokenHash === "string" &&
    HEX_32_BYTE.test(value.tokenHash)
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "register-escrow-order", RATE_LIMIT)) return;

  const auth = await verifyNip98Request(req, "POST");
  if (!auth.ok) {
    return res.status(401).json({ error: auth.error });
  }
  if (!isRegistrationBody(req.body)) {
    return res.status(400).json({ error: "Invalid escrow order commitment" });
  }

  try {
    const result = await registerP2pkEscrowOrder({
      ...req.body,
      buyerNostrPubkey: auth.pubkey,
    });
    if (result === "conflict") {
      return res.status(409).json({
        error: "Escrow order is already registered with different details",
      });
    }
    return res.status(result === "created" ? 201 : 200).json({ success: true });
  } catch (error) {
    console.error("Failed to register escrow order:", error);
    return res.status(500).json({ error: "Failed to register escrow order" });
  }
}
