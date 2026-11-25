import { createNip98AuthorizationHeader } from "@/utils/nostr/nip98-auth";
import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import type { ProductData } from "@/utils/parsers/product-parser-functions";
import { MAX_ORDER_IDS_PER_REQUEST } from "@/utils/orders/order-id-list";

export type TrustedOrderParticipants = {
  buyerPubkey: string;
  sellerPubkey: string;
  source: string;
};

// Zapsnag listings are kind-1 notes the server does not cache, so the signed
// note itself is sent; regular listings are referenced by their address and
// looked up in the server's product cache.
function buildRegistrationProduct(
  product: Pick<ProductData, "pubkey" | "d" | "rawEvent">
): { productAddress: string } | { productEvent: object } | null {
  if (product.rawEvent?.kind === 1) {
    return { productEvent: product.rawEvent };
  }
  if (product.d) {
    return { productAddress: `30402:${product.pubkey}:${product.d}` };
  }
  return null;
}

// Records the buyer and seller of a new order on the server. Must run before
// the order id leaves this device (order DMs, tokens), because anyone who
// knows an unregistered id can claim it. Failure never blocks checkout: the
// order still goes through, it just has no server-side participant record,
// so this resolves to false instead of throwing.
export async function registerOrderParticipantsOnServer(
  signer: NostrSigner | undefined,
  orderId: string,
  product: Pick<ProductData, "pubkey" | "d" | "rawEvent">
): Promise<boolean> {
  const registrationProduct = buildRegistrationProduct(product);
  if (!signer || !registrationProduct) {
    console.warn(
      `Order ${orderId} was not registered: missing signer or product reference.`
    );
    return false;
  }

  try {
    const body = JSON.stringify({ orderId, ...registrationProduct });
    const url = `${window.location.origin}/api/db/register-order-participants`;
    const authorization = await createNip98AuthorizationHeader(
      signer,
      url,
      "POST",
      body
    );
    const response = await fetch("/api/db/register-order-participants", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body,
    });

    if (!response.ok) {
      const responseBody = await response.json().catch(() => null);
      console.warn(
        `Order ${orderId} was not registered:`,
        responseBody?.error ?? response.status
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`Order ${orderId} was not registered:`, error);
    return false;
  }
}

// Trusted buyer/seller for the caller's own orders, from authoritative server
// records only. Orders missing from the result are unresolved: their status
// messages must not change anything. Failures resolve to what was loaded so
// far rather than throwing.
export async function fetchOrderParticipants(
  signer: NostrSigner,
  orderIds: string[]
): Promise<Record<string, TrustedOrderParticipants>> {
  const participants: Record<string, TrustedOrderParticipants> = {};
  const url = `${window.location.origin}/api/db/get-order-participants`;

  for (let i = 0; i < orderIds.length; i += MAX_ORDER_IDS_PER_REQUEST) {
    const body = JSON.stringify({
      orderIds: orderIds.slice(i, i + MAX_ORDER_IDS_PER_REQUEST),
    });
    try {
      const authorization = await createNip98AuthorizationHeader(
        signer,
        url,
        "POST",
        body
      );
      const response = await fetch("/api/db/get-order-participants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authorization,
        },
        body,
      });
      if (!response.ok) {
        console.warn("Failed to load order participants:", response.status);
        continue;
      }
      const data = await response.json();
      Object.assign(participants, data?.participants ?? {});
    } catch (error) {
      console.warn("Failed to load order participants:", error);
    }
  }

  return participants;
}
