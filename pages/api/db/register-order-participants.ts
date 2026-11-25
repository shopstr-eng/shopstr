import type { NextApiRequest, NextApiResponse } from "next";
import { type Event, verifyEvent } from "nostr-tools";
import { applyRateLimit } from "@/utils/rate-limit";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";
import {
  fetchProductByDTagAndPubkey,
  registerOrderParticipants,
} from "@/utils/db/db-service";

// A cart checkout registers one order per product, so the per-pubkey limit
// has to cover a large cart; the per-IP limit stays looser for shared NAT.
const PER_IP_LIMIT = { limit: 120, windowMs: 60 * 1000 };
const PER_PUBKEY_LIMIT = { limit: 60, windowMs: 60 * 1000 };

// Checkout order ids are v4 UUIDs (uuidv4 / crypto.randomUUID). Accepting only
// that shape keeps this table out of the server-generated mcp_* namespace and
// rejects guessable ids.
const ORDER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX_32_BYTE = /^[0-9a-f]{64}$/;
const MAX_PRODUCT_ADDRESS_LENGTH = 512;

// Regular listings are referenced by address and resolved from the product
// cache. Zapsnag listings are kind-1 notes the cache does not hold, so the
// buyer sends the signed note and its signature identifies the seller.
type RegisterOrderParticipantsBody =
  | { orderId: string; productAddress: string; productEvent?: undefined }
  | { orderId: string; productEvent: Event; productAddress?: undefined };

type ParsedProductAddress = { sellerPubkey: string; dTag: string };

function isZapsnagNote(value: unknown): value is Event {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Partial<Event>;
  return (
    event.kind === 1 &&
    typeof event.id === "string" &&
    HEX_32_BYTE.test(event.id) &&
    typeof event.pubkey === "string" &&
    HEX_32_BYTE.test(event.pubkey) &&
    typeof event.created_at === "number" &&
    typeof event.content === "string" &&
    typeof event.sig === "string" &&
    Array.isArray(event.tags)
  );
}

function isRegistrationBody(
  body: unknown
): body is RegisterOrderParticipantsBody {
  if (typeof body !== "object" || body === null) return false;
  const value = body as Record<string, unknown>;
  if (typeof value.orderId !== "string" || !ORDER_ID.test(value.orderId)) {
    return false;
  }
  const hasAddress = value.productAddress !== undefined;
  const hasEvent = value.productEvent !== undefined;
  if (hasAddress === hasEvent) return false;
  if (hasAddress) {
    return (
      typeof value.productAddress === "string" &&
      value.productAddress.length <= MAX_PRODUCT_ADDRESS_LENGTH
    );
  }
  return isZapsnagNote(value.productEvent);
}

// `30402:<seller pubkey>:<d tag>`; the d tag itself may contain colons.
function parseProductAddress(address: string): ParsedProductAddress | null {
  const [kind, sellerPubkey, ...dTagParts] = address.split(":");
  const dTag = dTagParts.join(":");
  if (kind !== "30402" || !sellerPubkey || !HEX_32_BYTE.test(sellerPubkey)) {
    return null;
  }
  if (!dTag) return null;
  return { sellerPubkey, dTag };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "register-order-participants:ip", PER_IP_LIMIT))
    return;

  // The buyer is always the authenticated pubkey, never a body field.
  const auth = await verifyNip98Request(req, "POST", req.body);
  if (!auth.ok) {
    return res.status(401).json({ error: auth.error });
  }

  if (
    !applyRateLimit(
      req,
      res,
      "register-order-participants:pubkey",
      PER_PUBKEY_LIMIT,
      auth.pubkey
    )
  )
    return;

  if (!isRegistrationBody(req.body)) {
    return res.status(400).json({ error: "Invalid order registration" });
  }

  const { orderId } = req.body;
  let sellerPubkey: string;
  let productReference: string;
  let parsedAddress: ParsedProductAddress | null = null;

  if (req.body.productEvent) {
    if (!verifyEvent(req.body.productEvent)) {
      return res.status(400).json({ error: "Invalid product event" });
    }
    sellerPubkey = req.body.productEvent.pubkey;
    productReference = req.body.productEvent.id;
  } else {
    parsedAddress = parseProductAddress(req.body.productAddress);
    if (!parsedAddress) {
      return res.status(400).json({ error: "Invalid product address" });
    }
    sellerPubkey = parsedAddress.sellerPubkey;
    productReference = req.body.productAddress;
  }

  // A seller buying from themselves would hold both roles, which the status
  // rules cannot tell apart.
  if (sellerPubkey === auth.pubkey) {
    return res
      .status(400)
      .json({ error: "Buyer and seller must be different" });
  }

  try {
    if (parsedAddress) {
      // The seller comes from a signature-verified listing in the product
      // cache, not from anything the buyer asserts.
      const product = await fetchProductByDTagAndPubkey(
        parsedAddress.dTag,
        parsedAddress.sellerPubkey,
        { rethrow: true }
      );
      if (!product || product.pubkey !== sellerPubkey) {
        return res.status(404).json({ error: "Product not found" });
      }
    }

    const result = await registerOrderParticipants({
      orderId,
      buyerPubkey: auth.pubkey,
      sellerPubkey,
      productAddress: productReference,
    });
    if (result === "conflict") {
      return res.status(409).json({
        error: "Order is already registered with different participants",
      });
    }
    return res.status(result === "created" ? 201 : 200).json({
      success: true,
      orderId,
      buyerPubkey: auth.pubkey,
      sellerPubkey,
    });
  } catch (error) {
    console.error("Failed to register order participants:", error);
    return res
      .status(500)
      .json({ error: "Failed to register order participants" });
  }
}
